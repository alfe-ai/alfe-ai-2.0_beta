import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import TaskDB from "./taskDb.js";
import GitHubClient from "./githubClient.js";

const db = new TaskDB();
const app = express();

app.use(cors());
app.use(bodyParser.json());

// GET /api/tasks
app.get("/api/tasks", (req, res) => {
  try {
    // parse query param explicitly: "1"/"true" => true
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

// POST /api/tasks/hidden
app.post("/api/tasks/hidden", (req, res) => {
  try {
    const { id, hidden } = req.body;
    db.setHidden(id, hidden);
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
    if (!ok) return res.status(400).json({ error: "Unable to reorder" });
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/reorder failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/tasks/points
app.post("/api/tasks/points", (req, res) => {
  try {
    const { id, points } = req.body;
    db.setPoints(id, points);
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
    db.setPriority(id, priority);
    res.json({ success: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/priority failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- NEW: Create new GitHub issue and upsert ---
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
    // upsert in local DB
    db.upsertIssue(newIssue, `${gh.owner}/${gh.repo}`);

    // also apply default project/sprint if set
    const defaultProject = db.getSetting("default_project");
    const defaultSprint = db.getSetting("default_sprint");
    if (defaultProject) {
      db.setProjectByGithubId(newIssue.id, defaultProject);
    }
    if (defaultSprint) {
      db.setSprintByGithubId(newIssue.id, defaultSprint);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /api/tasks/new error:", err);
    return res.status(500).json({ error: "Internal server error" });
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
    console.error("[TaskQueue] POST /api/settings failed", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Serve static files
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../public")));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[TaskQueue] Web server is running on port ${PORT} (verbose='true')`);
});

