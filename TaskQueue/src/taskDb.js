import Database from "better-sqlite3";

export default class TaskDB {
  constructor(dbPath = "issues.sqlite") {
    this.db = new Database(dbPath);
    this._init();
  }

  /* ------------------------------------------------------------------ */
  /*  Small utils                                                        */
  /* ------------------------------------------------------------------ */
  _columnExists(table, column) {
    console.debug(`[TaskDB Debug] Checking if column '${column}' exists in '${table}'...`);
    const rows = this.db.prepare(`PRAGMA table_info(${table});`).all();
    const exists = rows.some((r) => r.name === column);
    console.debug(`[TaskDB Debug] Column '${column}' in '${table}' existence: ${exists}`);
    return exists;
  }

  _addColumnIfMissing(table, column, definition = "INTEGER") {
    console.debug(`[TaskDB Debug] Checking column '${column}' on table '${table}' with definition '${definition}'...`);
    if (!this._columnExists(table, column)) {
      console.warn(`[TaskQueue] Column '${column}' missing in '${table}' – attempting to add (${definition})`);
      try {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
        console.debug(`[TaskDB Debug] Column '${column}' successfully added.`);
        // Double-check
        if (!this._columnExists(table, column)) {
          console.warn(`[TaskDB Debug] Column '${column}' not found after creation attempt in '${table}'.`);
        }
      } catch (e) {
        console.error(`[TaskDB Debug] Failed to add column '${column}' to '${table}':`, e.message);
        if (!/duplicate column/i.test(e.message || "")) throw e;
      }
    } else {
      console.debug(`[TaskDB Debug] Column '${column}' already present in '${table}', skipping add.`);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Schema bootstrap + migration                                      */
  /* ------------------------------------------------------------------ */
  _init() {
    console.debug("[TaskDB Debug] Initializing DB schema...");
    /* 1. Ensure table exists (minimal columns to get started) */
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT
      );
    `);

    /* 2. Bring legacy schemas forward BEFORE anything touches the table */
    this._fixLegacyColumns();

    /* 3. Make sure all desired columns are present                     */
    this._migrateIssuesTable();

    /* 4. Remove duplicate / sparse priority numbers                    */
    this._ensureUniquePriorities();

    /* 5. Indices (may add column on-the-fly if still missing)          */
    this._ensureIndices();

    /* 6. Settings table (unchanged)                                    */
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    console.debug("[TaskDB Debug] Finished DB schema init.");
  }

  /**
   * Handle older DBs that used the name `priority` instead of
   * `priority_number`. Attempt direct rename; if it fails, do a fallback.
   */
  _fixLegacyColumns() {
    console.debug("[TaskDB Debug] Checking for legacy columns...");
    const hasOld = this._columnExists("issues", "priority");
    const hasNew = this._columnExists("issues", "priority_number");

    if (hasOld && !hasNew) {
      console.log("[TaskQueue] Detected legacy column 'priority' – attempting rename to 'priority_number'");
      try {
        this.db.exec("ALTER TABLE issues RENAME COLUMN priority TO priority_number;");
        console.debug("[TaskDB Debug] Rename of 'priority' to 'priority_number' succeeded.");
      } catch (err) {
        console.error("[TaskQueue] Rename column failed; attempting fallback approach:", err.message);
        /* fallback approach: create 'priority_number' if missing and copy data */
        this._addColumnIfMissing("issues", "priority_number", "INTEGER");
        try {
          this.db.exec(`
            UPDATE issues
               SET priority_number = priority
             WHERE priority_number IS NULL
          `);
          console.log("[TaskQueue] Fallback approach complete.");
        } catch (copyErr) {
          console.error("[TaskQueue] Fallback copy failed:", copyErr.message);
        }
      }
    }
  }

  /**
   * Compare existing columns of `issues` against our desired schema and
   * add whatever is missing. This keeps old databases compatible without
   * data loss.
   */
  _migrateIssuesTable() {
    console.debug("[TaskDB Debug] Migrating 'issues' table to ensure all columns are present...");
    const wanted = {
      closed: "INTEGER DEFAULT 0",
      github_id: "INTEGER",
      repository: "TEXT",
      number: "INTEGER",
      title: "TEXT",
      html_url: "TEXT",
      task_id_slug: "TEXT",
      priority_number: "INTEGER",
      hidden: "INTEGER DEFAULT 0",
      project: "TEXT DEFAULT ''",
      fib_points: "INTEGER",
      assignee: "TEXT",
      created_at: "TEXT"
    };

    const presentRows = this.db.prepare("PRAGMA table_info(issues);").all();
    const present = new Set(presentRows.map((r) => r.name));

    const missing = Object.keys(wanted).filter((c) => !present.has(c));
    if (missing.length) {
      console.log(
        `[TaskQueue] Migrating issues table – adding columns: ${missing.join(", ")}`
      );
      this.db.transaction(() => {
        missing.forEach((col) => {
          try {
            console.debug(`[TaskDB Debug] Adding missing column '${col}' with definition '${wanted[col]}'`);
            this.db.exec(`ALTER TABLE issues ADD COLUMN ${col} ${wanted[col]};`);
          } catch (err) {
            console.error(`[TaskDB Debug] Failed to add column '${col}':`, err.message);
            if (!/duplicate column/i.test(err.message || "")) throw err;
          }
        });
      })();
    } else {
      console.debug("[TaskDB Debug] No missing columns detected in 'issues' table.");
    }
  }

  /**
   * Make sure `priority_number` is unique and dense (1,2,3,…).
   */
  _ensureUniquePriorities() {
    console.debug("[TaskDB Debug] Ensuring 'priority_number' is consistent and unique...");
    this._addColumnIfMissing("issues", "priority_number", "INTEGER");

    const rows = this.db
      .prepare("SELECT id, priority_number FROM issues ORDER BY priority_number, id;")
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
   */
  _ensureIndices(retried = false) {
    console.debug("[TaskDB Debug] Ensuring unique indices exist on 'issues' table...");
    try {
      this.db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_github_id ON issues(github_id);"
      );
      this.db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority_number);"
      );
      console.debug("[TaskDB Debug] Indices created/verified successfully.");
    } catch (err) {
      console.error("[TaskDB Debug] Failed to create indices:", err.message);
      if (!retried && /no such column: priority_number/i.test(err.message || "")) {
        console.warn("[TaskQueue] Index creation failed – missing 'priority_number'. Attempting automatic fix.");
        this._addColumnIfMissing("issues", "priority_number", "INTEGER");
        this._ensureIndices(true);
        return;
      }
      throw err;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Issue helpers                                                     */
  /* ------------------------------------------------------------------ */
  upsertIssue(issue, repositorySlug, _retry = false) {
    console.debug(`[TaskDB Debug] upsertIssue called for GitHub issue ID: ${issue.id}`);
    this._addColumnIfMissing("issues", "priority_number", "INTEGER");

    try {
      const existing = this.db
        .prepare("SELECT priority_number FROM issues WHERE github_id = ?;")
        .get(issue.id);

      let priority = existing?.priority_number;
      if (!priority) {
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
      console.debug(`[TaskDB Debug] upsertIssue succeeded for GitHub issue ID: ${issue.id}`);
    } catch (err) {
      console.error(
        `[TaskDB Debug] upsertIssue encountered error for ID ${issue.id}:`,
        err.message
      );
      if (
        !_retry &&
        /no such column: priority_number/i.test(err.message || "")
      ) {
        console.warn(
          "[TaskQueue] Write failed – priority_number column still absent. Attempting full re-migration and retry once."
        );
        this._migrateIssuesTable();
        this._ensureIndices();
        return this.upsertIssue(issue, repositorySlug, true);
      }
      throw err;
    }
  }

  getSetting(key) {
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key = ?;")
      .get(key);
    if (!row) return undefined;
    return JSON.parse(row.value);
  }

  setSetting(key, value) {
    const valStr = JSON.stringify(value ?? null);
    this.db
      .prepare(
        `INSERT INTO settings (key, value)
         VALUES (@key, @value)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value;`
      )
      .run({ key, value: valStr });
  }

  allSettings() {
    const rows = this.db.prepare("SELECT key, value FROM settings;").all();
    return rows.map((r) => ({
      key: r.key,
      value: JSON.parse(r.value)
    }));
  }

  listTasks(includeHidden = false) {
    const sql = includeHidden
      ? "SELECT * FROM issues WHERE closed=0 ORDER BY priority_number;"
      : "SELECT * FROM issues WHERE closed=0 AND hidden=0 ORDER BY priority_number;";
    return this.db.prepare(sql).all();
  }

  markClosedExcept(openIds) {
    if (!openIds.length) {
      this.db.exec("UPDATE issues SET closed=1 WHERE closed=0;");
      return;
    }

    const placeholders = openIds.map(() => "?").join(",");
    this.db
      .prepare(`UPDATE issues SET closed=1 WHERE id NOT IN (${placeholders});`)
      .run(...openIds);
  }

  reorderTask(id, direction) {
    const currentRow = this.db
      .prepare("SELECT id, priority_number FROM issues WHERE id=?;")
      .get(id);
    if (!currentRow) return false;

    const adj = direction === "up" ? -1 : 1;
    const swapRow = this.db
      .prepare("SELECT id, priority_number FROM issues WHERE priority_number=?;")
      .get(currentRow.priority_number + adj);

    if (!swapRow) return false;

    const swapStmt = this.db.prepare(
      "UPDATE issues SET priority_number=? WHERE id=?;"
    );
    const t = this.db.transaction(() => {
      swapStmt.run(swapRow.priority_number, currentRow.id);
      swapStmt.run(currentRow.priority_number, swapRow.id);
    });
    t();
    return true;
  }

  setHidden(id, hidden) {
    this.db
      .prepare("UPDATE issues SET hidden=? WHERE id=?;")
      .run(hidden ? 1 : 0, id);
  }

  setPoints(id, points) {
    this.db
      .prepare("UPDATE issues SET fib_points=? WHERE id=?;")
      .run(points, id);
  }

  setProject(id, project) {
    this.db
      .prepare("UPDATE issues SET project=? WHERE id=?;")
      .run(project, id);
  }

  listProjects() {
    const sql = `
      SELECT project, COUNT(*) as count
        FROM issues
       WHERE closed=0
    GROUP BY project
    HAVING project != ''
    ORDER BY count DESC;
    `;
    return this.db.prepare(sql).all();
  }

  dump() {
    return this.db.prepare("SELECT * FROM issues ORDER BY priority_number;").all();
  }
}

