import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import GitHubClient from "./githubClient.js";
import TaskQueue from "./taskQueue.js";
import TaskDB from "./taskDb.js";

dotenv.config();

/**
 * Create a timestamped backup of issues.sqlite (if it exists).
 */
function backupDb() {
  const dbPath = path.resolve("issues.sqlite");
  if (!fs.existsSync(dbPath)) {
    console.log("[TaskQueue] No existing DB to backup (first run).");
    return;
  }

  const backupsDir = path.resolve("backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  // ISO string is filesystem-friendly after removing colon/period characters.
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupsDir, `issues-${ts}.sqlite`);

  fs.copyFileSync(dbPath, backupPath);
  console.log(`[TaskQueue] Backup created: ${backupPath}`);
}

async function main() {
  try {
    // ------------------------------------------------------------------
    // 0. Safety first – create backup
    // ------------------------------------------------------------------
    backupDb();

    const client = new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO
    });

    const db = new TaskDB(); // creates/open issues.sqlite in cwd
    const queue = new TaskQueue();

    const label = process.env.GITHUB_LABEL;
    console.log(
        `[TaskQueue] Fetching tasks from GitHub ${
            label ? `(label='${label}')` : "(all open issues)"
        } …`
    );

    const issues = client.fetchOpenIssues(label?.trim() || undefined);

    issues.then(async (resolvedIssues) => {
      // Build full repository slug once
      const repositorySlug = `${client.owner}/${client.repo}`;

      // ------------------------------------------------------------------
      // 1. Synchronise local DB
      // ------------------------------------------------------------------
      resolvedIssues.forEach((iss) => db.upsertIssue(iss, repositorySlug));

      // Closed issue detection
      const openIds = resolvedIssues.map((i) => i.id);
      db.markClosedExcept(openIds);

      // ------------------------------------------------------------------
      // 2. Populate in-memory queue (only open issues)
      resolvedIssues.forEach((issue) => queue.enqueue(issue));

      console.log(`[TaskQueue] ${queue.size()} task(s) in queue.`);
      queue.print();

      // Debug: show DB snapshot (can be removed)
      console.debug("[TaskQueue] Current DB state:", db.dump());
    });
  } catch (err) {
    console.error("Fatal:", err.message);
    process.exit(1);
  }
}

main();

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { encoding_for_model } from "tiktoken";
import axios from "axios";
import os from "os";
import child_process from "child_process";

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
  let service = db.getSetting("ai_service") || "openai";
  const openAiKey = process.env.OPENAI_API_KEY || "";
  const openRouterKey = process.env.OPENROUTER_API_KEY || "";

  console.debug("[Server Debug] Creating OpenAI client with service =", service);

  // Removed forced override for deepseek models.

  if (service === "openrouter") {
    if (!openRouterKey) {
      throw new Error(
          "Missing OPENROUTER_API_KEY environment variable, please set it before using OpenRouter."
      );
    }
    // Use openrouter.ai with app name and referer
    console.debug("[Server Debug] Using openrouter.ai with provided OPENROUTER_API_KEY.");
    return new OpenAI({
      apiKey: openRouterKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "X-Title": "MyAwesomeApp",
        "HTTP-Referer": "https://my-awesome-app.example.com"
      }
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
      apiKey: openAiKey
    });
  }
}

