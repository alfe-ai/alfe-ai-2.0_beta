[...unchanged code above...]

  dump() {
    return this.db
      .prepare("SELECT * FROM issues ORDER BY priority_number ASC;")
      .all();
  }

  /**
   * Return distinct non-empty projects with open-issue counts.
   * Each row → { project: string, count: number }
   */
  listProjects() {
    const sql = `
      SELECT project, COUNT(*) AS count
      FROM issues
      WHERE project <> ''
      GROUP BY project
      ORDER BY project COLLATE NOCASE ASC;
    `;
    return this.db.prepare(sql).all();
  }
}

