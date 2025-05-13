import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import TaskDB from "./taskDb.js";

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
