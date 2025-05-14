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

// Updated OpenAI SDK import and initialization
import OpenAI from "openai";

// Token counting
import { encoding_for_model } from "tiktoken";

// Added axios import to fix require() error:
import axios from "axios";

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ""
});

function getEncoding(modelName) {
  try {
    return encoding_for_model(modelName);
  } catch {
    // fallback
    return encoding_for_model("gpt-3.5-turbo");
  }
}

function countTokens(encoder, text) {
  return encoder.encode(text || "").length;
}

const db = new TaskDB();
const app = express();
app.use(cors());
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

// Serve static files from /uploads so they can be opened in the browser
app.use("/uploads", express.static(uploadsDir));

// Multer storage (keep file extension)
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
  try {
    const includeHidden =
      req.query.includeHidden === "1" ||
      req.query.includeHidden === "true";
    res.json(db.listTasks(includeHidden));
  } catch (err) {
    console.error("[TaskQueue] /api/tasks failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/projects
app.get("/api/projects", (req, res) => {
  try {
    res.json(db.listProjects());
  } catch (err) {
    console.error("[TaskQueue] /api/projects failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/sprints
app.get("/api/sprints", (req, res) => {
  try {
    res.json(db.listSprints());
  } catch (err) {
    console.error("[TaskQueue] /api/sprints failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// New: Manage project base branches
app.get("/api/projectBranches", (req, res) => {
  try {
    const result = db.listProjectBranches();
    res.json(result);
  } catch (err) {
    console.error("[TaskQueue] GET /api/projectBranches error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/projectBranches", (req, res) => {
  try {
    const { data } = req.body; // expects { project, base_branch }
    if (!Array.isArray(data)) {
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
  try {
    const activity = db.getActivity();
    res.json(activity);
  } catch (err) {
    console.error("[TaskQueue] /api/activity failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Updated /api/chat for chunk-splitting logic & token counting
app.post("/api/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || "";
    const chatTabId = req.body.tabId || 1;
    const userTime = req.body.userTime || new Date().toISOString();

    if (!userMessage) {
      return res.status(400).send("Missing message");
    }

    // Gather entire conversation history
    const priorPairs = db.getAllChatPairs(chatTabId);
    const model = process.env.OPENAI_MODEL || "o3-mini";
    const savedInstructions = db.getSetting("agent_instructions") || "";
    const systemContext = `System Context:\n${savedInstructions}\n\nModel: ${model}\nUserTime: ${userTime}\nTimeZone: Central`;

    const conversation = [{ role: "system", content: systemContext }];

    // Add all previous user/assistant messages
    for (const p of priorPairs) {
      conversation.push({ role: "user", content: p.user_text });
      if (p.ai_text) {
        conversation.push({ role: "assistant", content: p.ai_text });
      }
    }

    // Insert user message into chat_pairs table (pending AI response)
    const chatPairId = db.createChatPair(userMessage, chatTabId, systemContext);

    // Finally, push the latest user message
    conversation.push({ role: "user", content: userMessage });

    // Log user chat
    db.logActivity("User chat", JSON.stringify({ tabId: chatTabId, message: userMessage, userTime }));

    // Start streaming response
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    let assistantMessage = "";
    const stream = await openaiClient.chat.completions.create({
      model,
      messages: conversation,
      stream: true
    });

    for await (const part of stream) {
      const chunk = part.choices?.[0]?.delta?.content || "";
      if (chunk.includes("[DONE]")) {
        break;
      }
      assistantMessage += chunk;
      res.write(chunk);
    }

    res.end();

    // Now let's calculate token usage
    const encoder = getEncoding(model);
    let systemTokens = countTokens(encoder, systemContext);
    let userTokens = 0;
    let prevAssistantTokens = 0;
    for (const p of priorPairs) {
      userTokens += countTokens(encoder, p.user_text);
      prevAssistantTokens += countTokens(encoder, p.ai_text || "");
    }
    userTokens += countTokens(encoder, userMessage);
    const finalAssistantTokens = countTokens(encoder, assistantMessage);

    const total = systemTokens + userTokens + prevAssistantTokens + finalAssistantTokens;
    const tokenInfo = {
      systemTokens,
      userTokens,
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

// New route: get all stored chat pairs for a tab
app.get("/api/chat/history", (req, res) => {
  try {
    const tabId = parseInt(req.query.tabId || "1", 10);
    const chatPairs = db.getAllChatPairs(tabId);
    res.json(chatPairs);
  } catch (err) {
    console.error("[TaskQueue] /api/chat/history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Provide the current openai model
app.get("/api/model", (req, res) => {
  const model = process.env.OPENAI_MODEL || "o3-mini";
  res.json({ model });
});

// Chat tabs API
app.get("/api/chat/tabs", (req, res) => {
  try {
    const tabs = db.listChatTabs();
    res.json(tabs);
  } catch (err) {
    console.error("[TaskQueue] GET /api/chat/tabs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/new", (req, res) => {
  try {
    let name = req.body.name || "Untitled";

    // NEW: If chat_tab_auto_naming is enabled and we have a project name, auto-format
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

// Modified route: returns the entire conversation for this pair's tab
app.get("/pair/:id", (req, res) => {
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

// FIX: New route that returns server time in 12-hour format
app.get("/api/time", (req, res) => {
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
  console.log("[Server Debug] File upload request:", req.file);
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  db.logActivity("File upload", JSON.stringify({ filename: req.file.originalname }));
  res.json({ success: true, file: req.file });
});

// Provide list of uploaded files
app.get("/api/upload/list", (req, res) => {
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
  res.sendFile(path.join(__dirname, "../public/test_projects.html"));
});

// Serve activity page
app.get("/activity", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/activity.html"));
});

// New route to delete a single chat pair
app.delete("/api/chat/pair/:id", (req, res) => {
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

// New endpoint for "Create Sterling Chat"
app.post("/api/createSterlingChat", (req, res) => {
  db.logActivity("Create Sterling Chat", "User triggered createSterlingChat endpoint.");

  (async () => {
    const baseURL = 'http://localhost:3444/api';

    try {
      // Retrieve the user-specified sterling_project from settings
      const projectName = "aurora_working-" + db.getSetting("sterling_project") || "alfe-dev_test_repo";

      console.log('=== Testing createChat endpoint ===');
      const createChatResponse = await axios.post(`${baseURL}/createChat`, {
        repoName: projectName
      });
      console.log('Response from /createChat:', createChatResponse.data);

      console.log('=== Testing createGenericChat endpoint ===');
      const createGenericChatResponse = await axios.post(`${baseURL}/createGenericChat`, {
        message: 'Hello from test script!'
      });
      console.log('Response from /createGenericChat:', createGenericChatResponse.data);

      console.log('=== Testing createSterlingChat endpoint ===');
      const createSterlingResponse = await axios.post(`${baseURL}/createSterlingChat`, {});
      console.log('Response from /createSterlingChat:', createSterlingResponse.data);

    } catch (error) {
      console.error('Error during API tests:', error.message);
    }

    console.log('=== Test run completed. ===');
  })();

  res.json({ success: true, message: "Sterling chat created." });
});

// New route: rename project
app.post("/api/projects/rename", (req, res) => {
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
