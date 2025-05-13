import Database from 'better-sqlite3';

export default class TaskDB {
  constructor(filepath = 'issues.sqlite') {
    this.db = new Database(filepath);
    this._init();
  }

  _init() {
    this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS issues(
            id          INTEGER PRIMARY KEY,
            number      INTEGER,
            title       TEXT,
            html_url    TEXT,
            state       TEXT,
            created_at  TEXT,
            updated_at  TEXT
        );`
      )
      .run();
  }

  upsertIssue(issue) {
    const stmt = this.db.prepare(
      `INSERT INTO issues (id, number, title, html_url, state, created_at, updated_at)
       VALUES (@id, @number, @title, @html_url, @state, @created_at, @updated_at)
       ON CONFLICT(id) DO UPDATE SET
         number     = excluded.number,
         title      = excluded.title,
         html_url   = excluded.html_url,
         state      = excluded.state,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at;`
    );
    stmt.run(issue);
  }

  /**
   * Mark every issue **not** present in openIds as closed.
   * @param {number[]} openIds
   */
  markClosedExcept(openIds) {
    if (!openIds.length) return; // nothing is open → nothing to do

    // Build "(?, ?, …)" placeholders for each ID
    const placeholders = openIds.map(() => '?').join(', ');
    const sql = `UPDATE issues SET state='closed' WHERE id NOT IN (${placeholders});`;
    this.db.prepare(sql).run(...openIds);
  }

  dump() {
    return this.db.prepare('SELECT * FROM issues ORDER BY number').all();
  }
}
