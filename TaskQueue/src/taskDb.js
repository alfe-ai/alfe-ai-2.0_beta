import Database from "better-sqlite3";

export default class TaskDB {
    constructor(dbPath = "issues.sqlite") {
        this.db = new Database(dbPath);
        this._init();
    }

    _init() {
        console.debug("[TaskDB Debug] Initializing DB schema...");
        // Create the issues table with full schema, including priority_number
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS issues (
                                                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                  github_id INTEGER UNIQUE,
                                                  repository TEXT,
                                                  number INTEGER,
                                                  title TEXT,
                                                  html_url TEXT,
                                                  task_id_slug TEXT,
                                                  priority_number INTEGER,
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
            this._recreateIssuesTable(); // Full migration
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
                SELECT id, github_id, repository, number, title, html_url,
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

    async upsertIssue(issue) {
        try {
            // Attempt to insert or update the issue in the database
            const sql = 'INSERT OR REPLACE INTO issues (id, name, priority_number) VALUES (?, ?, ?)';
            await this.db.run(sql, [issue.id, issue.name, issue.priority_number]);
        } catch (error) {
            // Check if error is due to missing 'priority_number' column
            if (error.message && error.message.includes('priority_number')) {
                // Add the missing 'priority_number' column to the issues table
                await this.db.run('ALTER TABLE issues ADD COLUMN priority_number INTEGER DEFAULT 0');

                // Hard sleep for 5 seconds to allow the new column to be recognized
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);

                // Retry the upsert operation after adding the column and waiting
                return this.upsertIssue(issue);
            }
            // Re-throw error if it's not related to the missing column
            throw error;
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
