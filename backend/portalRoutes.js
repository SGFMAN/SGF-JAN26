module.exports = function registerPortalRoutes(app, pool, fs) {
  // Portal: list projects where status is exactly "Design Phase"
  app.get("/api/portal/projects", async (req, res) => {
    try {
      if (!pool) {
        return res.status(500).json({ error: "DATABASE_URL not set" });
      }

      const r = await pool.query(
        `
          SELECT
            id,
            suburb,
            street,
            classification,
            client_name AS "clientName"
          FROM projects
          WHERE status = 'Design Phase'
          ORDER BY suburb ASC NULLS LAST, street ASC NULLS LAST, updated_at DESC, id DESC
        `
      );

      return res.json(r.rows);
    } catch (e) {
      console.error("Error in GET /api/portal/projects:", e);
      return res.status(500).json({ error: "Failed to fetch portal projects" });
    }
  });

  // Portal: project details (only the allowed fields)
  app.get("/api/portal/projects/:id", async (req, res) => {
    try {
      if (!pool) {
        return res.status(500).json({ error: "DATABASE_URL not set" });
      }

      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "invalid id" });
      }

      const r = await pool.query(
        `
          SELECT
            suburb,
            street,
            classification,
            client_name AS "clientName",
            email AS "clientEmail",
            phone AS "phoneNumber"
          FROM projects
          WHERE id = $1 AND status = 'Design Phase'
        `,
        [id]
      );

      if (r.rows.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Return only the fields above (no extra internal data)
      return res.json(r.rows[0]);
    } catch (e) {
      console.error("Error in GET /api/portal/projects/:id:", e);
      return res.status(500).json({ error: "Failed to fetch portal project" });
    }
  });

  // Portal: stream the drawing PDF for the project (anti-cache headers)
  app.get("/api/portal/projects/:id/drawing", async (req, res) => {
    try {
      if (!pool) {
        return res.status(500).json({ error: "DATABASE_URL not set" });
      }

      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ error: "invalid id" });
      }

      const r = await pool.query(
        `
          SELECT drawings_pdf_location
          FROM projects
          WHERE id = $1 AND status = 'Design Phase'
        `,
        [id]
      );

      if (r.rows.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      const drawingsPdfPath = r.rows[0].drawings_pdf_location;
      if (!drawingsPdfPath) {
        return res.status(404).json({ error: "Drawings PDF not found" });
      }

      // Check if file exists (do not expose path details)
      try {
        await fs.access(drawingsPdfPath);
      } catch (e) {
        return res.status(404).json({ error: "Drawings PDF not found" });
      }

      const fileBuffer = await fs.readFile(drawingsPdfPath);

      // Anti-cache headers (required for portal)
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Drawings.pdf"`);
      res.send(fileBuffer);
    } catch (e) {
      console.error("Error in GET /api/portal/projects/:id/drawing:", e);
      return res.status(500).json({ error: "Failed to serve drawings PDF" });
    }
  });
};

