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

    // Base table (wide schema)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id       INTEGER UNIQUE,
        repository      TEXT,
        number          INTEGER,
        title           TEXT,
        html_url        TEXT,
        task_id_slug    TEXT,
        priority_number REAL,
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

    // Revised migration for priority_number: break into steps
    // 1) Rename if old column is present
    try {
      this.db.exec(`ALTER TABLE issues RENAME COLUMN priority_number TO priority_number_old;`);
      console.debug("[TaskDB Debug] Renamed existing priority_number -> priority_number_old");
    } catch(e) {
      console.debug("[TaskDB Debug] Skipped rename (likely doesn't exist).", e.message);
    }
    // 2) Ensure new REAL column
    try {
      this.db.exec(`ALTER TABLE issues ADD COLUMN priority_number REAL;`);
      console.debug("[TaskDB Debug] Created new priority_number column as REAL");
    } catch(e) {
      console.debug("[TaskDB Debug] Skipped add column (likely exists).", e.message);
    }
    // 3) Copy data over
    try {
      this.db.exec(`UPDATE issues SET priority_number = priority_number_old;`);
      console.debug("[TaskDB Debug] Copied data from priority_number_old to priority_number");
    } catch(e) {
      console.debug("[TaskDB Debug] Skipped copy data (maybe no old data).", e.message);
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
    // Re-create priority index without UNIQUE
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_issues_priority ON issues(priority_number);`
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

    // New table for chat tabs
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_tabs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    /* NEW: sterling_url column for chat_tabs */
    try {
      this.db.exec(`ALTER TABLE chat_tabs ADD COLUMN sterling_url TEXT;`);
      console.debug("[TaskDB Debug] Added sterling_url column to chat_tabs.");
    } catch(e) {
      console.debug("[TaskDB Debug] sterling_url column likely exists. Skipped.", e.message);
    }

    // New table for storing chat bubble pairs
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_pairs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_text TEXT NOT NULL,
        ai_text TEXT,
        model TEXT,
        timestamp TEXT NOT NULL,
        ai_timestamp TEXT,
        chat_tab_id INTEGER DEFAULT 1
      );
    `);

    // Add system_context column
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN system_context TEXT;`);
      console.debug("[TaskDB Debug] Added system_context column to chat_pairs.");
    } catch(e) {
      console.debug("[TaskDB Debug] system_context column likely exists. Skipped.", e.message);
    }

    // Add chat_tab_id if missing
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN chat_tab_id INTEGER DEFAULT 1;`);
    } catch(e) {
      // Usually means it already exists
    }

    // Add token_info column for storing token usage data
    try {
      this.db.exec(`ALTER TABLE chat_pairs ADD COLUMN token_info TEXT;`);
      console.debug("[TaskDB Debug] Added token_info column to chat_pairs.");
    } catch(e) {
      console.debug("[TaskDB Debug] token_info column likely exists. Skipped.", e.message);
    }

    // New table to store base branch per project
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS project_branches (
        project TEXT PRIMARY KEY,
        base_branch TEXT DEFAULT ''
      );
    `);

    console.debug("[TaskDB Debug] Finished DB schema init.");
  }

  /* ------------------------------------------------------------------ */
  /*  Upsert / sync helpers                                             */
  /* ------------------------------------------------------------------ */
  upsertIssue(issue, repositorySlug) {
    const existing = this.db
      .prepare(
        "SELECT priority_number, priority, project, sprint, status, dependencies, blocking FROM issues WHERE github_id = ?"
      )
      .get(issue.id);

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
        const newVal = current.priority_number - 1;
        this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?").run(newVal, current.id);
        return true;
      }
      const newVal = (current.priority_number + neighbor.priority_number) / 2;
      this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?").run(newVal, current.id);
      return true;
    } else {
      neighbor = this.db
        .prepare(
          `SELECT id, priority_number FROM issues
           WHERE priority_number > ?
           ORDER BY priority_number ASC
           LIMIT 1`
        )
        .get(current.priority_number);
      if (!neighbor) {
        const newVal = current.priority_number + 1;
        this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?").run(newVal, current.id);
        return true;
      }
      const newVal = (current.priority_number + neighbor.priority_number) / 2;
      this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?").run(newVal, current.id);
      return true;
    }
  }

  reorderAll(taskIdsInOrder) {
    const upd = this.db.prepare("UPDATE issues SET priority_number=? WHERE id=?");
    this.db.transaction(() => {
      taskIdsInOrder.forEach((taskId, index) => {
        const newVal = index + 1;
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

  /* ------------------------------------------------------------------ */
  /*  Chat storage methods                                              */
  /* ------------------------------------------------------------------ */
  createChatPair(userText, chatTabId = 1, systemContext = "") {
    const timestamp = new Date().toISOString();
    const { lastInsertRowid } = this.db.prepare(`
      INSERT INTO chat_pairs (user_text, ai_text, model, timestamp, ai_timestamp, chat_tab_id, system_context)
      VALUES (@user_text, '', '', @timestamp, NULL, @chat_tab_id, @system_context)
    `).run({
      user_text: userText,
      timestamp,
      chat_tab_id: chatTabId,
      system_context: systemContext
    });
    return lastInsertRowid;
  }

  finalizeChatPair(id, aiText, model, aiTimestamp, tokenInfo=null) {
    this.db.prepare(`
      UPDATE chat_pairs
      SET ai_text = @ai_text,
          model = @model,
          ai_timestamp = @ai_timestamp,
          token_info = @token_info
      WHERE id = @id
    `).run({
      id,
      ai_text: aiText,
      model,
      ai_timestamp: aiTimestamp,
      token_info: tokenInfo
    });
  }

  getAllChatPairs(tabId = 1) {
    return this.db
      .prepare("SELECT * FROM chat_pairs WHERE chat_tab_id=? ORDER BY id ASC")
      .all(tabId);
  }

  getPairById(id) {
    return this.db
      .prepare("SELECT * FROM chat_pairs WHERE id = ?")
      .get(id);
  }

  /* ------------------------------------------------------------------ */
  /*  Chat tabs methods                                                 */
  /* ------------------------------------------------------------------ */
  createChatTab(name, sterlingUrl = null) {
    const ts = new Date().toISOString();
    const { lastInsertRowid } = this.db.prepare(`
      INSERT INTO chat_tabs (name, created_at, sterling_url)
      VALUES (@name, @created_at, @sterling_url)
    `).run({
      name,
      created_at: ts,
      sterling_url: sterlingUrl
    });
    return lastInsertRowid;
  }

  /* NEW */
  setChatTabSterlingUrl(tabId, url) {
    this.db.prepare(`UPDATE chat_tabs SET sterling_url=? WHERE id=?`).run(url, tabId);
  }

  /* NEW helper (used by server) */
  getChatTab(tabId) {
    return this.db.prepare(`SELECT * FROM chat_tabs WHERE id=?`).get(tabId);
  }

  listChatTabs() {
    return this.db.prepare("SELECT * FROM chat_tabs ORDER BY id ASC").all();
  }

  renameChatTab(tabId, newName) {
    this.db.prepare("UPDATE chat_tabs SET name=? WHERE id=?").run(newName, tabId);
  }

  deleteChatTab(tabId) {
    this.db.prepare("DELETE FROM chat_tabs WHERE id=?").run(tabId);
    this.db.prepare("DELETE FROM chat_pairs WHERE chat_tab_id=?").run(tabId);
  }

  /* ------------------------------------------------------------------ */
  /*  Deletion methods (new)                                            */
  /* ------------------------------------------------------------------ */
  deleteChatPair(id) {
    this.db.prepare("DELETE FROM chat_pairs WHERE id=?").run(id);
  }

  /* ------------------------------------------------------------------ */
  /*  Project Branches                                                  */
  /* ------------------------------------------------------------------ */
  listProjectBranches() {
    return this.db
      .prepare("SELECT project, base_branch FROM project_branches ORDER BY project ASC")
      .all();
  }

  upsertProjectBranch(project, branch) {
    this.db.prepare(`
      INSERT INTO project_branches (project, base_branch)
      VALUES (@project, @branch)
      ON CONFLICT(project) DO UPDATE SET base_branch=excluded.base_branch
    `).run({ project, branch });
  }

  deleteProjectBranch(project) {
    this.db.prepare("DELETE FROM project_branches WHERE project=?").run(project);
  }

  /* ------------------------------------------------------------------ */
  /*  Rename Project (new)                                              */
  /* ------------------------------------------------------------------ */
  renameProject(oldProject, newProject) {
    // If old project is recognized in project_branches, keep its base_branch
    const row = this.db
      .prepare("SELECT base_branch FROM project_branches WHERE project=?")
      .get(oldProject);

    const baseBranch = row ? row.base_branch : "";

    // Remove old branch entry
    this.deleteProjectBranch(oldProject);

    // Insert new project with same branch (if newProject not empty)
    if (newProject) {
      this.upsertProjectBranch(newProject, baseBranch);
    }

    // Update issues
    this.db
      .prepare("UPDATE issues SET project=? WHERE project=?")
      .run(newProject, oldProject);
  }
}
