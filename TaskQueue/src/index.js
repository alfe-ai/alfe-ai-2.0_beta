import dotenv from "dotenv";
import GitHubClient from "./githubClient.js";
import TaskQueue from "./taskQueue.js";

dotenv.config();

async function main() {
  try {
    const client = new GitHubClient({
      token: process.env.GITHUB_TOKEN,
      owner: process.env.GITHUB_OWNER,
      repo: process.env.GITHUB_REPO
    });

    const queue = new TaskQueue();

    const label = process.env.GITHUB_LABEL; // may be undefined / empty
    console.log(
      `[TaskQueue] Fetching tasks from GitHub ${
        label ? `(label='${label}')` : "(all open issues)"
      } …`
    );

    const issues = await client.fetchOpenIssues(label?.trim() || undefined);
    issues.forEach((issue) => queue.enqueue(issue));

    console.log(`[TaskQueue] ${queue.size()} task(s) in queue.`);
    queue.print();
  } catch (err) {
    console.error("Fatal:", err.message);
    process.exit(1);
  }
}

main();
