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

    /* 2. Make sure all desired columns are present */
    this._migrateIssuesTable();

    /* 3. Fix any duplicate / sparse priority numbers BEFORE we add
          a UNIQUE constraint on that column.                         */
    this._ensureUniquePriorities();

    /* 4. Now it is safe to add UNIQUE indices                       */
    this._ensureIndices();

    /* 5. Settings table (unchanged) */
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
  }

  /**
   * Make sure `priority_number` is unique and dense (1,2,3,…).
   * Any duplicates caused by earlier bugs are resolved here so that a
   * subsequent UNIQUE index can be created without failure.
   *
   * If the column is still missing (e.g., an unexpected legacy DB),
   * it is created on-the-fly and we return early.
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
  /*  Issue helpers                                                     */
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

  markClosedExcept(openGithubIds) {
    const ids = openGithubIds.length ? openGithubIds.join(",") : "-1";
    this.db
      .prepare(
        `UPDATE issues SET closed = 1 WHERE github_id NOT IN (${ids});`
      )
      .run();
  }

  /* ------------------------------------------------------------------ */
  /*  New helpers for web UI                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Return open tasks ordered by priority_number.
   * If includeHidden=false → hidden tasks are filtered out.
   */
  listTasks(includeHidden = false) {
    return this.db
      .prepare(
        `SELECT *
         FROM issues
         WHERE closed = 0 ${includeHidden ? "" : "AND hidden = 0"}
         ORDER BY priority_number;`
      )
      .all();
  }

  /**
   * Swap priority_number with adjacent task to move up/down.
   * @param {number} id internal issues.id
   * @param {'up'|'down'} direction
   */
  reorderTask(id, direction) {
    const tasks = this.listTasks(true); // include hidden so indexes match UI
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= tasks.length) return false;

    const cur = tasks[idx];
    const tgt = tasks[targetIdx];

    const upd = this.db.prepare(
      "UPDATE issues SET priority_number = ? WHERE id = ?;"
    );
    this.db.transaction(() => {
      upd.run(tgt.priority_number, cur.id);
      upd.run(cur.priority_number, tgt.id);
    })();
    return true;
  }

  setHidden(id, hidden) {
    this.db
      .prepare("UPDATE issues SET hidden = ? WHERE id = ?;")
      .run(hidden ? 1 : 0, id);
  }

  setPoints(id, points) {
    this.db
      .prepare("UPDATE issues SET fib_points = ? WHERE id = ?;")
      .run(points, id);
  }

  setProject(id, project) {
    this.db
      .prepare("UPDATE issues SET project = ? WHERE id = ?;")
      .run(project.trim(), id);
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
  /*  Misc debugging helpers                                            */
  /* ------------------------------------------------------------------ */
  dumpIssues() {
    return this.db
      .prepare("SELECT * FROM issues ORDER BY priority_number;")
      .all();
  }

  /**
   * Convenience wrapper so callers can simply call db.dump()
   * without worrying about the individual helpers.
   */
  dump() {
    return {
      issues: this.dumpIssues(),
      settings: this.allSettings()
    };
  }
}

