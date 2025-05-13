import Database from "better-sqlite3";
import path from "path";

/**
 * Very small wrapper around better-sqlite3 for our issue store.
 * Now stores `repo` and `task_id_slug` columns.
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
        id           INTEGER PRIMARY KEY,
        number       INTEGER,
        title        TEXT,
        html_url     TEXT,
        state        TEXT,
        assignee     TEXT,
        created_at   TEXT,
        updated_at   TEXT
      );
    `;
    this.db.prepare(createSql).run();

    // 2. Check for new columns and add them if required
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
  }

  /**
   * Insert or update one GitHub issue row.
   * @param {object} issue  – raw Octokit issue object
   * @param {string} repo   – repository name (for slug / grouping)
   */
  upsertIssue(issue, repo) {
    const slug = `${repo}-${issue.id}`;

    const stmt = this.db.prepare(`
      INSERT INTO issues (id, number, repo, task_id_slug, title, html_url, state, assignee, created_at, updated_at)
      VALUES             (@id,@number,@repo,@task_id_slug,@title,@html_url,@state,@assignee,@created_at,@updated_at)
      ON CONFLICT(id) DO UPDATE SET
        number       = excluded.number,
        repo         = excluded.repo,
        task_id_slug = excluded.task_id_slug,
        title        = excluded.title,
        html_url     = excluded.html_url,
        state        = excluded.state,
        assignee     = excluded.assignee,
        created_at   = excluded.created_at,
        updated_at   = excluded.updated_at;
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
      updated_at: issue.updated_at
    });
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
   * Return all still-open issues.
   */
  allOpenIssues() {
    return this.db
      .prepare("SELECT * FROM issues WHERE state='open' ORDER BY created_at DESC;")
      .all();
  }

  /**
   * Convenience helper for CLI sync script.
   */
  dump() {
    return this.db.prepare("SELECT * FROM issues ORDER BY created_at DESC;").all();
  }
}

