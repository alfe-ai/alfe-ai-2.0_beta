import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import TaskDB from "./taskDb.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const db = new TaskDB();

app.use(cors());
app.use(express.json()); // parses application/json bodies

/**
 * REST endpoint → JSON dump of all open tasks (sorted by priority).
 */
app.get("/api/tasks", (req, res) => {
  try {
    const tasks = db.allOpenIssues();
    res.json(tasks);
  } catch (err) {
    console.error("[TaskQueue] /api/tasks failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/tasks/reorder
 * Body: { id: <issue id>, direction: "up"|"down" }
 */
app.post("/api/tasks/reorder", (req, res) => {
  const { id, direction } = req.body ?? {};
  if (!id || !["up", "down"].includes(direction)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    const moved = db.movePriority(Number(id), direction);
    if (!moved) {
      return res.status(200).json({ ok: false, message: "No change" });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] /api/tasks/reorder failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/tasks/project
 * Body: { id: <issue id>, project: "<string>" }
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
 * Serve static frontend from ../public
 */
app.use(express.static(path.join(__dirname, "..", "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`[TaskQueue] Web UI available at http://localhost:${PORT}`)
);

