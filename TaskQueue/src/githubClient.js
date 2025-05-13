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
   * Fetch open issues, optionally filtered by a single label.
   * If `label` is falsy → returns every open issue.
   *
   * @param {string | undefined} label
   * @returns {Promise<Array>} Array of issue objects
   */
  async fetchOpenIssues(label) {
    const params = {
      owner: this.owner,
      repo: this.repo,
      state: "open",
      per_page: 100
    };
    if (label) {
      params.labels = label;
    }

    // `paginate()` handles multi-page responses transparently.
    return await this.octokit.paginate(
      this.octokit.issues.listForRepo,
      params
    );
  }

  /**
   * Create a new GitHub issue.
   *
   * @param {string} title
   * @param {string} body
   * @returns {Promise<Object>} newly created issue object
   */
  async createIssue(title, body = "") {
    const { data } = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body
    });
    return data;
  }
}

