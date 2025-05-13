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
/*  Static front-end                                                  */
/* ------------------------------------------------------------------ */
const publicDir = path.resolve(__dirname, "../public");
app.use(express.static(publicDir));

/* root (‘/’) – deliver SPA entry */
app.get("/", (_req, res) =>
  res.sendFile(path.join(publicDir, "index.html"))
);

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
/*  (Other API routes remain unchanged)                                */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Server start                                                       */
/* ------------------------------------------------------------------ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[TaskQueue] Web UI listening on http://localhost:${PORT}`);
});
