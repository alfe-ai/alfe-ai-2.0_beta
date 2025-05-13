import dotenv from "dotenv";
import GitHubClient from "./githubClient.js";
import TaskQueue from "./taskQueue.js";
import TaskDB from "./taskDb.js";

dotenv.config();

async function main() {
  try {
    const client = new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO
    });

    const db = new TaskDB(); // creates issues.sqlite in cwd
    const queue = new TaskQueue();

    const label = process.env.GITHUB_LABEL;
    console.log(
      `[TaskQueue] Fetching tasks from GitHub ${
        label ? `(label='${label}')` : "(all open issues)"
      } …`
    );

    const issues = await client.fetchOpenIssues(label?.trim() || undefined);

    // ------------------------------------------------------------------
    // 1. Synchronise local DB
    // ------------------------------------------------------------------
    issues.forEach((iss) => db.upsertIssue(iss));

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
