import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import TaskDB from "./taskDb.js";
import GitHubClient from "./githubClient.js";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const db = new TaskDB();

/* GitHub client (used for creating new tasks) */
let ghClient = null;
try {
  ghClient = new GitHubClient({
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO
  });
} catch (err) {
  console.warn("[TaskQueue] GitHub client disabled:", err.message);
}

const repositorySlug = `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`;

app.use(cors());
app.use(express.json());

/* ------------------------------------------------------------------ */
/*  Tasks routes                                                      */
/* ------------------------------------------------------------------ */

/* GET /api/tasks */
app.get("/api/tasks", (req, res) => {
  try {
    const includeHidden = Boolean(req.query.includeHidden);
    res.json(db.listTasks(includeHidden));
  } catch (err) {
    console.error("[TaskQueue] /api/tasks failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* POST /api/tasks  →  create new GitHub issue & store locally */
app.post("/api/tasks", async (req, res) => {
  try {
    const { title, body = "" } = req.body ?? {};
    if (!title) return res.status(400).json({ error: "Missing title" });
    if (!ghClient)
      return res.status(503).json({ error: "GitHub client not configured" });

    const issue = await ghClient.createIssue(title, body);
    db.upsertIssue(issue, repositorySlug);
    res.json({ ok: true, id: issue.id });
  } catch (err) {
    console.error("[TaskQueue] create task failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* POST /api/tasks/reorder  body:{ id, direction:'up'|'down' } */
app.post("/api/tasks/reorder", (req, res) => {
  try {
    const { id, direction } = req.body ?? {};
    if (!id || !["up", "down"].includes(direction))
      return res.status(400).json({ error: "Invalid payload" });

    const ok = db.reorderTask(id, direction);
    if (!ok) return res.status(400).json({ error: "Cannot reorder" });
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] reorder failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* POST /api/tasks/hidden  body:{ id, hidden } */
app.post("/api/tasks/hidden", (req, res) => {
  try {
    const { id, hidden } = req.body ?? {};
    if (id === undefined || hidden === undefined)
      return res.status(400).json({ error: "Invalid payload" });
    db.setHidden(id, hidden);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] toggle hidden failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* POST /api/tasks/points  body:{ id, points } */
app.post("/api/tasks/points", (req, res) => {
  try {
    const { id, points } = req.body ?? {};
    if (!id || points === undefined)
      return res.status(400).json({ error: "Invalid payload" });
    db.setPoints(id, points);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] set points failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* POST /api/tasks/project  body:{ id, project } */
app.post("/api/tasks/project", (req, res) => {
  try {
    const { id, project } = req.body ?? {};
    if (!id || project === undefined)
      return res.status(400).json({ error: "Invalid payload" });
    db.setProject(id, project);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] set project failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* POST /api/tasks/sprint  body:{ id, sprint } */
app.post("/api/tasks/sprint", (req, res) => {
  try {
    const { id, sprint } = req.body ?? {};
    if (!id || sprint === undefined)
      return res.status(400).json({ error: "Invalid payload" });
    db.setSprint(id, sprint);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] set sprint failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ------------------------------------------------------------------ */
/*  Settings routes                                                   */
/* ------------------------------------------------------------------ */
app.get("/api/settings", (req, res) => {
  try {
    res.json(db.allSettings());
  } catch (err) {
    console.error("[TaskQueue] /api/settings failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/settings/:key", (req, res) => {
  try {
    const val = db.getSetting(req.params.key);
    if (val === undefined) return res.status(404).end();
    res.json({ key: req.params.key, value: val });
  } catch (err) {
    console.error("[TaskQueue] /api/settings/:key failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/settings", (req, res) => {
  try {
    const { key, value } = req.body ?? {};
    if (!key) return res.status(400).json({ error: "Missing key" });
    db.setSetting(key, value);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] /api/settings (POST) failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ------------------------------------------------------------------ */
/*  Projects & Sprints overview routes                                */
/* ------------------------------------------------------------------ */
app.get("/api/projects", (req, res) => {
  try {
    res.json(db.listProjects());
  } catch (err) {
    console.error("[TaskQueue] /api/projects failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/sprints", (req, res) => {
  try {
    res.json(db.listSprints());
  } catch (err) {
    console.error("[TaskQueue] /api/sprints failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/projects", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "projects.html"));
});

app.get("/sprints", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "sprints.html"));
});

/* ------------------------------------------------------------------ */
/*  Static files & index                                              */
/* ------------------------------------------------------------------ */
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

/* ------------------------------------------------------------------ */
/*  Server start                                                      */
/* ------------------------------------------------------------------ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[TaskQueue] Web UI listening on http://localhost:${PORT}`);
});
