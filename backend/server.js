// C:\SGF\backend\server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const app = express();
app.use(express.json());
app.use(cors({ origin: true }));
// ------------------------------------------------------------
// Serve the built frontend (Vite dist) on the same port
// ------------------------------------------------------------
const frontendDist = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(frontendDist));

// SPA fallback: for any non-API route, return index.html
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

const PORT = process.env.PORT || 3001;

// Log startup clearly
console.log("Starting SGF backend…");

if (!process.env.DATABASE_URL) {
  console.log("⚠️  DATABASE_URL is not set.");
  console.log("The API will run, but DB routes will return errors.");
}

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.PGSSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    })
  : null;

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, db: !!pool });
});

// Ensure schema
async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'New',
      suburb TEXT,
      street TEXT,
      client_name TEXT,
      email TEXT,
      phone TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Add new columns if they don't exist (for existing tables)
  const columnsToAdd = ['suburb', 'street', 'client_name', 'email', 'phone', 'stream', 'state', 'year',
    'deposit',
    'client1_name', 'client1_email', 'client1_phone', 'client1_active',
    'client2_name', 'client2_email', 'client2_phone', 'client2_active',
    'client3_name', 'client3_email', 'client3_phone', 'client3_active'];
  for (const column of columnsToAdd) {
    try {
      await pool.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name='projects' AND column_name='${column}'
          ) THEN
            ALTER TABLE projects ADD COLUMN ${column} TEXT;
          END IF;
        END $$;
      `);
    } catch (e) {
      // Column might already exist, ignore
      console.log(`Column ${column} might already exist:`, e.message);
    }
  }
}

// List projects
app.get("/api/projects", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const r = await pool.query(
      "SELECT id, name, status, suburb, street, state, client_name, email, phone, stream, year, deposit, updated_at, client1_name, client1_email, client1_phone, client1_active, client2_name, client2_email, client2_phone, client2_active, client3_name, client3_email, client3_phone, client3_active FROM projects ORDER BY updated_at DESC, id DESC"
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single project
app.get("/api/projects/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  
  const id = Number(req.params.id);
  console.log(`GET /api/projects/:id - Requested ID: ${id}, Type: ${typeof id}`);
  
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const r = await pool.query(
      "SELECT id, name, status, suburb, street, state, client_name, email, phone, stream, year, deposit, updated_at, client1_name, client1_email, client1_phone, client1_active, client2_name, client2_email, client2_phone, client2_active, client3_name, client3_email, client3_phone, client3_active FROM projects WHERE id = $1",
      [id]
    );
    
    console.log(`GET /api/projects/:id - Query returned ${r.rows.length} row(s)`);
    
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "not found" });
    }
    
    res.json(r.rows[0]);
  } catch (e) {
    console.error("Error in GET /api/projects/:id:", e);
    res.status(500).json({ error: e.message });
  }
});

// Create project
app.post("/api/projects", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { name, status, suburb, street, state, stream, deposit, client_name, email, phone } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    // Derive year from current date
    const currentYear = new Date().getFullYear().toString();

    const r = await pool.query(
      `INSERT INTO projects (name, status, suburb, street, state, stream, year, deposit, client_name, email, phone) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        name.trim(),
        (status || "New").trim(),
        suburb ? suburb.trim() : null,
        street ? street.trim() : null,
        state ? state.trim() : null,
        stream ? stream.trim() : null,
        currentYear,
        deposit ? deposit.trim() : null,
        client_name ? client_name.trim() : null,
        email ? email.trim() : null,
        phone ? phone.trim() : null,
      ]
    );

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update project
app.put("/api/projects/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const { name, status, stream, suburb, street, state, deposit, client_name, email, phone,
      client1_name, client1_email, client1_phone, client1_active,
      client2_name, client2_email, client2_phone, client2_active,
      client3_name, client3_email, client3_phone, client3_active } = req.body || {};
    // Convert empty strings to null, but preserve non-empty strings
    const processValue = (val) => {
      if (val === undefined) return null;
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? null : trimmed;
      }
      return null;
    };
    // Process boolean/checkbox values: convert true to 'true', false/null to null
    // But track if the value was explicitly provided (vs undefined/not provided)
    const processBoolean = (val) => {
      if (val === undefined) return { value: null, provided: false };
      if (val === true || val === 'true' || val === 'Y' || val === 'y') return { value: 'true', provided: true };
      return { value: null, provided: true }; // false or unchecked - explicitly set
    };
    
    const client1ActiveResult = processBoolean(client1_active);
    const client2ActiveResult = processBoolean(client2_active);
    const client3ActiveResult = processBoolean(client3_active);
    
    // Build the SQL query - use CASE to handle boolean fields properly
    // If value was provided, use it (even if null), otherwise keep existing
    const r = await pool.query(
      `
      UPDATE projects
      SET
        name = COALESCE($1, name),
        status = COALESCE($2, status),
        stream = COALESCE($3, stream),
        suburb = COALESCE($4, suburb),
        street = COALESCE($5, street),
        state = COALESCE($6, state),
        deposit = COALESCE($7, deposit),
        client_name = COALESCE($8, client_name),
        email = COALESCE($9, email),
        phone = COALESCE($10, phone),
        client1_name = COALESCE($11, client1_name),
        client1_email = COALESCE($12, client1_email),
        client1_phone = COALESCE($13, client1_phone),
        client1_active = COALESCE($14, client1_active),
        client2_name = COALESCE($15, client2_name),
        client2_email = COALESCE($16, client2_email),
        client2_phone = COALESCE($17, client2_phone),
        client2_active = COALESCE($18, client2_active),
        client3_name = COALESCE($19, client3_name),
        client3_email = COALESCE($20, client3_email),
        client3_phone = COALESCE($21, client3_phone),
        client3_active = COALESCE($22, client3_active),
        updated_at = NOW()
      WHERE id = $23
      RETURNING *
      `,
      [
        processValue(name),
        processValue(status),
        processValue(stream),
        processValue(suburb),
        processValue(street),
        processValue(state),
        processValue(deposit),
        processValue(client_name),
        processValue(email),
        processValue(phone),
        processValue(client1_name),
        processValue(client1_email),
        processValue(client1_phone),
        client1ActiveResult.provided ? client1ActiveResult.value : undefined, // Only update if provided
        processValue(client2_name),
        processValue(client2_email),
        processValue(client2_phone),
        client2ActiveResult.provided ? client2ActiveResult.value : undefined, // Only update if provided
        processValue(client3_name),
        processValue(client3_email),
        processValue(client3_phone),
        client3ActiveResult.provided ? client3ActiveResult.value : undefined, // Only update if provided
        id
      ]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete project
app.delete("/api/projects/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    // Use explicit transaction in case future related deletions needed
    await pool.query('BEGIN');
    const r = await pool.query(
      "DELETE FROM projects WHERE id = $1 RETURNING *",
      [id]
    );
    if (r.rowCount === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: "not found" });
    }
    await pool.query('COMMIT');
    // Send JSON response that is not HTML, always
    res.json({ success: true, deleted: r.rows[0] });
  } catch (e) {
    try { await pool.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: e.message || "Failed to delete project" });
  }
});

// Start server
(async () => {
  try {
    await ensureSchema();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ SGF API running on http://0.0.0.0:${PORT}`);
    });
  } catch (e) {
    console.error("❌ Startup error:", e);
    process.exit(1);
  }
})();
