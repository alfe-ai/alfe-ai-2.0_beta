import { Octokit } from "@octokit/rest";

/**
 * Lightweight wrapper around Octokit for our limited needs.
 */
export default class GitHubClient {
  constructor({ token, owner, repo }) {
    this.owner = owner;
    this.repo = repo;
    if (!token || !owner || !repo) {
      console.warn(
        "[GitHubClient] Missing token/owner/repo. GitHub integration disabled."
      );
      this.octokit = null;
      return;
    }

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
    if (!this.octokit) {
      throw new Error("GitHub client not configured");
    }
    const { data } = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body,
    });
    return data;
  }

  /**
   * Update the title of an existing GitHub issue.
   *
   * @param {number} issueNumber
   * @param {string} newTitle
   */
  async updateIssueTitle(issueNumber, newTitle) {
    if (!this.octokit) {
      throw new Error("GitHub client not configured");
    }
    const { data } = await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      title: newTitle,
    });
    return data;
  }
}


