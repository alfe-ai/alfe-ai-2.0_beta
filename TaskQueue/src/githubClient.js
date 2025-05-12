import { Octokit } from "@octokit/rest";

/**
 * Lightweight wrapper around Octokit for our limited needs.
 */
export default class GitHubClient {
  constructor({ token, owner, repo }) {
    if (!token || !owner || !repo) {
      throw new Error("GitHub token, owner and repo must be provided");
    }

    this.owner = owner;
    this.repo = repo;
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Fetches all open issues that carry the requested label.
   * @param {string} label - GitHub label. Defaults to "task".
   * @returns {Promise<Array>} Array of issue objects.
   */
  async fetchOpenIssuesWithLabel(label = "task") {
    const { data } = await this.octokit.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      labels: label,
      state: "open"
    });
    return data;
  }
}
