import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import TaskDB from "./taskDb.js";
import GitHubClient from "./githubClient.js";
import multer from "multer";

// Updated OpenAI SDK import
import OpenAI from "openai";

// Token counting
import { encoding_for_model } from "tiktoken";

// Added axios import to fix require() error:
import axios from "axios";

const db = new TaskDB();
console.debug("[Server Debug] Checking or setting default 'ai_model' in DB...");
const currentModel = db.getSetting("ai_model");
if (!currentModel) {
  console.debug("[Server Debug] 'ai_model' is missing in DB, setting default to 'gpt-3.5-turbo'.");
  db.setSetting("ai_model", "gpt-3.5-turbo");
} else {
  console.debug("[Server Debug] 'ai_model' found =>", currentModel);
}

const app = express();

/**
 * Returns a configured OpenAI client, depending on "ai_service" setting.
 * Added checks to help diagnose missing or invalid API keys.
 */
function getOpenAiClient() {
  const service = db.getSetting("ai_service") || "openai";
  const openAiKey = process.env.OPENAI_API_KEY || "";
  const openRouterKey = process.env.OPENROUTER_API_KEY || "";

  console.debug("[Server Debug] Creating OpenAI client with service =", service);

  if (service === "openrouter") {
    if (!openRouterKey) {
      throw new Error(
        "Missing OPENROUTER_API_KEY environment variable, please set it before using OpenRouter."
      );
    }
    // Use openrouter.ai
    console.debug("[Server Debug] Using openrouter.ai with provided OPENROUTER_API_KEY.");
    return new OpenAI({
      apiKey: openRouterKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "Alfe-DevAgent",
        "X-Title": "Alfe Dev",
      },
    });
  } else {
    if (!openAiKey) {
      throw new Error(
        "Missing OPENAI_API_KEY environment variable, please set it before using OpenAI."
      );
    }
    // Default to openai
    console.debug("[Server Debug] Using openai with provided OPENAI_API_KEY.");
    return new OpenAI({
      apiKey: openAiKey,
    });
  }
}

function getEncoding(modelName) {
  console.debug("[Server Debug] Attempting to load tokenizer for model =>", modelName);
  try {
    return encoding_for_model(modelName);
  } catch (e) {
    console.debug("[Server Debug] Tokenizer load failed, falling back to gpt-3.5-turbo =>", e.message);
    return encoding_for_model("gpt-3.5-turbo");
  }
}

function countTokens(encoder, text) {
  return encoder.encode(text || "").length;
}

// Explicit CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET","POST","PUT","DELETE","OPTIONS","HEAD"],
  allowedHeaders: ["Content-Type","Authorization","Accept","X-Requested-With","Origin"]
}));

// Handle preflight requests
app.options("*", cors({
  origin: "*",
  methods: ["GET","POST","PUT","DELETE","OPTIONS","HEAD"],
  allowedHeaders: ["Content-Type","Authorization","Accept","X-Requested-With","Origin"]
}), (req, res) => {
  res.sendStatus(200);
});

app.use(bodyParser.json());

// Determine uploads directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "../uploads");
try {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("[Server Debug] Ensured uploads directory exists at", uploadsDir);
} catch (err) {
  console.error("[Server Debug] Error creating uploads folder:", err);
}

