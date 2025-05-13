import Database from "better-sqlite3";
import path from "path";

/**
 * Very small wrapper around better-sqlite3 for our issue store.
 */
export default class TaskDB {
  constructor(dbPath = path.resolve("issues.sqlite")) {
    this.db = new Database(dbPath);
    this.#init();
  }

  #init() {
    const createSql = `
      CREATE TABLE IF NOT EXISTS issues (
        id         INTEGER PRIMARY KEY,
        number     INTEGER,
        title      TEXT,
        html_url   TEXT,
        state      TEXT,
        assignee   TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `;
    this.db.prepare(createSql).run();
  }

  /**
   * Insert or update one GitHub issue row.
   * Called by the GitHub sync script.
   */
  upsertIssue(issue) {
    const stmt = this.db.prepare(`
      INSERT INTO issues (id, number, title, html_url, state, assignee, created_at, updated_at)
      VALUES             (@id,@number,@title,@html_url,@state,@assignee,@created_at,@updated_at)
      ON CONFLICT(id) DO UPDATE SET
        number     = excluded.number,
        title      = excluded.title,
        html_url   = excluded.html_url,
        state      = excluded.state,
        assignee   = excluded.assignee,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at;
    `);

    stmt.run({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
      state: issue.state,
      assignee: issue.assignee?.login ?? null,
      created_at: issue.created_at,
      updated_at: issue.updated_at
    });
  }

  /**
   * Mark every issue not passed in `openIds` as closed.
   */
  markClosedExcept(openIds = []) {
    const ids = openIds.map(() => "?").join(",");
    const sql =
      openIds.length === 0
        ? "UPDATE issues SET state='closed' WHERE state='open';"
        : `UPDATE issues SET state='closed' WHERE state='open' AND id NOT IN (${ids});`;

    this.db.prepare(sql).run(...openIds);
  }

  /**
   * Return all still-open issues (for the web UI / API).
   */
  allOpenIssues() {
    return this.db
      .prepare("SELECT * FROM issues WHERE state='open' ORDER BY created_at DESC;")
      .all();
  }

  /**
   * Convenience helper used by the CLI sync script for debug dumps.
   */
  dump() {
    return this.db.prepare("SELECT * FROM issues ORDER BY created_at DESC;").all();
  }
}
