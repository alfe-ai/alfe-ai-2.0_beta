import Database from "better-sqlite3";

export default class TaskDB {
  constructor(dbPath = "issues.sqlite") {
    this.db = new Database(dbPath);
    this._init();
  }

  /* ------------------------------------------------------------------ */
  /*  Schema bootstrap                                                  */
  /* ------------------------------------------------------------------ */
  _init() {
    /* issues – unchanged from earlier versions (kept for context) */
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id        INTEGER UNIQUE,
        repository       TEXT,
        number           INTEGER,
        title            TEXT,
        html_url         TEXT,
        task_id_slug     TEXT,
        priority_number  INTEGER,
        hidden           INTEGER DEFAULT 0,
        project          TEXT DEFAULT '',
        fib_points       INTEGER,
        assignee         TEXT,
        created_at       TEXT,
        closed           INTEGER DEFAULT 0
      );
    `);

    /* NEW: generic key/value settings table */
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  /* ------------------------------------------------------------------ */
  /*  Issue helpers (existing behaviour kept)                           */
  /* ------------------------------------------------------------------ */
  upsertIssue(issue, repositorySlug) {
    const stmt = this.db.prepare(`
      INSERT INTO issues (
        github_id, repository, number, title, html_url,
        task_id_slug, priority_number, hidden, project,
        fib_points, assignee, created_at, closed
      )
      VALUES (
        @github_id, @repository, @number, @title, @html_url,
        @task_id_slug, @priority_number, @hidden, @project,
        @fib_points, @assignee, @created_at, @closed
      )
      ON CONFLICT(github_id) DO UPDATE SET
        title           = excluded.title,
        html_url        = excluded.html_url,
        closed          = excluded.closed;
    `);

    stmt.run({
      github_id: issue.id,
      repository: repositorySlug,
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
      task_id_slug: `${repositorySlug}#${issue.number}`,
      priority_number: issue.number, // simplistic – real logic lives elsewhere
      hidden: 0,
      project: "",
      fib_points: null,
      assignee: issue.assignee?.login ?? null,
      created_at: issue.created_at,
      closed: 0
    });
  }

  markClosedExcept(openGithubIds) {
    const ids = openGithubIds.length ? openGithubIds.join(",") : "-1";
    this.db
      .prepare(
        `UPDATE issues SET closed = 1 WHERE github_id NOT IN (${ids});`
      )
      .run();
  }

  listProjects() {
    return this.db
      .prepare(
        `
        SELECT project, COUNT(*) AS count
        FROM issues
        WHERE project <> '' AND closed = 0
        GROUP BY project
        ORDER BY project COLLATE NOCASE ASC;
      `
      )
      .all();
  }

  /* ------------------------------------------------------------------ */
  /*  Settings helpers                                                  */
  /* ------------------------------------------------------------------ */
  /**
   * Fetch a single setting or return defaultVal if missing.
   * Stored values are JSON-parsed automatically.
   */
  getSetting(key, defaultVal = null) {
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key = ?;")
      .get(key);
    if (!row) return defaultVal;
    try {
      return JSON.parse(row.value);
    } catch (_) {
      return row.value;
    }
  }

  /**
   * Upsert a setting (value will be JSON-stringified).
   */
  setSetting(key, value) {
    const json = JSON.stringify(value);
    this.db
      .prepare(
        `INSERT INTO settings (key,value)
         VALUES (?,?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value;`
      )
      .run(key, json);
  }

  /**
   * Return all settings as { key: value, … } with JSON parsed.
   */
  allSettings() {
    const rows = this.db.prepare("SELECT key, value FROM settings;").all();
    const out = {};
    rows.forEach(({ key, value }) => {
      try {
        out[key] = JSON.parse(value);
      } catch {
        out[key] = value;
      }
    });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /*  Misc debugging helper                                             */
  /* ------------------------------------------------------------------ */
  dumpIssues() {
    return this.db
      .prepare("SELECT * FROM issues ORDER BY priority_number;")
      .all();
  }
}
