import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
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
const INSTR_FILE = path.resolve("agent_instructions.txt");

app.use(cors());
app.use(express.json());

/* ------------------------------------------------------------------ */
/*  Agent instructions routes                                         */
/* ------------------------------------------------------------------ */

/* GET /api/instructions -> { instructions: "..." } */
app.get("/api/instructions", (req, res) => {
  try {
    const txt = fs.existsSync(INSTR_FILE)
      ? fs.readFileSync(INSTR_FILE, "utf8")
      : "";
    res.json({ instructions: txt });
  } catch (err) {
    console.error("[TaskQueue] read instructions failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* POST /api/instructions  body:{ instructions } */
app.post("/api/instructions", (req, res) => {
  try {
    const { instructions = "" } = req.body ?? {};
    fs.writeFileSync(INSTR_FILE, instructions, "utf8");
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] write instructions failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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

/* ... existing routes unchanged ... */

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

