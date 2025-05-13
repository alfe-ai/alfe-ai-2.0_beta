/**
 * Simple SQLite wrapper around the `issues` table.
 * Keeps a local mirror of GitHub issues and their state.
 */

import Database from "better-sqlite3";

export default class TaskDB {
  constructor(dbFile = "issues.sqlite") {
    this.db = new Database(dbFile);
    this.db.pragma("journal_mode = WAL"); // safer concurrent writes

    // Auto-create schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        id          INTEGER PRIMARY KEY,   -- GitHub issue id
        title       TEXT    NOT NULL,
        url         TEXT    NOT NULL,
        state       TEXT    NOT NULL,      -- "open" / "closed"
        updated_at  TEXT    NOT NULL
      );
    `);

    // Prepared statements
    this.upsertStmt = this.db.prepare(`
      INSERT INTO issues (id, title, url, state, updated_at)
      VALUES              (@id, @title, @html_url, @state, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        title      = excluded.title,
        url        = excluded.url,
        state      = excluded.state,
        updated_at = excluded.updated_at
    `);
  }

  /**
   * Insert or update one issue row.
   * @param {object} issue Raw GitHub issue JSON
   */
  upsertIssue(issue) {
    this.upsertStmt.run(issue);
  }

  /**
   * Mark every DB row that is NOT in `openIds` as closed.
   * @param {number[]} openIds Array of still-open GitHub issue IDs.
   */
  markClosedExcept(openIds) {
    const sql =
      openIds.length === 0
        ? `UPDATE issues SET state = 'closed' WHERE state != 'closed'`
        : `UPDATE issues SET state = 'closed'
           WHERE state != 'closed' AND id NOT IN (${openIds
             .map(() => "?")
             .join(",")})`;

    this.db.prepare(sql).run(...openIds);
  }

  /** Convenience helper to dump table (debug only). */
  dump() {
    return this.db.prepare(`SELECT * FROM issues ORDER BY id`).all();
  }
}
