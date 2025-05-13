[...unchanged lines...]
/* ------------------------------------------------------------------ */
/*  Tasks helpers (hide, reorder, points, project, sprint, priority)  */
/* ------------------------------------------------------------------ */
app.post("/api/tasks/hidden", (req, res) => {
  try {
    const { id, hidden } = req.body ?? {};
    db.setHidden(id, hidden);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] set hidden failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

[...existing endpoints...]

app.post("/api/tasks/priority", (req, res) => {
  try {
    const { id, priority } = req.body ?? {};
    if (!["Low", "Medium", "High"].includes(priority))
      return res.status(400).json({ error: "Invalid priority" });
    db.setPriority(id, priority);
    res.json({ ok: true });
  } catch (err) {
    console.error("[TaskQueue] set priority failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
[...unchanged lines...]
