[... unchanged leading code ...]

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

[... rest of _init() unchanged ...]

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

[... rest of file unchanged ...]
