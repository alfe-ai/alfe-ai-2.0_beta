import Database from "better-sqlite3";

export default class TaskDB {
  constructor(dbPath = "issues.sqlite") {
    this.db = new Database(dbPath);
    this._init();
  }

  /* ------------------------------------------------------------------ */
  /*  Schema bootstrap & migrations                                     */
  /* ------------------------------------------------------------------ */
  _init() {
    console.debug("[TaskDB Debug] Initializing DB schema…");

    // Base table (wide schema) - unchanged from prior version
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id       INTEGER UNIQUE,
        repository      TEXT,
        number          INTEGER,
        title           TEXT,
        html_url        TEXT,
        task_id_slug    TEXT,
        priority_number INTEGER UNIQUE,
        priority        TEXT DEFAULT 'Medium',
        hidden          INTEGER DEFAULT 0,
        project         TEXT DEFAULT '',
        sprint          TEXT DEFAULT '',
        fib_points      INTEGER,
        assignee        TEXT,
        created_at      TEXT,
        closed          INTEGER DEFAULT 0
      );
    `);

    // Additional columns
    try {
      this.db.exec(`ALTER TABLE issues ADD COLUMN sprint TEXT DEFAULT '';`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE issues ADD COLUMN priority TEXT DEFAULT 'Medium';`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE issues ADD COLUMN status TEXT DEFAULT 'Not Started';`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE issues ADD COLUMN dependencies TEXT DEFAULT '';`);
    } catch {}
    try {
      this.db.exec(`ALTER TABLE issues ADD COLUMN blocking TEXT DEFAULT '';`);
    } catch {}

    // Migrate priority_number to REAL if needed
    // (We simply add a new column, copy data, then attempt to clean up.)
    try {
      this.db.exec(`ALTER TABLE issues RENAME COLUMN priority_number TO priority_number_old;`);
      this.db.exec(`ALTER TABLE issues ADD COLUMN priority_number REAL UNIQUE;`);
      this.db.exec(`UPDATE issues SET priority_number = priority_number_old;`);
      // Create index if missing
      this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority_number);`);
      // priority_number_old stays behind since dropping a column isn’t trivial in SQLite
    } catch {
      // If this fails, it likely means the column rename was already done
      // or it's already REAL. We ignore errors here.
    }

    // Simple key/value store
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Index for GitHub IDs
    this.db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_github ON issues(github_id);`
    );
    // Re-create priority index (just in case)
    this.db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority_number);`
    );

    // Activity timeline
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activity_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT
      );
    `);

    console.debug("[TaskDB Debug] Finished DB schema init.");
  }

  /* ------------------------------------------------------------------ */
  /*  Upsert / sync helpers                                             */
  /* ------------------------------------------------------------------ */
  upsertIssue(issue, repositorySlug) {
    // Keep existing row if present
    const existing = this.db
      .prepare(
        "SELECT priority_number, priority, project, sprint, status, dependencies, blocking FROM issues WHERE github_id = ?"
      )
      .get(issue.id);

    // Numeric priority
    let priorityNum = existing?.priority_number;
    if (!priorityNum) {
      const max =
        this.db.prepare("SELECT MAX(priority_number) AS m FROM issues").get()
          .m || 0;
      priorityNum = max + 1;
    }

    const row = {
      github_id: issue.id,
      repository: repositorySlug,
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
      task_id_slug: `${repositorySlug}#${issue.number}`,
      priority_number: priorityNum,
      priority: existing?.priority ?? "Medium",
      hidden: 0,
      project: existing?.project ?? this.getSetting("default_project") ?? "",
      sprint: existing?.sprint ?? this.getSetting("default_sprint") ?? "",
      fib_points: null,
      assignee: issue.assignee?.login || null,
      created_at: issue.created_at,
      closed: 0,
      status: existing?.status ?? "Not Started",
      dependencies: existing?.dependencies ?? "",
      blocking: existing?.blocking ?? ""
    };

    const stmt = this.db.prepare(`
      INSERT INTO issues (
        github_id, repository, number, title, html_url,
        task_id_slug, priority_number, priority, hidden,
        project, sprint, fib_points, assignee, created_at, closed, status,
        dependencies, blocking
      ) VALUES (
        @github_id, @repository, @number, @title, @html_url,
        @task_id_slug, @priority_number, @priority, @hidden,
        @project, @sprint, @fib_points, @assignee, @created_at, @closed, @status,
        @dependencies, @blocking
      )
      ON CONFLICT(github_id) DO UPDATE SET
        repository      = excluded.repository,
        number          = excluded.number,
        title           = excluded.title,
        html_url        = excluded.html_url,
        task_id_slug    = excluded.task_id_slug,
        priority_number = excluded.priority_number,
        priority        = excluded.priority,
        assignee        = excluded.assignee,
        created_at      = excluded.created_at,
        closed          = 0,
        status          = issues.status,
        dependencies    = issues.dependencies,
        blocking        = issues.blocking
    `);

    stmt.run(row);
  }

  markClosedExcept(openGithubIds) {
    if (!openGithubIds.length) {
      this.db.exec("UPDATE issues SET closed = 1 WHERE closed = 0;");
      return;
    }
    const placeholders = openGithubIds.map(() => "?").join(",");
    this.db
      .prepare(`UPDATE issues SET closed = 1 WHERE github_id NOT IN (${placeholders});`)
      .run(...openGithubIds);
  }

  /* ------------------------------------------------------------------ */
  /*  Public getters / mutators used by web server                      */
  /* ------------------------------------------------------------------ */
  listTasks(includeHidden = false) {
    const sql = includeHidden
      ? "SELECT * FROM issues WHERE closed = 0 ORDER BY priority_number;"
      : "SELECT * FROM issues WHERE closed = 0 AND hidden = 0 ORDER BY priority_number;";
    return this.db.prepare(sql).all();
  }

  /* 
    Updated reorderTask to set a new float priority_number 
    between the current item and its neighbor, preventing duplicates.
  */
  reorderTask(id, direction) {
    const current = this.db
      .prepare("SELECT id, priority_number FROM issues WHERE id = ?")
      .get(id);
    if (!current) return false;

    let neighbor;
    if (direction === "up") {
      neighbor = this.db
        .prepare(
          `SELECT id, priority_number FROM issues
           WHERE priority_number < ?
           ORDER BY priority_number DESC
           LIMIT 1`
        )
        .get(current.priority_number);
      if (!neighbor) {
        // It's already at the top, just subtract 1
        const newVal = current.priority_number - 1;
        this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?").run(newVal, current.id);
        return true;
      }
      // midpoint
      const newVal = (current.priority_number + neighbor.priority_number) / 2;
      this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?").run(newVal, current.id);
      return true;
    } else {
      // direction down
      neighbor = this.db
        .prepare(
          `SELECT id, priority_number FROM issues
           WHERE priority_number > ?
           ORDER BY priority_number ASC
           LIMIT 1`
        )
        .get(current.priority_number);
      if (!neighbor) {
        // It's already at the bottom, just add 1
        const newVal = current.priority_number + 1;
        this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?").run(newVal, current.id);
        return true;
      }
      const newVal = (current.priority_number + neighbor.priority_number) / 2;
      this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?").run(newVal, current.id);
      return true;
    }
  }

  /* 
    Updated reorderAll to assign consecutive float values,
    ensuring no duplicates.
  */
  reorderAll(taskIdsInOrder) {
    const upd = this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?");
    this.db.transaction(() => {
      // Assign unique floats in order
      taskIdsInOrder.forEach((taskId, index) => {
        const newVal = index + 1; // e.g. 1.0, 2.0, 3.0
        upd.run(newVal, taskId);
      });
    })();
  }

  setHidden(id, hidden) {
    this.db.prepare("UPDATE issues SET hidden = ? WHERE id = ?").run(
      hidden ? 1 : 0,
      id
    );
  }

  setPoints(id, points) {
    this.db.prepare("UPDATE issues SET fib_points = ? WHERE id = ?").run(
      points,
      id
    );
  }

  setProject(id, project) {
    this.db.prepare("UPDATE issues SET project = ? WHERE id = ?").run(
      project,
      id
    );
  }

  setSprint(id, sprint) {
    this.db.prepare("UPDATE issues SET sprint = ? WHERE id = ?").run(
      sprint,
      id
    );
  }

  setPriority(id, priority) {
    this.db.prepare("UPDATE issues SET priority = ? WHERE id = ?").run(
      priority,
      id
    );
  }

  setStatus(id, status) {
    this.db.prepare("UPDATE issues SET status = ? WHERE id = ?").run(
      status,
      id
    );
  }

  setDependencies(id, deps) {
    this.db.prepare("UPDATE issues SET dependencies = ? WHERE id = ?").run(
      deps,
      id
    );
  }

  setBlocking(id, blocks) {
    this.db.prepare("UPDATE issues SET blocking = ? WHERE id = ?").run(
      blocks,
      id
    );
  }

  /* NEW: helpers by GitHub ID (for freshly created tasks) */
  setProjectByGithubId(githubId, project) {
    this.db
      .prepare("UPDATE issues SET project = ? WHERE github_id = ?")
      .run(project, githubId);
  }

  setSprintByGithubId(githubId, sprint) {
    this.db
      .prepare("UPDATE issues SET sprint = ? WHERE github_id = ?")
      .run(sprint, githubId);
  }

  /* ---------------- Settings table ---------------- */
  allSettings() {
    return this.db
      .prepare("SELECT key, value FROM settings")
      .all()
      .map((r) => ({
        key: r.key,
        value: this._safeParse(r.value)
      }));
  }

  getSetting(key) {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return row ? this._safeParse(row.value) : undefined;
  }

  setSetting(key, value) {
    const val = JSON.stringify(value);
    this.db
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
      .run(key, val);
  }

  listProjects() {
    return this.db
      .prepare(
        `SELECT
           project,
           COUNT(*) AS count
         FROM issues
         WHERE closed = 0 AND hidden = 0
         GROUP BY project
         HAVING project <> ''
         ORDER BY count DESC;`
      )
      .all();
  }

  listSprints() {
    return this.db
      .prepare(
        `SELECT
           sprint,
           COUNT(*) AS count
         FROM issues
         WHERE closed = 0 AND hidden = 0
         GROUP BY sprint
         HAVING sprint <> ''
         ORDER BY count DESC;`
      )
      .all();
  }

  dump() {
    return this.db
      .prepare("SELECT * FROM issues ORDER BY priority_number")
      .all();
  }

  _safeParse(val) {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  New retrieval methods for this commit                             */
  /* ------------------------------------------------------------------ */
  getTaskById(id) {
    return this.db
      .prepare("SELECT * FROM issues WHERE id=?")
      .get(id);
  }

  listTasksByProject(project) {
    return this.db
      .prepare("SELECT * FROM issues WHERE project=? AND closed=0 ORDER BY priority_number")
      .all(project);
  }

  listTasksBySprint(sprint) {
    return this.db
      .prepare("SELECT * FROM issues WHERE sprint=? AND closed=0 ORDER BY priority_number")
      .all(sprint);
  }

  setTitle(id, newTitle) {
    this.db.prepare("UPDATE issues SET title = ? WHERE id = ?").run(newTitle, id);
  }

  /* ------------------------------------------------------------------ */
  /*  Activity logging                                                  */
  /* ------------------------------------------------------------------ */
  logActivity(action, details) {
    this.db
      .prepare("INSERT INTO activity_timeline (timestamp, action, details) VALUES (?, ?, ?)")
      .run(new Date().toISOString(), action, details ?? "");
  }

  getActivity() {
    return this.db
      .prepare("SELECT * FROM activity_timeline ORDER BY id DESC")
      .all();
  }
}