function parseProviderModel(model) {
  if (!model) return { provider: "Unknown", shortModel: "Unknown" };
  if (model.startsWith("openai/")) {
    return { provider: "openai", shortModel: model.replace(/^openai\//, "") };
  } else if (model.startsWith("openrouter/")) {
    return { provider: "openrouter", shortModel: model.replace(/^openrouter\//, "") };
  } else if (model.startsWith("deepseek/")) {
    // Changed to treat deepseek/ as openrouter
    return { provider: "openrouter", shortModel: model.replace(/^deepseek\//, "") };
  }
  return { provider: "Unknown", shortModel: model };
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

// Database calls and API routes

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
  We combine both OpenAI and OpenRouter models (if available),
  prefixing IDs with "openai/" or "openrouter/",
  plus a static set of DeepSeek models for demonstration.
*/
app.get("/api/ai/models", async (req, res) => {
  console.debug("[Server Debug] GET /api/ai/models called.");

  const knownTokenLimits = {
    "openai/gpt-4o-mini": 128000,
    "openai/gpt-4.1": 1047576,
    "openai/gpt-4.1-mini": 1047576,
    "openai/gpt-4.1-nano": 1047576,
    "openai/o4-mini": 200000,
    "openai/gpt-4o": 128000,
    "openai/gpt-4o-2024-11-20": 128000,
    "openai/o4-mini-high": 200000,
    "openai/gpt-4o-mini-2024-07-18": 128000,
    "openai/o3-mini": 200000,
    "openai/chatgpt-4o-latest": 128000,
    "openai/gpt-4o-2024-08-06": 128000,
    "openai/o3": 200000,
    "openai/gpt-3.5-turbo": 16385,
    "openai/o3-mini-high": 200000,
    "openai/o1": 200000,
    "openai/gpt-4o-search-preview": 128000,
    "openai/gpt-4-turbo": 128000,
    "openai/gpt-4.5-preview": 128000,
    "openai/o1-mini": 128000,
    "openai/gpt-4o-2024-05-13": 128000,
    "openai/gpt-3.5-turbo-0125": 16385,
    "openai/gpt-4-1106-preview": 128000,
    "openai/gpt-4": 8191,
    "openai/gpt-4o-mini-search-preview": 128000,
    "openai/gpt-3.5-turbo-1106": 16385,
    "openai/codex-mini-latest": 200000,
    "openai/o1-preview-2024-09-12": 128000,
    "openai/gpt-3.5-turbo-0613": 4095,
    "openai/gpt-4-turbo-preview": 128000,
    "openai/o1-preview": 128000,
    "openai/gpt-3.5-turbo-instruct": 4095,
    "openai/o1-mini-2024-09-12": 128000,
    "openai/gpt-4o:extended": 128000,
    "openai/gpt-3.5-turbo-16k": 16385,
    "openai/gpt-4-32k": 32767,
    "openai/o1-pro": 200000,
    "openai/gpt-4-0314": 8191,
    "openai/gpt-4-32k-0314": 32767,
    "openai/gpt-4-vision-preview": 128000,
    "openai/gpt-3.5-turbo-0301": "--"
  };

  const knownCosts = {
    "openai/gpt-4o-mini": { input: "$0.15", output: "$0.60" },
    "openai/gpt-4.1": { input: "$2", output: "$8" },
    "openai/gpt-4.1-mini": { input: "$0.40", output: "$1.60" },
    "openai/gpt-4.1-nano": { input: "$0.10", output: "$0.40" },
    "openai/o4-mini": { input: "$1.10", output: "$4.40" },
    "openai/gpt-4o": { input: "$2.50", output: "$10" },
    "openai/gpt-4o-2024-11-20": { input: "$2.50", output: "$10" },
    "openai/o4-mini-high": { input: "$1.10", output: "$4.40" },
    "openai/gpt-4o-mini-2024-07-18": { input: "$0.15", output: "$0.60" },
    "openai/o3-mini": { input: "$1.10", output: "$4.40" },
    "openai/chatgpt-4o-latest": { input: "$5", output: "$15" },
    "openai/gpt-4o-2024-08-06": { input: "$2.50", output: "$10" },
    "openai/o3": { input: "$10", output: "$40" },
    "openai/gpt-3.5-turbo": { input: "$0.50", output: "$1.50" },
    "openai/o3-mini-high": { input: "$1.10", output: "$4.40" },
    "openai/o1": { input: "$15", output: "$60" },
    "openai/gpt-4o-search-preview": { input: "$2.50", output: "$10" },
    "openai/gpt-4-turbo": { input: "$10", output: "$30" },
    "openai/gpt-4.5-preview": { input: "$75", output: "$150" },
    "openai/o1-mini": { input: "$1.10", output: "$4.40" },
    "openai/gpt-4o-2024-05-13": { input: "$5", output: "$15" },
    "openai/gpt-3.5-turbo-0125": { input: "$0.50", output: "$1.50" },
    "openai/gpt-4-1106-preview": { input: "$10", output: "$30" },
    "openai/gpt-4": { input: "$30", output: "$60" },
    "openai/gpt-4o-mini-search-preview": { input: "$0.15", output: "$0.60" },
    "openai/gpt-3.5-turbo-1106": { input: "$1", output: "$2" },
    "openai/codex-mini-latest": { input: "$1.50", output: "$6" },
    "openai/o1-preview-2024-09-12": { input: "$15", output: "$60" },
    "openai/gpt-3.5-turbo-0613": { input: "$1", output: "$2" },
    "openai/gpt-4-turbo-preview": { input: "$10", output: "$30" },
    "openai/o1-preview": { input: "$15", output: "$60" },
    "openai/gpt-3.5-turbo-instruct": { input: "$1.50", output: "$2" },
    "openai/o1-mini-2024-09-12": { input: "$1.10", output: "$4.40" },
    "openai/gpt-4o:extended": { input: "$6", output: "$18" },
    "openai/gpt-3.5-turbo-16k": { input: "$3", output: "$4" },
    "openai/gpt-4-32k": { input: "$60", output: "$120" },
    "openai/o1-pro": { input: "$150", output: "$600" },
    "openai/gpt-4-0314": { input: "$30", output: "$60" },
    "openai/gpt-4-32k-0314": { input: "$60", output: "$120" },
    "openai/gpt-4-vision-preview": { input: "--", output: "--" },
    "openai/gpt-3.5-turbo-0301": { input: "--", output: "--" }
  };

  let openAIModelData = [];
  let openRouterModelData = [];

  try {
    const openAiKey = process.env.OPENAI_API_KEY || "";
    const openRouterKey = process.env.OPENROUTER_API_KEY || "";

    // If we have OpenAI key, fetch from OpenAI
    if (openAiKey) {
      try {
        console.debug("[Server Debug] Fetching OpenAI model list...");
        const openaiClient = new OpenAI({ apiKey: openAiKey });
        const modelList = await openaiClient.models.list();
        const modelIds = modelList.data.map(m => m.id).sort();
        openAIModelData = modelIds.map(id => {
          const combinedId = "openai/" + id;
          const limit = knownTokenLimits[combinedId] || "N/A";
          const cInfo = knownCosts[combinedId]
              ? knownCosts[combinedId]
              : { input: "N/A", output: "N/A" };
          return {
            id: combinedId,
            provider: "openai",
            tokenLimit: limit,
            inputCost: cInfo.input,
            outputCost: cInfo.output
          };
        });
      } catch (err) {
        console.error("[TaskQueue] Error listing OpenAI models:", err);
      }
    }

    // If we have OpenRouter key, fetch from OpenRouter
    if (openRouterKey) {
      try {
        console.debug("[Server Debug] Fetching OpenRouter model list...");
        const orResp = await axios.get("https://openrouter.ai/api/v1/models", {
          headers: {
            Authorization: `Bearer ${openRouterKey}`,
            "HTTP-Referer": "Alfe-DevAgent",
            "X-Title": "Alfe AI",
            "User-Agent": "Alfe AI"
          }
        });
        const rawModels = orResp.data?.data?.map((m) => m.id).sort() || [];
        openRouterModelData = rawModels.map((id) => {
          const combinedId = "openrouter/" + id;
          return {
            id: combinedId,
            provider: "openrouter",
            tokenLimit: "N/A",
            inputCost: "N/A",
            outputCost: "N/A"
          };
        });
      } catch (err) {
        console.error("[TaskQueue] Error fetching OpenRouter models:", err);
      }
    }
  } catch (err) {
    console.error("[TaskQueue] /api/ai/models error:", err);
  }

  const deepseekModelData = [
    {
      id: "deepseek/deepseek-chat-v3-0324:free",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-chat-v3-0324",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0.30",
      outputCost: "$0.88"
    },
    {
      id: "deepseek/deepseek-r1:free",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-chat",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0.38",
      outputCost: "$0.89"
    },
    {
      id: "deepseek/deepseek-r1",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0.50",
      outputCost: "$2.18"
    },
    {
      id: "deepseek/deepseek-r1-distill-llama-70b",
      provider: "deepseek",
      tokenLimit: 131072,
      inputCost: "$0.10",
      outputCost: "$0.40"
    },
    {
      id: "deepseek/deepseek-chat:free",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "tngtech/deepseek-r1t-chimera:free",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-prover-v2:free",
      provider: "deepseek",
      tokenLimit: 163840,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-r1-distill-llama-70b:free",
      provider: "deepseek",
      tokenLimit: 8192,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-prover-v2",
      provider: "deepseek",
      tokenLimit: 131072,
      inputCost: "$0.50",
      outputCost: "$2.18"
    },
    {
      id: "deepseek/deepseek-r1-distill-qwen-32b",
      provider: "deepseek",
      tokenLimit: 131072,
      inputCost: "$0.12",
      outputCost: "$0.18"
    },
    {
      id: "deepseek/deepseek-r1-distill-llama-8b",
      provider: "deepseek",
      tokenLimit: 32000,
      inputCost: "$0.04",
      outputCost: "$0.04"
    },
    {
      id: "deepseek/deepseek-r1-distill-qwen-32b:free",
      provider: "deepseek",
      tokenLimit: 16000,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-r1-distill-qwen-1.5b",
      provider: "deepseek",
      tokenLimit: 131072,
      inputCost: "$0.18",
      outputCost: "$0.18"
    },
    {
      id: "deepseek/deepseek-r1-distill-qwen-14b",
      provider: "deepseek",
      tokenLimit: 64000,
      inputCost: "$0.15",
      outputCost: "$0.15"
    },
    {
      id: "deepseek/deepseek-r1-distill-qwen-14b:free",
      provider: "deepseek",
      tokenLimit: 64000,
      inputCost: "$0",
      outputCost: "$0"
    },
    {
      id: "deepseek/deepseek-coder",
      provider: "deepseek",
      tokenLimit: 128000,
      inputCost: "$0.04",
      outputCost: "$0.12"
    },
    {
      id: "deepseek/deepseek-chat-v2.5",
      provider: "deepseek",
      tokenLimit: 128000,
      inputCost: "--",
      outputCost: "--"
    }
  ];

  const combinedModels = [
    ...openAIModelData,
    ...openRouterModelData,
    ...deepseekModelData
  ].sort((a, b) => a.id.localeCompare(b.id));

  const favorites = db.getSetting("favorite_ai_models") || [];
  for (const m of combinedModels) {
    m.favorite = favorites.includes(m.id);
  }

  res.json({ models: combinedModels });
});

app.post("/api/chat", async (req, res) => {
  console.debug("[Server Debug] POST /api/chat => body:", req.body);
  try {
    const userMessage = req.body.message || "";
    const chatTabId = req.body.tabId || 1;
    const userTime = req.body.userTime || new Date().toISOString();

    if (!userMessage) {
      return res.status(400).send("Missing message");
    }

    const priorPairsAll = db.getAllChatPairs(chatTabId);
    let model = db.getSetting("ai_model");
    const savedInstructions = db.getSetting("agent_instructions") || "";

    const { provider } = parseProviderModel(model || "gpt-3.5-turbo");
    const systemContext = `System Context:\n${savedInstructions}\n\nModel: ${model} (provider: ${provider})\nUserTime: ${userTime}\nTimeZone: Central`;

    const conversation = [{ role: "system", content: systemContext }];

    for (const p of priorPairsAll) {
      conversation.push({ role: "user", content: p.user_text });
      if (p.ai_text) {
        conversation.push({ role: "assistant", content: p.ai_text });
      }
    }

    const chatPairId = db.createChatPair(userMessage, chatTabId, systemContext);
    conversation.push({ role: "user", content: userMessage });
    db.logActivity("User chat", JSON.stringify({ tabId: chatTabId, message: userMessage, userTime }));

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    console.debug("[Server Debug] Chat conversation assembled with length =>", conversation.length);

    const openaiClient = getOpenAiClient();
    if (!model) {
      model = "unknown";
    }

    function stripModelPrefix(m) {
      if (!m) return "gpt-3.5-turbo";
      if (m.startsWith("openai/")) return m.substring("openai/".length);
      if (m.startsWith("openrouter/")) return m.substring("openrouter/".length);
      return m;
    }
    const modelForOpenAI = stripModelPrefix(model);

    console.debug("[Server Debug] Using model =>", model, " (stripped =>", modelForOpenAI, ")");
    const encoder = getEncoding(modelForOpenAI);

    let convTokens = 0;
    let truncatedConversation = [];
    truncatedConversation.push(conversation[0]);
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
    let requestStartTime = Date.now();

    const streamingSetting = db.getSetting("chat_streaming");
    const useStreaming = (streamingSetting === false) ? false : true;

    if (useStreaming) {
      const stream = await openaiClient.chat.completions.create({
        model: modelForOpenAI,
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

    } else {
      const completion = await openaiClient.chat.completions.create({
        model: modelForOpenAI,
        messages: truncatedConversation
      });
      assistantMessage = completion.choices?.[0]?.message?.content || "";
      res.write(assistantMessage);
      res.end();
      console.debug("[Server Debug] AI non-streaming completed, length =>", assistantMessage.length);
    }

    let requestEndTime = Date.now();
    let diffMs = requestEndTime - requestStartTime;
    let responseTime = Math.ceil(diffMs * 0.01) / 100;

    const systemTokens = countTokens(encoder, systemContext);
    let prevAssistantTokens = 0;
    let historyTokens = 0;
    for (const p of priorPairsAll) {
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
      total,
      responseTime
    };

    db.finalizeChatPair(chatPairId, assistantMessage, model, new Date().toISOString(), JSON.stringify(tokenInfo));
    db.logActivity("AI chat", JSON.stringify({ tabId: chatTabId, response: assistantMessage, tokenInfo }));
  } catch (err) {
    console.error("[Server Debug] /api/chat error:", err);
    if (!res.headersSent) {
      res.status(500).send("Internal server error");
    }
  }
});

app.get("/api/chat/history", (req, res) => {
  console.debug("[Server Debug] GET /api/chat/history =>", req.query);
  try {
    const tabId = parseInt(req.query.tabId || "1", 10);
    const limit = parseInt(req.query.limit || "10", 10);
    const offset = parseInt(req.query.offset || "0", 10);

    const pairsDesc = db.getChatPairsPage(tabId, limit, offset);
    const pairsAsc = pairsDesc.slice().reverse();

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const pair of pairsAsc) {
      if (!pair.token_info) continue;
      try {
        const tInfo = JSON.parse(pair.token_info);
        const inputT = (tInfo.systemTokens || 0) + (tInfo.historyTokens || 0) + (tInfo.inputTokens || 0);
        const outputT = (tInfo.assistantTokens || 0) + (tInfo.finalAssistantTokens || 0);

        totalInputTokens += inputT;
        totalOutputTokens += outputT;

        pair._tokenSections = {
          input: inputT,
          output: outputT
        };
      } catch (e) {
        console.debug("[Server Debug] Could not parse token_info for pair =>", pair.id, e.message);
      }
    }

    res.json({
      pairs: pairsAsc,
      totalInputTokens,
      totalOutputTokens
    });
  } catch (err) {
    console.error("[TaskQueue] /api/chat/history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/model", (req, res) => {
  console.debug("[Server Debug] GET /api/model called.");
  let m = db.getSetting("ai_model");
  console.debug(`[Server Debug] DB returned ai_model => ${m}`);
  res.json({ model: m });
});

app.get("/api/chat/tabs", (req, res) => {
  const nexumParam = req.query.nexum;
  console.debug(
      `[Server Debug] GET /api/chat/tabs => listing tabs (nexum=${nexumParam})`
  );
  try {
    let tabs;
    if (nexumParam === undefined) {
      tabs = db.listChatTabs();
    } else {
      const flag = parseInt(nexumParam, 10);
      tabs = db.listChatTabs(flag ? 1 : 0);
    }
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
    const nexum = req.body.nexum ? 1 : 0;
    const project = req.body.project || '';
    const repo = req.body.repo || '';

    const autoNaming = db.getSetting("chat_tab_auto_naming");
    const projectName = db.getSetting("sterling_project") || "";
    if (autoNaming && projectName) {
      name = `${projectName}: ${name}`;
    }

    const tabId = db.createChatTab(name, nexum, project, repo);
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

app.post("/api/chat/tabs/archive", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/archive =>", req.body);
  try {
    const { tabId, archived = true } = req.body;
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    db.setChatTabArchived(tabId, archived ? 1 : 0);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/tabs/archive error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/generate_images", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/generate_images =>", req.body);
  try {
    const { tabId, enabled = true } = req.body;
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    db.setChatTabGenerateImages(tabId, enabled ? 1 : 0);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/tabs/generate_images error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/tabs/config", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/tabs/config =>", req.body);
  try {
    const { tabId, project = '', repo = '' } = req.body;
    if (!tabId) {
      return res.status(400).json({ error: "Missing tabId" });
    }
    db.setChatTabConfig(tabId, project, repo);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/tabs/config error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/chat/subroutines", (req, res) => {
  console.debug("[Server Debug] GET /api/chat/subroutines");
  try {
    const subs = db.listChatSubroutines();
    res.json(subs);
  } catch (err) {
    console.error("[TaskQueue] GET /api/chat/subroutines error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/subroutines/new", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/subroutines/new =>", req.body);
  try {
    const { name, trigger = "", action = "", hook = "" } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name required" });
    }
    const id = db.createChatSubroutine(name, trigger, action, hook);
    res.json({ success: true, id });
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/subroutines/new error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/subroutines/rename", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/subroutines/rename =>", req.body);
  try {
    const { id, newName } = req.body;
    if (!id || !newName) {
      return res.status(400).json({ error: "Missing id or newName" });
    }
    db.renameChatSubroutine(id, newName);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/subroutines/rename error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/chat/subroutines/update", (req, res) => {
  console.debug("[Server Debug] POST /api/chat/subroutines/update =>", req.body);
  try {
    const { id, name, trigger = "", action = "", hook = "" } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: "Missing id or name" });
    }
    db.updateChatSubroutine(id, name, trigger, action, hook);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] POST /api/chat/subroutines/update error:", err);
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
    db.prepare("DELETE FROM chat_pairs WHERE chat_tab_id=?").run(tabId);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] DELETE /api/chat/tabs/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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

app.post("/api/upload", upload.single("myfile"), (req, res) => {
  console.debug("[Server Debug] POST /api/upload => File info:", req.file);
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  db.logActivity("File upload", JSON.stringify({ filename: req.file.originalname }));
  res.json({ success: true, file: req.file });
});

app.get("/api/upload/list", (req, res) => {
  console.debug("[Server Debug] GET /api/upload/list => listing files.");
  try {
    const fileNames = fs.readdirSync(uploadsDir);
    const files = fileNames.map((name, idx) => {
      const { size, mtime } = fs.statSync(path.join(uploadsDir, name));
      return {
        index: idx + 1,
        name,
        size,
        mtime
      };
    });
    res.json(files);
  } catch (err) {
    console.error("[Server Debug] /api/upload/list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Upload images, run script to get description, return it as JSON.
app.post("/api/chat/image", upload.single("imageFile"), async (req, res) => {
  try {
    if(!req.file){
      return res.status(400).json({ error: "No image file received." });
    }

    const scriptPath = `${process.env.HOME}/git/imgs_db/imagedesc.sh`;
    const filePath = path.join(uploadsDir, req.file.filename);

    let desc = "";
    try {
      const cmd = `${scriptPath} "${filePath}"`;
      console.log("[Server Debug] Running command =>", cmd);
      desc = child_process.execSync(cmd).toString().trim();
    } catch(e){
      console.error("[Server Debug] Error calling imagedesc.sh =>", e);
      desc = "(Could not generate description.)";
    }

    db.logActivity("Image upload", JSON.stringify({ file: req.file.filename, desc }));
    res.json({ success: true, desc, filename: req.file.filename });
  } catch(e){
    console.error("Error in /api/chat/image:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Generate an image using OpenAI's image API.
app.post("/api/image/generate", async (req, res) => {
  try {
    const { prompt, n, size, model, tabId } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY environment variable not configured" });
    }

    // Always use ChatGPT/DALL-E for image generation
    const openaiClient = new OpenAI({ apiKey: openAiKey });

    const modelName = (model || "dall-e-3").toLowerCase();
    const allowedModels = ["dall-e-2", "dall-e-3"];
    if (!allowedModels.includes(modelName)) {
      return res.status(400).json({ error: "Invalid model" });
    }

    let countParsed = parseInt(n, 10);
    if (isNaN(countParsed) || countParsed < 1) countParsed = 1;
    if (modelName === "dall-e-3") {
      countParsed = 1; // API restriction
    } else {
      countParsed = Math.min(countParsed, 4); // limit for dall-e-2
    }

    const allowedSizes = ["1024x1024", "1024x1792", "1792x1024"];
    const imgSize = allowedSizes.includes(size) ? size : "1024x1024";

    let result;
    try {
      result = await openaiClient.images.generate({
        model: modelName,
        prompt: prompt.slice(0, 1000),
        n: countParsed,
        size: imgSize,
        response_format: "url"
      });
    } catch (err) {
      // If DALLE-3 request fails due to user error, try DALLE-2 as a fallback
      if (
        modelName === "dall-e-3" &&
        err?.type === "image_generation_user_error"
      ) {
        try {
          result = await openaiClient.images.generate({
            model: "dall-e-2",
            prompt: prompt.slice(0, 1000),
            n: Math.min(countParsed, 4),
            size: "1024x1024",
            response_format: "url"
          });
          // indicate fallback
          modelName = "dall-e-2";
        } catch (err2) {
          throw err2;
        }
      } else {
        throw err;
      }
    }

    const first = result.data?.[0]?.url || null;
    if (!first) {
      return res.status(502).json({ error: "Received empty response from AI service" });
    }

    // Download the generated image and save locally
    let localUrl = first;
    try {
      const resp = await axios.get(first, { responseType: "arraybuffer" });
      const ext = path.extname(new URL(first).pathname) || ".png";
      const filename = `generated-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, resp.data);
      localUrl = `/uploads/${filename}`;
    } catch(downloadErr) {
      console.error("[Server Debug] Failed to download generated image:", downloadErr);
    }

    db.logActivity(
      "Image generate",
      JSON.stringify({ prompt, url: localUrl, model: modelName, n: countParsed })
    );

    const tab = parseInt(tabId, 10) || 1;
    db.createImagePair(localUrl, prompt || '', tab);

    res.json({ success: true, url: localUrl });
  } catch (err) {
    console.error("[Server Debug] /api/image/generate error:", err);
    const status = err?.status || err?.response?.status || 500;
    let message = err?.response?.data?.error?.message ?? err?.message;
    if (!message) {
      if (err?.type === "image_generation_user_error") {
        message = "Image generation failed: invalid prompt or policy violation.";
      } else {
        message = "Image generation failed";
      }
    }
    res.status(status).json({ error: message, code: err.code, type: err.type });
  }
});

app.use(express.static(path.join(__dirname, "../public")));

app.get("/test_projects", (req, res) => {
  console.debug("[Server Debug] GET /test_projects => Serving test_projects.html");
  res.sendFile(path.join(__dirname, "../public/test_projects.html"));
});

app.get("/activity", (req, res) => {
  console.debug("[Server Debug] GET /activity => Serving activity.html");
  res.sendFile(path.join(__dirname, "../public/activity.html"));
});

app.get("/ai_models", (req, res) => {
  console.debug("[Server Debug] GET /ai_models => Serving ai_models.html");
  res.sendFile(path.join(__dirname, "../public/ai_models.html"));
});

app.get("/image_generator", (req, res) => {
  console.debug("[Server Debug] GET /image_generator => Serving image_generator.html");
  res.sendFile(path.join(__dirname, "../public/image_generator.html"));
});

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

app.delete("/api/chat/pair/:id/ai", (req, res) => {
  console.debug("[Server Debug] DELETE /api/chat/pair/:id/ai =>", req.params.id);
  try {
    const pairId = parseInt(req.params.id, 10);
    if (Number.isNaN(pairId)) {
      return res.status(400).json({ error: "Invalid pair ID" });
    }
    db.deleteAiPart(pairId);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] DELETE /api/chat/pair/:id/ai error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/chat/pair/:id/user", (req, res) => {
  console.debug("[Server Debug] DELETE /api/chat/pair/:id/user =>", req.params.id);
  try {
    const pairId = parseInt(req.params.id, 10);
    if (Number.isNaN(pairId)) {
      return res.status(400).json({ error: "Invalid pair ID" });
    }
    db.deleteUserPart(pairId);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] DELETE /api/chat/pair/:id/user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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

    const allBranches = db.listProjectBranches();
    const foundBranchObj = allBranches.find(x => x.project === project);
    let sterlingBranch = foundBranchObj ? foundBranchObj.base_branch : "";
    if (!sterlingBranch) {
      sterlingBranch = "main";
    }
    console.log(`[Sterling Branch Fix] Setting branch to: ${sterlingBranch}`);

    try {
      const changeBranchResp = await axios.post(
          `${baseURL}/changeBranchOfChat/${encodeURIComponent(projectName)}/${createChatResponse.data.newChatNumber}`,
          {
            createNew: false,
            branchName: sterlingBranch
          }
      );
      console.log('Response from /changeBranchOfChat:', changeBranchResp.data);
    } catch (branchErr) {
      console.error("[Sterling Branch Fix] Error calling /changeBranchOfChat =>", branchErr.message);
    }

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

// New route to toggle favorites
app.post("/api/ai/favorites", (req, res) => {
  try {
    const { modelId, favorite } = req.body;
    if (!modelId || typeof favorite !== "boolean") {
      return res.status(400).json({ error: "Missing modelId or favorite boolean" });
    }
    let favList = db.getSetting("favorite_ai_models") || [];
    const index = favList.indexOf(modelId);

    if (favorite) {
      if (index < 0) {
        favList.push(modelId);
      }
    } else {
      if (index >= 0) {
        favList.splice(index, 1);
      }
    }

    db.setSetting("favorite_ai_models", favList);
    res.json({ success: true, favorites: favList });
  } catch (err) {
    console.error("Error in /api/ai/favorites:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const mdFilePath = path.join(__dirname, "../markdown_global.txt");

function ensureTaskListRepoCloned(gitUrl) {
  if (!gitUrl) return null;
  const homeDir = os.homedir();
  const alfeDir = path.join(homeDir, ".alfeai");
  if (!fs.existsSync(alfeDir)) {
    fs.mkdirSync(alfeDir, { recursive: true });
  }
  const repoDir = path.join(alfeDir, "tasklistRepo");

  try {
    if (!fs.existsSync(repoDir)) {
      console.log("[Git Debug] Cloning new repo =>", gitUrl, "into =>", repoDir);
      child_process.execSync(`git clone "${gitUrl}" "${repoDir}"`, {
        stdio: "inherit"
      });
    } else {
      console.log("[Git Debug] Pulling latest in =>", repoDir);
      child_process.execSync(`git pull`, {
        cwd: repoDir,
        stdio: "inherit"
      });
    }
    return repoDir;
  } catch (err) {
    console.error("[Git Error] Could not clone/pull repo =>", err);
    return null;
  }
}

function commitAndPushMarkdown(repoDir) {
  try {
    const mgPath = path.join(repoDir, "markdown_global.txt");
    child_process.execSync(`git add markdown_global.txt`, {
      cwd: repoDir
    });
    child_process.execSync(`git commit -m "Update markdown_global.txt"`, {
      cwd: repoDir
    });
    child_process.execSync(`git push`, {
      cwd: repoDir,
      stdio: "inherit"
    });
  } catch (err) {
    const msg = String(err.message || "");
    if (msg.includes("nothing to commit, working tree clean")) {
      console.log("[Git Debug] Nothing to commit. Working tree is clean.");
    } else {
      console.error("[Git Error] commitAndPushMarkdown =>", err);
    }
  }
}

app.get("/api/tasklist/repo-path", (req, res) => {
  try {
    const gitUrl = db.getSetting("taskList_git_ssh_url");
    if (!gitUrl) {
      return res.json({ path: null });
    }
    const repoDir = ensureTaskListRepoCloned(gitUrl);
    res.json({ path: repoDir });
  } catch (err) {
    console.error("Error in /api/tasklist/repo-path:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/markdown", (req, res) => {
  try {
    if (fs.existsSync(mdFilePath)) {
      const data = fs.readFileSync(mdFilePath, "utf-8");
      res.json({ content: data });
    } else {
      res.json({ content: "" });
    }
  } catch (err) {
    console.error("Error reading markdown_global.txt:", err);
    res.status(500).json({ error: "Unable to read markdown file." });
  }
});

app.post("/api/markdown", (req, res) => {
  try {
    const { content } = req.body;
    fs.writeFileSync(mdFilePath, content || "", "utf-8");

    const gitUrl = db.getSetting("taskList_git_ssh_url");
    if (gitUrl) {
      const repoDir = ensureTaskListRepoCloned(gitUrl);
      if (repoDir) {
        const targetPath = path.join(repoDir, "markdown_global.txt");
        fs.copyFileSync(mdFilePath, targetPath);
        commitAndPushMarkdown(repoDir);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error writing markdown_global.txt:", err);
    res.status(500).json({ error: "Unable to write markdown file." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[TaskQueue] Web server is running on port ${PORT} (verbose='true')`);
});
