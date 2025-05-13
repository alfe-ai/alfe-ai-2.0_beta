import Database from "better-sqlite3";
import path from "path";

/**
 * Very small wrapper around better-sqlite3 for our issue store.
 * Stores GitHub issue meta plus queue-specific fields.
 */
export default class TaskDB {
  constructor(dbPath = path.resolve("issues.sqlite")) {
    this.db = new Database(dbPath);
    this.#init();
  }

  /**
   * Initialise / migrate DB schema.
   */
  #init() {
    // 1. Base table (run-once)
    const createSql = `
      CREATE TABLE IF NOT EXISTS issues (
        id             INTEGER PRIMARY KEY,
        number         INTEGER,
        title          TEXT,
        html_url       TEXT,
        state          TEXT,
        assignee       TEXT,
        created_at     TEXT,
        updated_at     TEXT
      );
    `;
    this.db.prepare(createSql).run();

    // 2. Detect existing columns
    const cols = this.db
      .prepare(`PRAGMA table_info('issues');`)
      .all()
      .map((c) => c.name);

    const maybeAdd = (name, ddl) => {
      if (!cols.includes(name)) {
        this.db.prepare(`ALTER TABLE issues ADD COLUMN ${ddl};`).run();
      }
    };

    maybeAdd("repo", "repo TEXT");
    maybeAdd("repository", "repository TEXT");
    maybeAdd("task_id_slug", "task_id_slug TEXT");
    maybeAdd("project", "project TEXT DEFAULT ''");
    maybeAdd("hidden", "hidden INTEGER DEFAULT 0"); // ← NEW COLUMN

    let addedPriority = false;
    if (!cols.includes("priority_number")) {
      this.db
        .prepare(`ALTER TABLE issues ADD COLUMN priority_number INTEGER;`)
        .run();
      addedPriority = true;
    }

    // 3. Assign priorities to pre-existing rows (only first time column added)
    if (addedPriority) {
      const rows = this.db
        .prepare(`SELECT id FROM issues ORDER BY created_at ASC;`)
        .all();
      const upd = this.db.prepare(
        `UPDATE issues SET priority_number=? WHERE id=?;`
      );
      rows.forEach((r, idx) => upd.run(idx + 1, r.id));
    }
  }

  #nextPriority() {
    return (
      this.db
        .prepare(
          `SELECT COALESCE(MAX(priority_number),0)+1 AS nxt FROM issues;`
        )
        .get().nxt
    );
  }

  /**
   * Insert / update GitHub issue.
   */
  upsertIssue(issue, repository) {
    const repoShort = repository.includes("/")
      ? repository.split("/").pop()
      : repository;
    const slug = `${repoShort}-${issue.id}`;

    const existing = this.db
      .prepare(`SELECT priority_number, project, hidden FROM issues WHERE id=?;`)
      .get(issue.id);

    const priority_number =
      existing?.priority_number ?? this.#nextPriority();
    const project = existing?.project ?? "";
    const hidden = existing?.hidden ?? 0;

    const stmt = this.db.prepare(`
      INSERT INTO issues (
        id, number, repo, repository, task_id_slug, title, html_url, state,
        assignee, created_at, updated_at, priority_number, project, hidden
      )
      VALUES (
        @id, @number, @repo, @repository, @task_id_slug, @title, @html_url, @state,
        @assignee, @created_at, @updated_at, @priority_number, @project, @hidden
      )
      ON CONFLICT(id) DO UPDATE SET
        number       = excluded.number,
        repo         = excluded.repo,
        repository   = excluded.repository,
        task_id_slug = excluded.task_id_slug,
        title        = excluded.title,
        html_url     = excluded.html_url,
        state        = excluded.state,
        assignee     = excluded.assignee,
        created_at   = excluded.created_at,
        updated_at   = excluded.updated_at
        -- priority_number, project, hidden remain as-is
      ;
    `);

    stmt.run({
      id: issue.id,
      number: issue.number,
      repo: repoShort,
      repository,
      task_id_slug: slug,
      title: issue.title,
      html_url: issue.html_url,
      state: issue.state,
      assignee: issue.assignee?.login ?? null,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      priority_number,
      project,
      hidden
    });
  }

  /**
   * Update `project` field.
   */
  updateProject(id, project) {
    this.db.prepare(`UPDATE issues SET project=? WHERE id=?;`).run(project, id);
  }

  /**
   * Set hidden flag (0/1).
   */
  updateHidden(id, hidden) {
    this.db.prepare(`UPDATE issues SET hidden=? WHERE id=?;`).run(hidden ? 1 : 0, id);
  }

  /**
   * Move priority.
   */
  movePriority(id, dir) {
    const curr = this.db
      .prepare(`SELECT id, priority_number FROM issues WHERE id=?;`)
      .get(id);
    if (!curr) return false;

    const neighbour = this.db
      .prepare(
        `
        SELECT id, priority_number FROM issues
        WHERE state='open' AND hidden=0 AND priority_number ${
          dir === "up" ? "<" : ">"
        } ?
        ORDER BY priority_number ${dir === "up" ? "DESC" : "ASC"}
        LIMIT 1;
      `
      )
      .get(curr.priority_number);

    if (!neighbour) return false;

    const swap = this.db.transaction((a, b) => {
      this.db
        .prepare(`UPDATE issues SET priority_number=? WHERE id=?;`)
        .run(b.priority_number, a.id);
      this.db
        .prepare(`UPDATE issues SET priority_number=? WHERE id=?;`)
        .run(a.priority_number, b.id);
    });
    swap(curr, neighbour);
    return true;
  }

  markClosedExcept(openIds = []) {
    const ids = openIds.map(() => "?").join(",");
    const sql =
      openIds.length === 0
        ? "UPDATE issues SET state='closed' WHERE state='open';"
        : `UPDATE issues SET state='closed' WHERE state='open' AND id NOT IN (${ids});`;

    this.db.prepare(sql).run(...openIds);
  }

  /**
   * Fetch open issues; hidden ones optional.
   */
  allOpenIssues({ includeHidden = false } = {}) {
    const sql = `
      SELECT * FROM issues
      WHERE state='open' ${includeHidden ? "" : "AND hidden=0"}
      ORDER BY priority_number ASC;
    `;
    return this.db.prepare(sql).all();
  }

  dump() {
    return this.db
      .prepare("SELECT * FROM issues ORDER BY priority_number ASC;")
      .all();
  }
}
