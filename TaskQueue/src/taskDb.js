/**
 * Lightweight persistence layer for GitHub issues (SQLite).
 *
 * Columns
 * ┌─────────────┬─────────┐
 * │ id          │ PK      │ GitHub internal issue ID
 * │ number      │ INT     │ Human-visible issue number (#123)
 * │ title       │ TEXT    │ Issue title
 * │ html_url    │ TEXT    │ Permalink to issue
 * │ state       │ TEXT    │ "open" / "closed"
 * │ created_at  │ TEXT    │ RFC-3339 timestamp (ISO 8601)
 * │ updated_at  │ TEXT    │ RFC-3339 timestamp (ISO 8601)  ← NEW
 * └─────────────┴─────────┘
 *
 * We store timestamps as plain ISO strings for simplicity.
 */

import Database from "better-sqlite3";

export default class TaskDB {
  constructor(dbPath = "issues.sqlite") {
    this.db = new Database(dbPath);

    // Create table if missing; add updated_at column if user had an older DB.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        id          INTEGER PRIMARY KEY,
        number      INTEGER NOT NULL,
        title       TEXT    NOT NULL,
        html_url    TEXT    NOT NULL,
        state       TEXT    NOT NULL,
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
      );
    `);

    // If an existing DB predates updated_at we might still be missing the column.
    // Attempting to add it conditionally keeps migrations zero-touch.
    try {
      this.db.exec(`ALTER TABLE issues ADD COLUMN updated_at TEXT`);
    } catch {
      /* column already exists — ignore */
    }

    this.insertStmt = this.db.prepare(`
      INSERT INTO issues (id, number, title, html_url, state, created_at, updated_at)
      VALUES            (@id,@number,@title,@html_url,@state,@created_at,@updated_at)
      ON CONFLICT(id) DO UPDATE SET
          number      = excluded.number,
          title       = excluded.title,
          html_url    = excluded.html_url,
          state       = excluded.state,
          created_at  = excluded.created_at,
          updated_at  = excluded.updated_at;
    `);

    this.markClosedStmt = this.db.prepare(
      `UPDATE issues SET state='closed' WHERE id NOT IN (@openIds)`
    );
  }

  /** Upsert / refresh a GitHub issue row. */
  upsertIssue(issue) {
    this.insertStmt.run({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
      state: issue.state,
      created_at: issue.created_at,
      updated_at: issue.updated_at
    });
  }

  /**
   * Mark every issue not present in `openIds` array as closed.
   * This keeps local state in sync with GitHub deletions / closures.
   *
   * @param {number[]} openIds
   */
  markClosedExcept(openIds) {
    // Empty array → mark everything closed.
    const ids = openIds.length ? openIds.join(",") : "NULL";
    this.markClosedStmt.run({ openIds: ids });
  }

  /** Convenience helper used by index.js for debug printing. */
  dump() {
    return this.db.prepare(`SELECT * FROM issues ORDER BY number`).all();
  }
}
