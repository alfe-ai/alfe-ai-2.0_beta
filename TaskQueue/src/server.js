[...existing imports...]
import TaskDB from "./taskDb.js";
[...rest of header remains unchanged...]

app.use(cors());
app.use(express.json());

/* ------------------------------------------------------------------ */
/*  Projects routes                                                   */
/* ------------------------------------------------------------------ */

/**
 * GET /api/projects
 * Returns [{ project, count }, …]
 */
app.get("/api/projects", (req, res) => {
  try {
    const rows = db.listProjects();
    res.json(rows);
  } catch (err) {
    console.error("[TaskQueue] /api/projects failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * HTML view – /projects
 */
app.get("/projects", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "projects.html"));
});

/* ------------------------------------------------------------------ */
/*  Existing task routes (kept as-is)                                 */
/* ------------------------------------------------------------------ */

[...rest of file remains unchanged...]
