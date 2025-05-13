import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import TaskDB from "./taskDb.js";
import GitHubClient from "./githubClient.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const db = new TaskDB();

const ghClient = new GitHubClient({
  token: process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO
});

app.use(cors());
app.use(express.json());

/**
 * GET /api/tasks?includeHidden=1
 */
app.get("/api/tasks", (req, res) => {
  try {
    const includeHidden = req.query.includeHidden === "1";
    const tasks = db.allOpenIssues({ includeHidden });
    res.json(tasks);
  } catch (err) {
    console.error("[TaskQueue] /api/tasks failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/tasks
 * Body: { title: string, body?: string }
 */
app.post("/api/tasks", async (req, res) => {
  const { title, body } = req.body ?? {};
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    const issue = await ghClient.createIssue(title.trim(), body?.trim() || "");
    const repositorySlug = `${ghClient.owner}/${ghClient.repo}`;
    db.upsertIssue(issue, repositorySlug);
    res.json({ ok: true, issue });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks (create) failed:", err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

/**
 * POST /api/tasks/hidden
 * Body: { id: <issue id>, hidden: true|false }
 */
app.post("/api/tasks/hidden", (req, res) => {
  const { id, hidden } = req.body ?? {};
  if (!id || typeof hidden !== "boolean") {
    return res.status(400).json({ error: "Invalid payload" });
  }
  try {
    db.updateHidden(Number(id), hidden);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/hidden failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/tasks/reorder
 */
app.post("/api/tasks/reorder", (req, res) => {
  const { id, direction } = req.body ?? {};
  if (!id || !["up", "down"].includes(direction)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    const moved = db.movePriority(Number(id), direction);
    return res.json({ ok: moved });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/reorder failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/tasks/project
 */
app.post("/api/tasks/project", (req, res) => {
  const { id, project } = req.body ?? {};
  if (!id || typeof project !== "string") {
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    db.updateProject(Number(id), project.trim());
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/project failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/tasks/points
 * Body: { id: <issue id>, points: 1|2|3|5|8|null }
 */
app.post("/api/tasks/points", (req, res) => {
  const { id, points } = req.body ?? {};
  const allowed = [1, 2, 3, 5, 8, null];
  if (!id || !allowed.includes(points)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    db.updatePoints(Number(id), points);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/points failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Static front-end
 */
app.use(express.static(path.join(__dirname, "..", "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`[TaskQueue] Web UI available at http://localhost:${PORT}`)
);

