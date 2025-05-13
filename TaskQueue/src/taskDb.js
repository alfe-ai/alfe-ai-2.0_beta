import Database from "better-sqlite3";

export default class TaskDB {
  constructor(dbPath = "issues.sqlite") {
    this.db = new Database(dbPath);
    this._init();
  }

  /* ------------------------------------------------------------------ */
  /*  Small util                                                         */
  /* ------------------------------------------------------------------ */
  _columnExists(table, column) {
    const rows = this.db.prepare(`PRAGMA table_info(${table});`).all();
    return rows.some((r) => r.name === column);
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

    /* 2. Bring legacy schemas forward BEFORE anything touches the table */
    this._fixLegacyColumns();

    /* 3. Make sure all desired columns are present                     */
    this._migrateIssuesTable();

    /* 4. Remove duplicate / sparse priority numbers                    */
    this._ensureUniquePriorities();

    /* 5. Indices                                                       */
    this._ensureIndices();

    /* 6. Settings table (unchanged)                                    */
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  /**
   * Handle older DBs that used the name `priority` instead of
   * `priority_number`.  The rename must happen *before* any statement
   * references the new column name or Node will crash with
   * “no such column: priority_number”.
   */
  _fixLegacyColumns() {
    const hasOld = this._columnExists("issues", "priority");
    const hasNew = this._columnExists("issues", "priority_number");

    if (hasOld && !hasNew) {
      console.log(
        "[TaskQueue] Detected legacy column 'priority' – renaming to 'priority_number'"
      );
      // SQLite ≥3.25 supports RENAME COLUMN
      this.db.exec(
        "ALTER TABLE issues RENAME COLUMN priority TO priority_number;"
      );
    }
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
  }

  /**
   * Make sure `priority_number` is unique and dense (1,2,3,…).
   * Any duplicates caused by earlier bugs are resolved here so that a
   * subsequent UNIQUE index can be created without failure.
   *
   * If the column is still missing (very first run) it is created
   * on-the-fly and we return early.
   */
  _ensureUniquePriorities() {
    /* Safeguard: add column if for some reason it still doesn’t exist */
    if (!this._columnExists("issues", "priority_number")) {
      console.warn(
        "[TaskQueue] priority_number column missing – creating on the fly."
      );
      this.db.exec("ALTER TABLE issues ADD COLUMN priority_number INTEGER;");
      return; // nothing else to do – DB has no data yet
    }

    const rows = this.db
      .prepare(
        "SELECT id, priority_number FROM issues ORDER BY priority_number, id;"
      )
      .all();

    let expected = 1;
    const upd = this.db.prepare(
      "UPDATE issues SET priority_number = ? WHERE id = ?;"
    );

    this.db.transaction(() => {
      rows.forEach((r) => {
        if (r.priority_number !== expected) {
          upd.run(expected, r.id);
        }
        expected += 1;
      });
    })();
  }

  /**
   * Ensure all required (unique) indices exist.
   * This is executed *after* priority numbers have been deduplicated so
   * index creation cannot fail with “UNIQUE constraint failed”.
   */
  _ensureIndices() {
    this.db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_github_id ON issues(github_id);"
    );
    this.db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority_number);"
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Issue helpers  (unchanged below)                                  */
  /* ------------------------------------------------------------------ */
  upsertIssue(issue, repositorySlug) {
    /* If issue already recorded: keep its priority */
    const existing = this.db
      .prepare("SELECT priority_number FROM issues WHERE github_id = ?;")
      .get(issue.id);

    let priority = existing?.priority_number;
    if (!priority) {
      /* New issue → append to bottom */
      const row = this.db
        .prepare("SELECT COALESCE(MAX(priority_number), 0) + 1 AS next;")
        .get();
      priority = row.next;
    }

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
      priority_number: priority,
      hidden: 0,
      project: "",
      fib_points: null,
      assignee: issue.assignee?.login ?? null,
      created_at: issue.created_at,
      closed: 0
    });
  }

  /* ---------------- Remaining methods unchanged -------------------- */
  // (getSetting, setSetting, listTasks, reorderTask, etc.)
  // The rest of the file remains identical to the previous version.
}
