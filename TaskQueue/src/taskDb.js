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

    /* base table (wide schema) */
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
        hidden          INTEGER DEFAULT 0,
        project         TEXT DEFAULT '',
        fib_points      INTEGER,
        assignee        TEXT,
        created_at      TEXT,
        closed          INTEGER DEFAULT 0
      );
    `);

    /* simple key/value store */
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    /* indices */
    this.db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_github ON issues(github_id);`
    );
    this.db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority_number);`
    );

    console.debug("[TaskDB Debug] Finished DB schema init.");
  }

  /* ------------------------------------------------------------------ */
  /*  Upsert / sync helpers                                             */
  /* ------------------------------------------------------------------ */
  upsertIssue(issue, repositorySlug) {
    /* current row? */
    const existing = this.db
      .prepare("SELECT priority_number FROM issues WHERE github_id = ?")
      .get(issue.id);

    /* keep old priority, otherwise append to bottom */
    let priority = existing?.priority_number;
    if (!priority) {
      const max =
        this.db.prepare("SELECT MAX(priority_number) AS m FROM issues").get()
          .m || 0;
      priority = max + 1;
    }

    const row = {
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
      assignee: issue.assignee?.login || null,
      created_at: issue.created_at,
      closed: 0
    };

    const stmt = this.db.prepare(`
      INSERT INTO issues (
        github_id, repository, number, title, html_url,
        task_id_slug, priority_number, hidden, project,
        fib_points, assignee, created_at, closed
      ) VALUES (
        @github_id, @repository, @number, @title, @html_url,
        @task_id_slug, @priority_number, @hidden, @project,
        @fib_points, @assignee, @created_at, @closed
      )
      ON CONFLICT(github_id) DO UPDATE SET
        repository      = excluded.repository,
        number          = excluded.number,
        title           = excluded.title,
        html_url        = excluded.html_url,
        task_id_slug    = excluded.task_id_slug,
        priority_number = excluded.priority_number,
        assignee        = excluded.assignee,
        created_at      = excluded.created_at,
        closed          = 0               /* reopen if it re-appeared */
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
      .prepare(
        `UPDATE issues SET closed = 1 WHERE github_id NOT IN (${placeholders});`
      )
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

  reorderTask(id, direction) {
    const current = this.db
      .prepare("SELECT id, priority_number FROM issues WHERE id = ?")
      .get(id);
    if (!current) return false;

    const target = this.db
      .prepare(
        `SELECT id, priority_number FROM issues
         WHERE priority_number ${direction === "up" ? "<" : ">"}
               ?
         ORDER BY priority_number ${direction === "up" ? "DESC" : "ASC"}
         LIMIT 1`
      )
      .get(current.priority_number);

    if (!target) return false; // already at edge

    const upd = this.db.prepare(
      "UPDATE issues SET priority_number = ? WHERE id = ?"
    );
    this.db.transaction(() => {
      upd.run(-1, current.id); // temp value to avoid unique collision
      upd.run(current.priority_number, target.id);
      upd.run(target.priority_number, current.id);
    })();

    return true;
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
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key);
    return row ? this._safeParse(row.value) : undefined;
  }

  setSetting(key, value) {
    const val = JSON.stringify(value);
    this.db
      .prepare(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
      )
      .run(key, val);
  }

  /* ---------------- Project helper --------------- */
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

  /* Utility ----------------------------------------------------------- */
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
}