// Serve static files
app.use("/uploads", express.static(uploadsDir));

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// GET /api/tasks
app.get("/api/tasks", (req, res) => {
  console.debug("[Server Debug] GET /api/tasks called.");
  try {
    const includeHidden =
      req.query.includeHidden === "1" ||
      req.query.includeHidden === "true";
    console.debug("[Server Debug] includeHidden =", includeHidden);
    const tasks = db.listTasks(includeHidden);
    console.debug("[Server Debug] Found tasks =>", tasks.length);
    res.json(tasks);
  } catch (err) {
    console.error("[TaskQueue] /api/tasks failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/projects
app.get("/api/projects", (req, res) => {
  console.debug("[Server Debug] GET /api/projects called.");
  try {
    const projects = db.listProjects();
    console.debug("[Server Debug] Found projects =>", projects.length);
    res.json(projects);
  } catch (err) {
    console.error("[TaskQueue] /api/projects failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/sprints
app.get("/api/sprints", (req, res) => {
  console.debug("[Server Debug] GET /api/sprints called.");
  try {
    const sprints = db.listSprints();
    console.debug("[Server Debug] Found sprints =>", sprints.length);
    res.json(sprints);
  } catch (err) {
    console.error("[TaskQueue] /api/sprints failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Manage project base branches
app.get("/api/projectBranches", (req, res) => {
  console.debug("[Server Debug] GET /api/projectBranches called.");
  try {
    const result = db.listProjectBranches();
    console.debug("[Server Debug] Found projectBranches =>", result.length);
    res.json(result);
  } catch (err) {
    console.error("[TaskQueue] GET /api/projectBranches error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/projectBranches", (req, res) => {
  console.debug("[Server Debug] POST /api/projectBranches called.");
  try {
    const { data } = req.body; // expects { project, base_branch }
    if (!Array.isArray(data)) {
      console.debug("[Server Debug] Provided data is not an array =>", data);
      return res.status(400).json({ error: "Must provide an array of branch data." });
    }
    data.forEach((entry) => {
      db.upsertProjectBranch(entry.project, entry.base_branch || "");
    });
    db.logActivity("Update project branches", JSON.stringify(data));
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/projectBranches error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/projectBranches/:project", (req, res) => {
  console.debug("[Server Debug] DELETE /api/projectBranches called =>", req.params.project);
  try {
    const project = req.params.project;
    db.deleteProjectBranch(project);
    db.logActivity("Delete project branch", project);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] DELETE /api/projectBranches/:project error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/hidden
app.post("/api/tasks/hidden", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/hidden called => body:", req.body);
  try {
    const { id, hidden } = req.body;
    db.setHidden(id, hidden);
    db.logActivity("Set hidden", JSON.stringify({ id, hidden }));
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/hidden failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/reorder
app.post("/api/tasks/reorder", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/reorder => body:", req.body);
  try {
    const { id, direction } = req.body;
    const ok = db.reorderTask(id, direction);
    if (ok) {
      db.logActivity("Reorder task", JSON.stringify({ id, direction }));
      res.json({ success: true });
    } else {
      res.status(400).json({ error: "Unable to reorder" });
    }
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/reorder failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/reorderAll
app.post("/api/tasks/reorderAll", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/reorderAll => body:", req.body);
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: "orderedIds must be an array" });
    }
    db.reorderAll(orderedIds);
    db.logActivity("Reorder all tasks", JSON.stringify({ orderedIds }));
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/reorderAll failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/points
app.post("/api/tasks/points", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/points => body:", req.body);
  try {
    const { id, points } = req.body;
    db.setPoints(id, points);
    db.logActivity("Set fib_points", JSON.stringify({ id, points }));
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/points failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/project
app.post("/api/tasks/project", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/project => body:", req.body);
  try {
    const { id, project } = req.body;
    db.setProject(id, project);
    db.logActivity("Set project", JSON.stringify({ id, project }));
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/project failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/sprint
app.post("/api/tasks/sprint", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/sprint => body:", req.body);
  try {
    const { id, sprint } = req.body;
    db.setSprint(id, sprint);
    db.logActivity("Set sprint", JSON.stringify({ id, sprint }));
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/sprint failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/priority
app.post("/api/tasks/priority", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/priority => body:", req.body);
  try {
    const { id, priority } = req.body;
    const oldTask = db.getTaskById(id);
    const oldPriority = oldTask?.priority || null;

    db.setPriority(id, priority);

    db.logActivity(
      "Set priority",
      JSON.stringify({ id, from: oldPriority, to: priority })
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/priority failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/status
app.post("/api/tasks/status", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/status => body:", req.body);
  try {
    const { id, status } = req.body;
    db.setStatus(id, status);
    db.logActivity("Set status", JSON.stringify({ id, status }));
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/status failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/dependencies
app.post("/api/tasks/dependencies", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/dependencies => body:", req.body);
  try {
    const { id, dependencies } = req.body;
    db.setDependencies(id, dependencies);
    db.logActivity("Set dependencies", JSON.stringify({ id, dependencies }));
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/dependencies failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/blocking
app.post("/api/tasks/blocking", (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/blocking => body:", req.body);
  try {
    const { id, blocking } = req.body;
    db.setBlocking(id, blocking);
    db.logActivity("Set blocking", JSON.stringify({ id, blocking }));
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/blocking failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create new GitHub issue and upsert
app.post("/api/tasks/new", async (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/new => body:", req.body);
  try {
    const { title, body } = req.body;
    if (!title) {
      return res.status(400).json({ error: "Title required" });
    }

    const gh = new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO
    });

    const newIssue = await gh.createIssue(title, body || "");
    db.upsertIssue(newIssue, `${gh.owner}/${gh.repo}`);
    db.logActivity("New task", JSON.stringify({ title, body }));

    const defaultProject = db.getSetting("default_project");
    const defaultSprint = db.getSetting("default_sprint");
    if (defaultProject) db.setProjectByGithubId(newIssue.id, defaultProject);
    if (defaultSprint) db.setSprintByGithubId(newIssue.id, defaultSprint);

    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/tasks/new error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/settings/:key
app.get("/api/settings/:key", (req, res) => {
  console.debug("[Server Debug] GET /api/settings/:key =>", req.params.key);
  try {
    const val = db.getSetting(req.params.key);
    res.json({ key: req.params.key, value: val });
  } catch (err) {
    console.error("[TaskQueue] GET /api/settings/:key failed", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/settings
app.post("/api/settings", (req, res) => {
  console.debug("[Server Debug] POST /api/settings => body:", req.body);
  try {
    const { key, value } = req.body;
    db.setSetting(key, value);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/settings failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/tasks/:id
app.get("/api/tasks/:id", (req, res) => {
  console.debug("[Server Debug] GET /api/tasks/:id =>", req.params.id);
  try {
    const taskId = parseInt(req.params.id, 10);
    if (Number.isNaN(taskId)) {
      return res.status(400).json({ error: "Invalid task ID" });
    }
    const t = db.getTaskById(taskId);
    if (!t) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(t);
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/:id failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/projects/:project
app.get("/api/projects/:project", (req, res) => {
  console.debug("[Server Debug] GET /api/projects/:project =>", req.params.project);
  try {
    const tasks = db.listTasksByProject(req.params.project);
    res.json(tasks);
  } catch (err) {
    console.error("[TaskQueue] /api/projects/:project failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/sprints/:sprint
app.get("/api/sprints/:sprint", (req, res) => {
  console.debug("[Server Debug] GET /api/sprints/:sprint =>", req.params.sprint);
  try {
    const tasks = db.listTasksBySprint(req.params.sprint);
    res.json(tasks);
  } catch (err) {
    console.error("[TaskQueue] /api/sprints/:sprint failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/rename
app.post("/api/tasks/rename", async (req, res) => {
  console.debug("[Server Debug] POST /api/tasks/rename => body:", req.body);
  try {
    const { id, newTitle } = req.body;
    if (!id || !newTitle) {
      return res.status(400).json({ error: "Missing id or newTitle" });
    }
    const task = db.getTaskById(id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const gh = new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO
    });
    await gh.updateIssueTitle(task.number, newTitle);

    db.setTitle(id, newTitle);
    db.logActivity("Rename task", JSON.stringify({ id, newTitle }));

    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/rename error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/activity
app.get("/api/activity", (req, res) => {
  console.debug("[Server Debug] GET /api/activity called.");
  try {
    const activity = db.getActivity();
    res.json(activity);
  } catch (err) {
    console.error("[TaskQueue] /api/activity failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/*
  Updated /api/ai/models to try returning known token limits for recognized models
  and "N/A" as fallback instead of "varies".
*/
app.get("/api/ai/models", async (req, res) => {
  console.debug("[Server Debug] GET /api/ai/models called.");

  // A dictionary of known approximate token limits
  const knownTokenLimits = {
    "openai/codex-mini": 200000,
    "openai/o4-mini-high": 200000,
    "openai/o3": 200000,
    "openai/o4-mini": 200000,
    "openai/gpt-4.1": 1047576,
    "openai/gpt-4.1-mini": 1047576,
    "openai/gpt-4.1-nano": 1047576,
    "openai/o1-pro": 200000,
    "openai/gpt-4o-mini-search-preview": 128000,
    "openai/gpt-4o-search-preview": 128000,
    "openai/gpt-4.5-preview": 128000,
    "openai/o3-mini-high": 200000,
    "openai/o3-mini": 200000,
    "openai/o1": 200000,
    "openai/gpt-4o-2024-11-20": 128000,
    "openai/o1-preview": 128000,
    "openai/o1-preview-2024-09-12": 128000,
    "openai/o1-mini": 128000,
    "openai/o1-mini-2024-09-12": 128000,
    "openai/chatgpt-4o-latest": 128000,
    "openai/gpt-4o-2024-08-06": 128000,
    "openai/gpt-4o-mini": 128000,
    "openai/gpt-4o-mini-2024-07-18": 128000,
    "openai/gpt-4o": 128000,
    "openai/gpt-4o:extended": 128000,
    "openai/gpt-4o-2024-05-13": 128000,
    "openai/gpt-4-turbo": 128000,
    "openai/gpt-4-turbo-preview": 128000,
    "openai/gpt-3.5-turbo-1106": 16385,
    "openai/gpt-4-1106-preview": 128000,
    "openai/gpt-3.5-turbo-instruct": 4095,
    "openai/gpt-3.5-turbo-16k": 16385,
    "openai/gpt-4-32k": 32767,
    "openai/gpt-4-32k-0314": 32767,
    "openai/gpt-3.5-turbo": 16385,
    "openai/gpt-3.5-turbo-0125": 16385,
    "openai/gpt-4": 8191,
    "openai/gpt-4-0314": 8191
  };

  try {
    const service = db.getSetting("ai_service") || "openai";
    if (service === "openai") {
      const openaiClient = getOpenAiClient();
      const modelList = await openaiClient.models.list();
      const modelIds = modelList.data.map((m) => m.id).sort();
      // Return array of objects with { id, tokenLimit }
      const modelData = modelIds.map((id) => ({
        id,
        tokenLimit: knownTokenLimits[id] !== undefined ? knownTokenLimits[id] : "N/A"
      }));
      res.json({ service: "openai", models: modelData });
    } else {
      // Fallback or for openrouter
      const openRouterKey = process.env.OPENROUTER_API_KEY || "";
      if (!openRouterKey) {
        return res.status(500).json({
          error: "Missing OPENROUTER_API_KEY environment variable; cannot list models."
        });
      }
      const orResp = await axios.get("https://openrouter.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          "HTTP-Referer": "Alfe-DevAgent",
          "X-Title": "Alfe Dev",
        },
      });
      const rawModels = orResp.data?.data?.map((m) => m.id).sort() || [];
      const modelData = rawModels.map((id) => ({
        id,
        tokenLimit: knownTokenLimits[id] !== undefined ? knownTokenLimits[id] : "N/A"
      }));
      res.json({ service: "openrouter", models: modelData });
    }
  } catch (err) {
    console.error("[TaskQueue] /api/ai/models error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Updated /api/chat for chunk-splitting & token counting
app.post("/api/chat", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat => body:", req.body);
  try {
    const userMessage = req.body.message || "";
    const chatTabId = req.body.tabId || 1;
    const userTime = req.body.userTime || new Date().toISOString();

    if (!userMessage) {
      return res.status(400).send("Missing message");
    }

    // Gather entire conversation
    const priorPairs = db.getAllChatPairs(chatTabId);
    let model = db.getSetting("ai_model");
    const savedInstructions = db.getSetting("agent_instructions") || "";
    const systemContext = `System Context:\n${savedInstructions}\n\nModel: ${model}\nUserTime: ${userTime}\nTimeZone: Central`;

    const conversation = [{ role: "system", content: systemContext }];

    for (const p of priorPairs) {
      conversation.push({ role: "user", content: p.user_text });
      if (p.ai_text) {
        conversation.push({ role: "assistant", content: p.ai_text });
      }
    }

    // Insert user message
    const chatPairId = db.createChatPair(userMessage, chatTabId, systemContext);
    conversation.push({ role: "user", content: userMessage });
    db.logActivity("User chat", JSON.stringify({ tabId: chatTabId, message: userMessage, userTime }));

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    console.debug("[Server Debug] Chat conversation assembled with length =>", conversation.length);

    const openaiClient = getOpenAiClient();
    if (!model) {
      model = "unknown"; // Reverted fallback to gpt-3.5-turbo
    }

    console.debug("[Server Debug] Using model =>", model);
    const encoder = getEncoding(model);

    // We'll measure tokens until it's under ~7000
    let convTokens = 0;
    let truncatedConversation = [];
    // We'll keep the systemContext pinned
    truncatedConversation.push(conversation[0]);
    // Then accumulate from the last pairs
    const remainder = conversation.slice(1).reverse();

    for (const msg of remainder) {
      const chunkTokens = countTokens(encoder, msg.content) + 4;
      if ((convTokens + chunkTokens) > 7000) {
        break;
      }
      truncatedConversation.unshift(msg);
      convTokens += chunkTokens;
    }

    console.debug("[Server Debug] Truncated conversation length =>", truncatedConversation.length);

    let assistantMessage = "";
    const stream = await openaiClient.chat.completions.create({
      model,
      messages: truncatedConversation,
      stream: true
    });

    console.debug("[Server Debug] AI streaming started...");

    for await (const part of stream) {
      const chunk = part.choices?.[0]?.delta?.content || "";
      if (chunk.includes("[DONE]")) {
        break;
      }
      assistantMessage += chunk;
      res.write(chunk);
    }

    res.end();
    console.debug("[Server Debug] AI streaming finished, total length =>", assistantMessage.length);

    // Final token counting
    const systemTokens = countTokens(encoder, systemContext);
    let prevAssistantTokens = 0;
    let historyTokens = 0;
    for (const p of priorPairs) {
      historyTokens += countTokens(encoder, p.user_text);
      prevAssistantTokens += countTokens(encoder, p.ai_text || "");
    }

    const inputTokens = countTokens(encoder, userMessage);
    const finalAssistantTokens = countTokens(encoder, assistantMessage);

    const total =
      systemTokens + historyTokens + inputTokens + prevAssistantTokens + finalAssistantTokens;

    const tokenInfo = {
      systemTokens,
      historyTokens,
      inputTokens,
      assistantTokens: prevAssistantTokens,
      finalAssistantTokens,
      total
    };

    db.finalizeChatPair(chatPairId, assistantMessage, model, new Date().toISOString(), JSON.stringify(tokenInfo));
    db.logActivity("AI chat", JSON.stringify({ tabId: chatTabId, response: assistantMessage, tokenInfo }));
  } catch (err) {
    console.error("[TaskQueue] /api/chat (stream) error:", err);
    if (!res.headersSent) {
      res.status(500).send("Internal server error");
    }
  }
});

// GET /api/chat/history
app.get("/api/chat/history", (req, res) => {
  console.debug("[Server Debug] GET /api/chat/history =>", req.query);
  try {
    const tabId = parseInt(req.query.tabId || "1", 10);
    const chatPairs = db.getAllChatPairs(tabId);
    res.json(chatPairs);
  } catch (err) {
    console.error("[TaskQueue] /api/chat/history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Provide the current model
app.get("/api/model", (req, res) => {
  console.debug("[Server Debug] GET /api/model called.");
  let m = db.getSetting("ai_model");
  // Reverted fallback: no forced "gpt-3.5-turbo" here
  res.json({ model: m });
});

// Chat tabs
app.get("/api/chat/tabs", (req, res) => {
  console.debug("[Server Debug] GET /api/chat/tabs => listing all tabs.");
  try {
    const tabs = db.listChatTabs();
    res.json(tabs);
  } catch (err) {
    console.error("[TaskQueue] GET /api/chat/tabs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/new", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/new =>", req.body);
  try {
    let name = req.body.name || "Untitled";

    const autoNaming = db.getSetting("chat_tab_auto_naming");
    const projectName = db.getSetting("sterling_project") || "";
    if (autoNaming && projectName) {
      name = `${projectName}: ${name}`;
    }

    const tabId = db.createChatTab(name);
    res.json({ success: true, id: tabId });
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/tabs/new error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/rename", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/rename =>", req.body);
  try {
    const { tabId, newName } = req.body;
    if (!tabId || !newName) {
      return res.status(400).json({ error: "Missing tabId or newName" });
    }
    db.renameChatTab(tabId, newName);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/tabs/rename error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/chat/tabs/:id", (req, res) => {
  console.debug("[Server Debug] DELETE /api/chat/tabs =>", req.params.id);
  try {
    const tabId = parseInt(req.params.id, 10);
    if (!tabId) {
      return res.status(400).json({ error: "Invalid tabId" });
    }
    db.deleteChatTab(tabId);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] DELETE /api/chat/tabs/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Return entire conversation for a pair
app.get("/pair/:id", (req, res) => {
  console.debug("[Server Debug] GET /pair/:id =>", req.params.id);
  const pairId = parseInt(req.params.id, 10);
  if (Number.isNaN(pairId)) return res.status(400).send("Invalid pair ID");
  const pair = db.getPairById(pairId);
  if (!pair) return res.status(404).send("Pair not found");
  const allPairs = db.getAllChatPairs(pair.chat_tab_id);
  res.json({
    pair,
    conversation: allPairs
  });
});

// GET /api/time
app.get("/api/time", (req, res) => {
  console.debug("[Server Debug] GET /api/time => returning server time.");
  const now = new Date();
  res.json({
    time: now.toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }),
    iso: now.toISOString()
  });
});

// Implement file upload
app.post("/api/upload", upload.single("myfile"), (req, res) => {
  console.debug("[Server Debug] POST /api/upload => File info:", req.file);
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  db.logActivity("File upload", JSON.stringify({ filename: req.file.originalname }));
  res.json({ success: true, file: req.file });
});

// Provide list of uploaded files
app.get("/api/upload/list", (req, res) => {
  console.debug("[Server Debug] GET /api/upload/list => listing files.");
  try {
    const fileNames = fs.readdirSync(uploadsDir);
    res.json(fileNames);
  } catch (err) {
    console.error("[Server Debug] /api/upload/list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.use(express.static(path.join(__dirname, "../public")));

// Serve test_projects page
app.get("/test_projects", (req, res) => {
  console.debug("[Server Debug] GET /test_projects => Serving test_projects.html");
  res.sendFile(path.join(__dirname, "../public/test_projects.html"));
});

// Serve activity page
app.get("/activity", (req, res) => {
  console.debug("[Server Debug] GET /activity => Serving activity.html");
  res.sendFile(path.join(__dirname, "../public/activity.html"));
});

// Serve new AI Models page
app.get("/ai_models", (req, res) => {
  console.debug("[Server Debug] GET /ai_models => Serving ai_models.html");
  res.sendFile(path.join(__dirname, "../public/ai_models.html"));
});

// Delete a single chat pair
app.delete("/api/chat/pair/:id", (req, res) => {
  console.debug("[Server Debug] DELETE /api/chat/pair =>", req.params.id);
  try {
    const pairId = parseInt(req.params.id, 10);
    if (Number.isNaN(pairId)) {
      return res.status(400).json({ error: "Invalid pair ID" });
    }
    db.deleteChatPair(pairId);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] DELETE /api/chat/pair/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// "Create Sterling Chat" single response
app.post("/api/createSterlingChat", async (req, res) => {
  db.logActivity("Create Sterling Chat", "User triggered createSterlingChat endpoint.");

  try {
    const baseURL = 'http://localhost:3444/api';
    const project = db.getSetting("sterling_project") || "alfe-dev_test_repo";
    const projectName = "aurora_working-" + project;

    console.log('=== Testing createChat endpoint ===');
    const createChatResponse = await axios.post(`${baseURL}/createChat`, {
      repoName: projectName
    });
    console.log('Response from /createChat:', createChatResponse.data);

    console.log('=== Test run completed. ===');

    const sterlingUrl = `http://localhost:3444/${encodeURIComponent(projectName)}/chat/${createChatResponse.data.newChatNumber}`;
    db.setSetting("sterling_chat_url", sterlingUrl);

    res.json({
      success: true,
      message: "Sterling chat created.",
      repoName: projectName,
      newChatNumber: createChatResponse.data.newChatNumber,
      sterlingUrl
    });
  } catch (error) {
    console.error('Error during API tests:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rename project
app.post("/api/projects/rename", (req, res) => {
  console.debug("[Server Debug] POST /api/projects/rename =>", req.body);
  try {
    const { oldProject, newProject } = req.body;
    if (!oldProject || !newProject) {
      return res.status(400).json({ error: "Missing oldProject or newProject" });
    }
    db.renameProject(oldProject, newProject);
    db.logActivity("Rename project", JSON.stringify({ oldProject, newProject }));
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/projects/rename error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[TaskQueue] Web server is running on port ${PORT} (verbose='true')`);
});
