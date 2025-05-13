import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import TaskDB from "./taskDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const db = new TaskDB();

app.use(cors());
app.use(express.json());

/* ------------------------------------------------------------------ */
/*  Settings routes (NEW)                                             */
/* ------------------------------------------------------------------ */

/* GET /api/settings  →  all settings */
app.get("/api/settings", (req, res) => {
  try {
    res.json(db.allSettings());
  } catch (err) {
    console.error("[TaskQueue] /api/settings failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* GET /api/settings/:key */
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

/* POST /api/settings  body:{ key, value } */
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
/*  Projects routes (kept)                                            */
/* ------------------------------------------------------------------ */
app.get("/api/projects", (req, res) => {
  try {
    res.json(db.listProjects());
  } catch (err) {
    console.error("[TaskQueue] /api/projects failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/projects", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "projects.html"));
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
