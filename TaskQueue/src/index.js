import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import GitHubClient from "./githubClient.js";
import TaskQueue from "./taskQueue.js";
import TaskDB from "./taskDb.js";

dotenv.config();

/**
 * Create a timestamped backup of issues.sqlite (if it exists).
 */
function backupDb() {
  const dbPath = path.resolve("issues.sqlite");
  if (!fs.existsSync(dbPath)) {
    console.log("[TaskQueue] No existing DB to backup (first run).");
    return;
  }

  const backupsDir = path.resolve("backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  // ISO string is filesystem-friendly after removing colon/period characters.
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupsDir, `issues-${ts}.sqlite`);

  fs.copyFileSync(dbPath, backupPath);
  console.log(`[TaskQueue] Backup created: ${backupPath}`);
}

async function main() {
  try {
    // ------------------------------------------------------------------
    // 0. Safety first – create backup
    // ------------------------------------------------------------------
    backupDb();

    const client = new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO
    });

    const db = new TaskDB(); // creates/open issues.sqlite in cwd
    const queue = new TaskQueue();

    const label = process.env.GITHUB_LABEL;
    console.log(
      `[TaskQueue] Fetching tasks from GitHub ${
        label ? `(label='${label}')` : "(all open issues)"
      } …`
    );

    const issues = await client.fetchOpenIssues(label?.trim() || undefined);

    // Build full repository slug once
    const repositorySlug = `${client.owner}/${client.repo}`;

    // ------------------------------------------------------------------
    // 1. Synchronise local DB
    // ------------------------------------------------------------------
    issues.forEach((iss) => db.upsertIssue(iss, repositorySlug));

    // Closed issue detection
    const openIds = issues.map((i) => i.id);
    db.markClosedExcept(openIds);

    // ------------------------------------------------------------------
    // 2. Populate in-memory queue (only open issues)
    // ------------------------------------------------------------------
    issues.forEach((issue) => queue.enqueue(issue));

    console.log(`[TaskQueue] ${queue.size()} task(s) in queue.`);
    queue.print();

    // Debug: show DB snapshot (can be removed)
    console.debug("[TaskQueue] Current DB state:", db.dump());
  } catch (err) {
    console.error("Fatal:", err.message);
    process.exit(1);
  }
}

main();



