import Database from "better-sqlite3";

export default class TaskDB {
  constructor(dbPath = "issues.sqlite") {
    this.db = new Database(dbPath);
    this._init();
  }

  _init() {
    console.debug("[TaskDB Debug] Initializing DB schema...");
    // Create the full issues table if it doesn't exist, including priority_number and all other columns.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id INTEGER UNIQUE,
        repository TEXT,
        number INTEGER,
        title TEXT,
        html_url TEXT,
        task_id_slug TEXT,
        priority_number INTEGER UNIQUE,
        hidden INTEGER DEFAULT 0,
        project TEXT DEFAULT '',
        fib_points INTEGER,
        assignee TEXT,
        created_at TEXT,
        closed INTEGER DEFAULT 0
      );
    `);
    this._fixLegacyColumns();
    if (!this._hasAllColumns()) {
      this._recreateIssuesTable(); // Full migration if any columns still missing
    }
    this._ensureUniquePriorities();
    this._ensureIndices();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    console.debug("[TaskDB Debug] Finished DB schema init.");
  }

  _columnExists(table, column) {
    const rows = this.db.prepare(`PRAGMA table_info(${table});`).all();
    return rows.some((r) => r.name === column);
  }

  _hasAllColumns() {
    const wanted = [
      "closed", "github_id", "repository", "number", "title", "html_url",
      "task_id_slug", "priority_number", "hidden", "project",
      "fib_points", "assignee", "created_at"
    ];
    return wanted.every((col) => this._columnExists("issues", col));
  }

  _fixLegacyColumns() {
    if (this._columnExists("issues", "priority") && !this._columnExists("issues", "priority_number")) {
      try {
        this.db.exec("ALTER TABLE issues RENAME COLUMN priority TO priority_number;");
      } catch {
        this._recreateIssuesTable();
      }
    }
  }

  _recreateIssuesTable() {
    console.warn("[TaskQueue] Rebuilding 'issues' table from scratch ...");
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE issues_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          github_id INTEGER UNIQUE,
          repository TEXT,
          number INTEGER,
          title TEXT,
          html_url TEXT,
          task_id_slug TEXT,
          priority_number INTEGER UNIQUE,
          hidden INTEGER DEFAULT 0,
          project TEXT DEFAULT '',
          fib_points INTEGER,
          assignee TEXT,
          created_at TEXT,
          closed INTEGER DEFAULT 0
        );
        INSERT INTO issues_new (
          id, github_id, repository, number, title, html_url,
          task_id_slug, priority_number, hidden, project,
          fib_points, assignee, created_at, closed
        )
        SELECT
          id, github_id, repository, number, title, html_url,
          task_id_slug, priority_number, hidden, project,
          fib_points, assignee, created_at, closed
        FROM issues;
        DROP TABLE issues;
        ALTER TABLE issues_new RENAME TO issues;
      `);
    })();
    console.warn("[TaskQueue] Successfully rebuilt 'issues' table.");
  }

  _ensureUniquePriorities() {
    const rows = this.db
        .prepare("SELECT id FROM issues ORDER BY priority_number, id;")
        .all();
    let prio = 1;
    const upd = this.db.prepare("UPDATE issues SET priority_number = ? WHERE id = ?;");
    this.db.transaction(() => rows.forEach((r) => upd.run(prio++, r.id)))();
  }

  _ensureIndices(retried = false) {
    try {
      this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_github_id ON issues(github_id);");
      this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority_number);");
    } catch (err) {
      if (!retried && /no such column/i.test(err.message || "")) {
        console.warn("[TaskQueue] Index creation error: Rebuilding table ...");
        this._recreateIssuesTable();
        this._ensureIndices(true);
      } else {
        throw err;
      }
    }
  }

  upsertIssue(issue, repositorySlug, _retry = false) {
    try {
      const existing = this.db.prepare("SELECT priority_number FROM issues WHERE github_id=?;").get(issue.id);
      let priority = existing?.priority_number;
      if (!priority) {
        priority = (this.db.prepare("SELECT COALESCE(MAX(priority_number), 0)+1 AS next;").get()).next;
      }
      const stmt = this.db.prepare(`
        INSERT INTO issues (
          github_id, repository, number, title, html_url, task_id_slug,
          priority_number, hidden, project, fib_points, assignee, created_at, closed
        ) VALUES (
          @github_id,@repository,@number,@title,@html_url,@task_id_slug,
          @priority_number,0,'',NULL,@assignee,@created_at,0
        )
        ON CONFLICT(github_id) DO UPDATE SET title=excluded.title, html_url=excluded.html_url, closed=0;
      `);
      stmt.run({
        github_id: issue.id,
        repository: repositorySlug,
        number: issue.number,
        title: issue.title,
        html_url: issue.html_url,
        task_id_slug: `${repositorySlug}#${issue.number}`,
        priority_number: priority,
        assignee: issue.assignee?.login || null,
        created_at: issue.created_at
      });
    } catch (err) {
      if (!_retry && /no such column: priority_number/i.test(err.message || "")) {
        console.warn("upsertIssue error: Rebuilding table ...");
        this._recreateIssuesTable();
        return this.upsertIssue(issue, repositorySlug, true);
      }
      throw err;
    }
  }

  markClosedExcept(openIds) {
    if (!openIds.length) {
      this.db.exec("UPDATE issues SET closed=1 WHERE closed=0;");
      return;
    }
    const placeholders = openIds.map(() => "?").join(",");
    this.db.prepare(`UPDATE issues SET closed=1 WHERE github_id NOT IN (${placeholders});`).run(...openIds);
  }

  dump() {
    return this.db.prepare("SELECT * FROM issues ORDER BY priority_number;").all();
  }

  listTasks() {
    return this.db.prepare("SELECT * FROM issues WHERE closed=0 ORDER BY priority_number;").all();
  }
}
