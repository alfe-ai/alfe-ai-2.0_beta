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
 * Serve static frontend from ../public
 */
app.use(express.static(path.join(__dirname, "..", "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`[TaskQueue] Web UI available at http://localhost:${PORT}`)
);
