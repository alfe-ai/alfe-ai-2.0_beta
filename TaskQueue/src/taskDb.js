import Database from "better-sqlite3";

export default class TaskDB {
  constructor(dbPath = "issues.sqlite") {
    this.db = new Database(dbPath);
    this._init();
  }

  _init() {
    console.debug("[TaskDB Debug] Initializing DB schema...");
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

  _ensureUniquePriorities() {
    const rows = this.db
      .prepare("SELECT id FROM issues ORDER BY priority_number, id;")
      .all();
    let prio = 1;
    const upd = this.db.prepare("UPDATE issues SET priority_number = ? WHERE id = ?;");
    this.db.transaction(() => rows.forEach((r) => upd.run(prio++, r.id)))();
  }

  _ensureIndices() {
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_github_id ON issues(github_id);");
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority_number);");
  }

  upsertIssue(issue, repositorySlug) {
    try {
      const existing = this.db
        .prepare("SELECT priority_number FROM issues WHERE github_id = ?;")
        .get(issue.id);
      let priority = existing?.priority_number;
      if (!priority) {
        priority = this.db
          .prepare("SELECT COALESCE(MAX(priority_number), 0) + 1 AS next;")
          .get().next;
      }
      const stmt = this.db.prepare(`
        INSERT INTO issues (
          github_id, repository, number, title, html_url, task_id_slug,
          priority_number, hidden, project, fib_points, assignee, created_at, closed
        ) VALUES (
          @github_id, @repository, @number, @title, @html_url, @task_id_slug,
          @priority_number, 0, '', NULL, @assignee, @created_at, 0
        )
        ON CONFLICT(github_id) DO UPDATE
          SET title = excluded.title,
              html_url = excluded.html_url,
              closed = 0;
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
      console.error(`upsertIssue error: ${err.message}`);
      throw err;
    }
  }

  markClosedExcept(openIds) {
    if (!openIds.length) {
      this.db.exec("UPDATE issues SET closed = 1 WHERE closed = 0;");
      return;
    }
    const placeholders = openIds.map(() => "?").join(",");
    this.db
      .prepare(`UPDATE issues SET closed = 1 WHERE github_id NOT IN (${placeholders});`)
      .run(...openIds);
  }

  dump() {
    return this.db.prepare("SELECT * FROM issues ORDER BY priority_number;").all();
  }

  listTasks() {
    return this.db
      .prepare("SELECT * FROM issues WHERE closed = 0 ORDER BY priority_number;")
      .all();
  }

  getSetting(key) {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?;").get(key);
    return row ? row.value : undefined;
  }

  allSettings() {
    return this.db.prepare("SELECT key, value FROM settings;").all();
  }

  setSetting(key, value) {
    this.db
      .prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      `)
      .run(key, value);
  }

  listProjects() {
    return this.db
      .prepare(`
        SELECT project, COUNT(*) AS count
        FROM issues
        WHERE closed = 0 AND project != ''
        GROUP BY project
        ORDER BY project;
      `)
      .all();
  }

  reorderTask(id, direction) {
    const tasks = this.listTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= tasks.length) return false;
    const curr = tasks[idx];
    const swap = tasks[swapIdx];
    const update = this.db.prepare("UPDATE issues SET priority_number = ? WHERE id = ?;");
    this.db.transaction(() => {
      update.run(curr.priority_number, swap.id);
      update.run(swap.priority_number, curr.id);
    })();
    return true;
  }

  setHidden(id, hidden) {
    this.db.prepare("UPDATE issues SET hidden = ? WHERE id = ?;").run(hidden ? 1 : 0, id);
  }

  setPoints(id, points) {
    this.db.prepare("UPDATE issues SET fib_points = ? WHERE id = ?;").run(points, id);
  }

  setProject(id, project) {
    this.db.prepare("UPDATE issues SET project = ? WHERE id = ?;").run(project, id);
  }
}
```
// 