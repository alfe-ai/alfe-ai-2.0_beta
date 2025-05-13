import Database from "better-sqlite3";

export default class TaskDB {
  constructor(dbPath = "issues.sqlite") {
    this.db = new Database(dbPath);
    this._init();
  }

  /* ------------------------------------------------------------------ */
  /*  Schema bootstrap + migration                                      */
  /* ------------------------------------------------------------------ */
  _init() {
    /* 1. Ensure table exists (minimal columns to get started) */
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        id     INTEGER PRIMARY KEY AUTOINCREMENT
      );
    `);

    /* 2. Bring table up-to-date column-wise */
    this._migrateIssuesTable();

    /* 3. Settings table (unchanged) */
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  /**
   * Compare existing columns of `issues` against our desired schema and
   * add whatever is missing. This keeps old databases compatible without
   * data loss.
   */
  _migrateIssuesTable() {
    /* Desired columns with "ALTER TABLE" fragments */
    const wanted = {
      closed:          "INTEGER DEFAULT 0",
      github_id:       "INTEGER",
      repository:      "TEXT",
      number:          "INTEGER",
      title:           "TEXT",
      html_url:        "TEXT",
      task_id_slug:    "TEXT",
      priority_number: "INTEGER",
      hidden:          "INTEGER DEFAULT 0",
      project:         "TEXT DEFAULT ''",
      fib_points:      "INTEGER",
      assignee:        "TEXT",
      created_at:      "TEXT"
    };

    /* Actual columns present */
    const presentRows = this.db.prepare("PRAGMA table_info(issues);").all();
    const present = new Set(presentRows.map((r) => r.name));

    const missing = Object.keys(wanted).filter((c) => !present.has(c));
    if (missing.length) {
      console.log(
        `[TaskQueue] Migrating issues table – adding columns: ${missing.join(
          ", "
        )}`
      );
      this.db.transaction(() => {
        missing.forEach((col) =>
          this.db.exec(`ALTER TABLE issues ADD COLUMN ${col} ${wanted[col]};`)
        );
      })();
    }

    /* Ensure UNIQUE index on github_id (cannot add UNIQUE via ALTER) */
    this.db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_github_id ON issues(github_id);"
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Issue helpers                                                     */
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
        title    = excluded.title,
        html_url = excluded.html_url,
        closed   = excluded.closed;
    `);

    stmt.run({
      github_id: issue.id,
      repository: repositorySlug,
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
      task_id_slug: `${repositorySlug}#${issue.number}`,
      priority_number: issue.number,
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
