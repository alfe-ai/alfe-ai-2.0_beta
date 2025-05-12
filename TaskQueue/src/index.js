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

    console.log("[TaskQueue] Fetching tasks from GitHub …");
    const issues = await client.fetchOpenIssuesWithLabel(
      process.env.GITHUB_LABEL || "task"
    );

    issues.forEach((issue) => queue.enqueue(issue));

    console.log(`[TaskQueue] ${queue.size()} task(s) in queue.`);
    queue.print();
  } catch (err) {
    console.error("Fatal:", err.message);
    process.exit(1);
  }
}

main();
