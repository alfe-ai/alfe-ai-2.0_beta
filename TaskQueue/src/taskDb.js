import Database from "better-sqlite3";
import path from "path";

/**
 * Very small wrapper around better-sqlite3 for our issue store.
 * Now stores `repo`, `task_id_slug` and `priority_number` columns.
 */
export default class TaskDB {
  constructor(dbPath = path.resolve("issues.sqlite")) {
    this.db = new Database(dbPath);
    this.#init();
  }

  /**
   * Initialise / migrate DB schema.
   * – creates table if missing
   * – adds new columns when upgrading from older versions
   */
  #init() {
    // 1. Base table (legacy columns)
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

    // 2. Detect & add new columns
    const cols = this.db
      .prepare(`PRAGMA table_info('issues');`)
      .all()
      .map((c) => c.name);

    if (!cols.includes("repo")) {
      this.db.prepare(`ALTER TABLE issues ADD COLUMN repo TEXT;`).run();
    }
    if (!cols.includes("task_id_slug")) {
      this.db.prepare(`ALTER TABLE issues ADD COLUMN task_id_slug TEXT;`).run();
    }
    let addedPriority = false;
    if (!cols.includes("priority_number")) {
      this.db
        .prepare(`ALTER TABLE issues ADD COLUMN priority_number INTEGER;`)
        .run();
      addedPriority = true;
    }

    // 3. When column first introduced → assign priorities to existing rows
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

  /**
   * Compute next available priority (max + 1).
   */
  #nextPriority() {
    return (
      this.db.prepare(`SELECT COALESCE(MAX(priority_number),0)+1 AS nxt FROM issues;`).get()
        .nxt
    );
  }

  /**
   * Insert or update one GitHub issue row.
   * @param {object} issue  – raw Octokit issue object
   * @param {string} repo   – repository name (for slug / grouping)
   */
  upsertIssue(issue, repo) {
    const slug = `${repo}-${issue.id}`;

    // Preserve existing priority if record already present
    const existing = this.db
      .prepare(`SELECT priority_number FROM issues WHERE id=?;`)
      .get(issue.id);

    const priority_number =
      existing?.priority_number ?? this.#nextPriority();

    const stmt = this.db.prepare(`
      INSERT INTO issues (
        id, number, repo, task_id_slug, title, html_url, state, assignee,
        created_at, updated_at, priority_number
      )
      VALUES (
        @id, @number, @repo, @task_id_slug, @title, @html_url, @state, @assignee,
        @created_at, @updated_at, @priority_number
      )
      ON CONFLICT(id) DO UPDATE SET
        number          = excluded.number,
        repo            = excluded.repo,
        task_id_slug    = excluded.task_id_slug,
        title           = excluded.title,
        html_url        = excluded.html_url,
        state           = excluded.state,
        assignee        = excluded.assignee,
        created_at      = excluded.created_at,
        updated_at      = excluded.updated_at
        -- priority_number intentionally NOT overwritten
      ;
    `);

    stmt.run({
      id: issue.id,
      number: issue.number,
      repo,
      task_id_slug: slug,
      title: issue.title,
      html_url: issue.html_url,
      state: issue.state,
      assignee: issue.assignee?.login ?? null,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      priority_number
    });
  }

  /**
   * Swap priority with adjacent task in given direction.
   * @param {number} id         – issue id
   * @param {"up"|"down"} dir   – direction to move
   * @returns {boolean}         – true if swap happened
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
        WHERE state='open' AND priority_number ${
          dir === "up" ? "<" : ">"
        } ?
        ORDER BY priority_number ${dir === "up" ? "DESC" : "ASC"}
        LIMIT 1;
      `
      )
      .get(curr.priority_number);

    if (!neighbour) return false; // already at edge

    // Transaction – swap numbers
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

  /**
   * Mark every issue not passed in `openIds` as closed.
   */
  markClosedExcept(openIds = []) {
    const ids = openIds.map(() => "?").join(",");
    const sql =
      openIds.length === 0
        ? "UPDATE issues SET state='closed' WHERE state='open';"
        : `UPDATE issues SET state='closed' WHERE state='open' AND id NOT IN (${ids});`;

    this.db.prepare(sql).run(...openIds);
  }

  /**
   * Return all still-open issues ordered by priority.
   */
  allOpenIssues() {
    return this.db
      .prepare(
        "SELECT * FROM issues WHERE state='open' ORDER BY priority_number ASC;"
      )
      .all();
  }

  /**
   * Convenience helper for CLI sync script.
   */
  dump() {
    return this.db
      .prepare("SELECT * FROM issues ORDER BY priority_number ASC;")
      .all();
  }
}

