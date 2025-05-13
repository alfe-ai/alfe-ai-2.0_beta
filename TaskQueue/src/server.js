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

/* ------------------------------------------------------------- */
/*  GitHub client bootstrap & hot-reload helper                  */
/* ------------------------------------------------------------- */
let ghOwner = process.env.GITHUB_OWNER;
let ghRepo = process.env.GITHUB_REPO;
const loadGitConfigFromDb = () => {
  ghOwner = db.getSetting("github_owner") || ghOwner;
  ghRepo = db.getSetting("github_repo") || ghRepo;
};
loadGitConfigFromDb();

let ghClient = null;
function refreshGitHubClient() {
  if (!ghOwner || !ghRepo || !process.env.GITHUB_TOKEN) {
    ghClient = null;
    console.warn(
      "[TaskQueue] GitHub client disabled – missing token/owner/repo."
    );
    return;
  }
  ghClient = new GitHubClient({
    token: process.env.GITHUB_TOKEN,
    owner: ghOwner,
    repo: ghRepo
  });
  console.log(`[TaskQueue] GitHub client ready for ${ghOwner}/${ghRepo}`);
}
refreshGitHubClient();

/* Helper to obtain up-to-date repository slug */
const repositorySlug = () => `${ghOwner}/${ghRepo}`;

const INSTR_FILE = path.resolve("agent_instructions.txt");

app.use(cors());
app.use(express.json());

/* ------------------------------------------------------------------ */
/*  Agent instructions                                                 */
/* ------------------------------------------------------------------ */
app.get("/api/instructions", (_req, res) => {
  try {
    const txt = fs.existsSync(INSTR_FILE) ? fs.readFileSync(INSTR_FILE, "utf8") : "";
    res.json({ instructions: txt });
  } catch (err) {
    console.error("[TaskQueue] read instructions failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
/*  GitHub repository configuration                                   */
/* ------------------------------------------------------------------ */
app.get("/api/github", (_req, res) => {
  res.json({ owner: ghOwner, repo: ghRepo });
});

app.post("/api/github", (req, res) => {
  try {
    let { slug = "" } = req.body ?? {};
    slug = slug.trim();
    const [owner, repo] = slug.split("/");
    if (!owner || !repo) {
      return res
        .status(400)
        .json({ error: "Invalid slug – expected owner/repo" });
    }

    db.setSetting("github_owner", owner);
    db.setSetting("github_repo", repo);

    /* update in-memory vars & client */
    loadGitConfigFromDb();
    refreshGitHubClient();
    res.json({ ok: true, owner, repo });
  } catch (err) {
    console.error("[TaskQueue] update github config failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */
app.get("/api/settings/:key", (req, res) => {
  try {
    const val = db.getSetting(req.params.key);
    if (typeof val === "undefined") return res.status(404).json({ error: "Not found" });
    res.json({ key: req.params.key, value: val });
  } catch (err) {
    console.error("[TaskQueue] settings get failed:", err);
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
    console.error("[TaskQueue] settings post failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ------------------------------------------------------------------ */
/*  Tasks core                                                         */
/* ------------------------------------------------------------------ */
app.get("/api/tasks", (req, res) => {
  try {
    const includeHidden = Boolean(req.query.includeHidden);
    res.json(db.listTasks(includeHidden));
  } catch (err) {
    console.error("[TaskQueue] /api/tasks failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const { title, body = "" } = req.body ?? {};
    if (!title) return res.status(400).json({ error: "Missing title" });
    if (!ghClient)
      return res.status(503).json({ error: "GitHub client not configured" });

    /* create issue on GitHub */
    const issue = await ghClient.createIssue(title, body);

    /* insert into DB */
    db.upsertIssue(issue, repositorySlug());

    /* apply default project/sprint if configured */
    const defaultProject = db.getSetting("default_project") || "";
    const defaultSprint = db.getSetting("default_sprint") || "";
    if (defaultProject) {
      db.setProjectByGithubId(issue.id, defaultProject);
    }
    if (defaultSprint) {
      db.setSprintByGithubId(issue.id, defaultSprint);
    }

    res.json({ ok: true, id: issue.id });
  } catch (err) {
    console.error("[TaskQueue] create task failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ------------------------------------------------------------------ */
/*  Tasks helpers (hide, reorder, points, project, sprint)            */
/* ------------------------------------------------------------------ */
app.post("/api/tasks/hidden", (req, res) => {
  try {
    const { id, hidden } = req.body ?? {};
    db.setHidden(id, hidden);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] set hidden failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/reorder", (req, res) => {
  try {
    const { id, direction } = req.body ?? {};
    if (!["up", "down"].includes(direction))
      return res.status(400).json({ error: "Invalid direction" });
    const ok = db.reorderTask(id, direction);
    res.json({ ok });
  } catch (err) {
    console.error("[TaskQueue] reorder failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/points", (req, res) => {
  try {
    const { id, points } = req.body ?? {};
    db.setPoints(id, points);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] set points failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/project", (req, res) => {
  try {
    const { id, project = "" } = req.body ?? {};
    db.setProject(id, project.trim());
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] set project failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/tasks/sprint", (req, res) => {
  try {
    const { id, sprint = "" } = req.body ?? {};
    db.setSprint(id, sprint.trim());
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] set sprint failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ------------------------------------------------------------------ */
/*  Projects & sprints overview                                        */
/* ------------------------------------------------------------------ */
app.get("/api/projects", (_req, res) => {
  try {
    res.json(db.listProjects());
  } catch (err) {
    console.error("[TaskQueue] list projects failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/sprints", (_req, res) => {
  try {
    res.json(db.listSprints());
  } catch (err) {
    console.error("[TaskQueue] list sprints failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ------------------------------------------------------------------ */
/*  Static assets & SPA fallback                                       */
/* ------------------------------------------------------------------ */
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

/* ------------------------------------------------------------------ */
/*  Server start                                                       */
/* ------------------------------------------------------------------ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[TaskQueue] Web UI listening on http://localhost:${PORT}`);
});
