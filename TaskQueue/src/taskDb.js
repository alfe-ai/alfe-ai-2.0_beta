import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export default class TaskDB {
  constructor(dbPath = path.resolve(process.cwd(), "issues.sqlite")) {
    const firstRun = !fs.existsSync(dbPath);
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");

    this._ensureSchema(firstRun);
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Insert or update an issue row.
   * @param {object} issue Raw GitHub issue object (Octokit shape)
   */
  upsertIssue(issue) {
    const stmt = this.db.prepare(
      `INSERT INTO issues (gh_id, title, state, html_url, created_at)
         VALUES (@id, @title, @state, @html_url, @created_at)
       ON CONFLICT(gh_id) DO UPDATE SET
         title       = excluded.title,
         state       = excluded.state,
         html_url    = excluded.html_url,
         created_at  = excluded.created_at`
    );

    stmt.run({
      id: issue.id,
      title: issue.title,
      state: issue.state,
      html_url: issue.html_url,
      created_at: issue.created_at
    });
  }

  /**
   * Mark all issues as closed that are NOT listed in `openIds`.
   * @param {number[]} openIds Array of GitHub numeric issue IDs that are open.
   */
  markClosedExcept(openIds) {
    const placeholders = openIds.length
      ? `(${openIds.map(() => "?").join(",")})`
      : "(NULL)"; // forces match-nothing when list is empty

    this.db
      .prepare(
        `UPDATE issues
            SET state = 'closed'
          WHERE gh_id NOT IN ${placeholders}`
      )
      .run(openIds);
  }

  /**
   * Convenience helper for debugging – returns all rows.
   */
  dump() {
    return this.db.prepare("SELECT * FROM issues ORDER BY rowid").all();
  }

  /* ------------------------------------------------------------------ */
  /*  Private helpers                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Creates the table on first run and performs cheap migrations
   * (only additive columns for now) on subsequent launches.
   */
  _ensureSchema(firstRun) {
    if (firstRun) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS issues (
          gh_id       INTEGER PRIMARY KEY,
          title       TEXT NOT NULL,
          state       TEXT NOT NULL,
          html_url    TEXT NOT NULL,
          created_at  TEXT NOT NULL
        );
      `);
      return;
    }

    // Lightweight migration: add column if it doesn't exist yet.
    const cols = this.db
      .prepare("PRAGMA table_info(issues);")
      .all()
      .map((c) => c.name);

    if (!cols.includes("created_at")) {
      console.log("[TaskDB] Migrating DB → adding 'created_at' column …");
      this.db.exec(`ALTER TABLE issues ADD COLUMN created_at TEXT;`);
      // Fill NULLs with empty string to maintain NOT NULL invariant.
      this.db.exec(`UPDATE issues SET created_at = '' WHERE created_at IS NULL;`);
      console.log("[TaskDB] Migration complete.");
    }
  }
}
