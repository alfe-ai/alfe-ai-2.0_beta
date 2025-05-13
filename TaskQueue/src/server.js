@@
 app.get("/api/tasks", (req, res) => {
   try {
-    const includeHidden = Boolean(req.query.includeHidden);
+    // parse query param explicitly – "1"/"true" => true, anything else => false
+    const includeHidden =
+      req.query.includeHidden === "1" ||
+      req.query.includeHidden === "true";
     res.json(db.listTasks(includeHidden));
   } catch (err) {
     console.error("[TaskQueue] /api/tasks failed:", err);
     res.status(500).json({ error: "Internal server error" });
   }
 });
