// C:\SGF\backend\server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs").promises;
const multer = require("multer");
const nodemailer = require("nodemailer");
const app = express();
app.use(express.json());
app.use(cors({ origin: true }));

// Configure multer for file uploads (store in memory)
const upload = multer({ storage: multer.memoryStorage() });
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
      status TEXT NOT NULL DEFAULT 'Design Phase',
      suburb TEXT,
      street TEXT,
      client_name TEXT,
      email TEXT,
      phone TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Create users table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Add phone column if it doesn't exist (for existing tables)
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='users' AND column_name='phone'
        ) THEN
          ALTER TABLE users ADD COLUMN phone TEXT;
        END IF;
      END $$;
    `);
  } catch (e) {
    console.log(`Column phone might already exist:`, e.message);
  }
  // Create positions table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS positions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Create email_templates table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      to_addresses TEXT,
      from_address TEXT,
      subject TEXT,
      body TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Create user_positions junction table for many-to-many relationship
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_positions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, position_id)
    );
  `);
  // Add new columns if they don't exist (for existing tables)
  const columnsToAdd = ['suburb', 'street', 'client_name', 'email', 'phone', 'stream', 'state', 'year',
    'deposit',
    'client1_name', 'client1_email', 'client1_phone', 'client1_active',
    'client2_name', 'client2_email', 'client2_phone', 'client2_active',
    'client3_name', 'client3_email', 'client3_phone', 'client3_active',
    'project_cost', 'salesperson', 'proposal_pdf_location',
    'site_visit_status', 'site_visit_date', 'site_visit_time', 'site_visit_notes', 'site_visit_scheduled_date', 'site_visit_scheduled_period',
    'contract_status', 'contract_sent_date', 'contract_complete_date',
    'supporting_documents_status', 'supporting_documents_sent_date', 'supporting_documents_complete_date',
    'water_declaration_status', 'water_declaration_sent_date', 'water_declaration_complete_date',
    'notes', 'project_info_notes', 'specs', 'classification', 'project_log',
    'window_status', 'window_colour', 'window_reveal', 'window_reveal_other', 'window_glazing', 'window_bal_rating', 'window_date_required', 'window_ordered_date', 'window_order_pdf_location', 'window_order_number',
    'drawings_status', 'drawings_pdf_location', 'drawings_history', 'colours_status', 'planning_status', 'energy_report_status', 'footing_certification_status', 'building_permit_status'];
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
  // Create settings table (single row for app-wide settings)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      root_directory TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT single_row CHECK (id = 1)
    );
  `);
  // Add create_folders column if it doesn't exist (for existing tables)
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='settings' AND column_name='create_folders'
        ) THEN
          ALTER TABLE settings ADD COLUMN create_folders TEXT DEFAULT 'true';
          UPDATE settings SET create_folders = 'true' WHERE id = 1;
        END IF;
      END $$;
    `);
  } catch (e) {
    console.log(`Column create_folders might already exist:`, e.message);
  }
  // Add smtp_user, smtp_pass columns if they don't exist
  for (const col of ["smtp_user", "smtp_pass"]) {
    try {
      await pool.query(`ALTER TABLE settings ADD COLUMN ${col} TEXT`);
    } catch (e) {
      // Column might already exist, which is fine
      if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
        console.log(`Error adding column ${col}:`, e.message);
      }
    }
  }
  // Add global_password column if it doesn't exist
  try {
    await pool.query(`ALTER TABLE settings ADD COLUMN global_password TEXT`);
  } catch (e) {
    // Column might already exist, which is fine
    if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
      console.log(`Error adding column global_password:`, e.message);
    }
  }
  // Add admin_password column if it doesn't exist
  try {
    await pool.query(`ALTER TABLE settings ADD COLUMN admin_password TEXT`);
  } catch (e) {
    // Column might already exist, which is fine
    if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
      console.log(`Error adding column admin_password:`, e.message);
    }
  }
  // Insert default row if it doesn't exist
  try {
    await pool.query(`
      INSERT INTO settings (id, root_directory, create_folders) 
      VALUES (1, NULL, 'true') 
      ON CONFLICT (id) DO NOTHING;
    `);
  } catch (e) {
    // If insert fails, try without create_folders (for very old schemas)
    try {
      await pool.query(`
        INSERT INTO settings (id, root_directory) 
        VALUES (1, NULL) 
        ON CONFLICT (id) DO NOTHING;
      `);
      // Then update create_folders if column exists
      await pool.query(`
        UPDATE settings SET create_folders = 'true' WHERE id = 1 AND create_folders IS NULL;
      `);
    } catch (e2) {
      console.log(`Settings row might already exist:`, e2.message);
    }
  }
}

// List projects
app.get("/api/projects", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const r = await pool.query(
      "SELECT id, name, status, suburb, street, state, client_name, email, phone, stream, year, deposit, project_cost, salesperson, proposal_pdf_location, site_visit_status, site_visit_date, site_visit_time, site_visit_notes, site_visit_scheduled_date, site_visit_scheduled_period, contract_status, contract_sent_date, contract_complete_date, supporting_documents_status, supporting_documents_sent_date, supporting_documents_complete_date, water_declaration_status, water_declaration_sent_date, water_declaration_complete_date, notes, project_info_notes, specs, classification, project_log, window_status, window_colour, window_reveal, window_reveal_other, window_glazing, window_bal_rating, window_date_required, window_ordered_date, window_order_pdf_location, window_order_number, drawings_status, drawings_pdf_location, drawings_history, colours_status, planning_status, energy_report_status, footing_certification_status, building_permit_status, updated_at, client1_name, client1_email, client1_phone, client1_active, client2_name, client2_email, client2_phone, client2_active, client3_name, client3_email, client3_phone, client3_active FROM projects ORDER BY updated_at DESC, id DESC"
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
      "SELECT id, name, status, suburb, street, state, client_name, email, phone, stream, year, deposit, project_cost, salesperson, proposal_pdf_location, site_visit_status, site_visit_date, site_visit_time, site_visit_notes, site_visit_scheduled_date, site_visit_scheduled_period, contract_status, contract_sent_date, contract_complete_date, supporting_documents_status, supporting_documents_sent_date, supporting_documents_complete_date, water_declaration_status, water_declaration_sent_date, water_declaration_complete_date, notes, project_info_notes, specs, classification, project_log, window_status, window_colour, window_reveal, window_reveal_other, window_glazing, window_bal_rating, window_date_required, window_ordered_date, window_order_pdf_location, window_order_number, drawings_status, drawings_pdf_location, drawings_history, colours_status, planning_status, energy_report_status, footing_certification_status, building_permit_status, updated_at, client1_name, client1_email, client1_phone, client1_active, client2_name, client2_email, client2_phone, client2_active, client3_name, client3_email, client3_phone, client3_active FROM projects WHERE id = $1",
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
    const { name, status, suburb, street, state, stream, deposit, project_cost, salesperson, client_name, email, phone, client1_name, client1_email, client1_phone } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    // Derive year from current date
    const currentYear = new Date().getFullYear().toString();

    // Create initial project log entry
    const now = new Date();
    const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19); // Format: YYYY-MM-DD HH:MM:SS
    const initialLogEntry = `${dateTimeStr} - Project Created`;

    const r = await pool.query(
      `INSERT INTO projects (name, status, suburb, street, state, stream, year, deposit, project_cost, salesperson, client_name, email, phone, client1_name, client1_email, client1_phone, client1_active, client2_active, client3_active, contract_status, supporting_documents_status, water_declaration_status, planning_status, energy_report_status, footing_certification_status, building_permit_status, project_log) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27) RETURNING *`,
      [
        name.trim(),
        (status || "Design Phase").trim(),
        suburb ? suburb.trim() : null,
        street ? street.trim() : null,
        state ? state.trim() : null,
        stream ? stream.trim() : null,
        currentYear,
        deposit ? deposit.trim() : null,
        project_cost ? project_cost.trim() : null,
        salesperson ? salesperson.trim() : null,
        client_name ? client_name.trim() : null,
        email ? email.trim() : null,
        phone ? phone.trim() : null,
        client1_name ? client1_name.trim() : null,
        client1_email ? client1_email.trim() : null,
        client1_phone ? client1_phone.trim() : null,
        'true',  // client1_active - default to checked (true)
        null,    // client2_active - default to unchecked (null)
        null,    // client3_active - default to unchecked (null)
        'Not Sent',  // contract_status - default to Not Sent
        'Not Sent',  // supporting_documents_status - default to Not Sent
        'Not Required',  // water_declaration_status - default to Not Required
        'Not Selected',  // planning_status - default to Not Selected
        'Not Submitted',  // energy_report_status - default to Not Submitted
        'Not Submitted',  // footing_certification_status - default to Not Submitted
        'Not Submitted',  // building_permit_status - default to Not Submitted
        initialLogEntry,  // project_log - initial entry
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
    const { name, status, stream, suburb, street, state, year, deposit, project_cost, client_name, email, phone,
      client1_name, client1_email, client1_phone, client1_active,
      client2_name, client2_email, client2_phone, client2_active,
      client3_name, client3_email, client3_phone, client3_active,
      site_visit_status, site_visit_date, site_visit_time, site_visit_notes,
      contract_status, contract_sent_date, contract_complete_date,
      supporting_documents_status, supporting_documents_sent_date, supporting_documents_complete_date,
      water_declaration_status, water_declaration_sent_date, water_declaration_complete_date,
      notes, project_info_notes, specs, classification,
      window_status, window_colour, window_reveal, window_reveal_other, window_glazing, window_bal_rating, window_date_required, window_ordered_date, window_order_pdf_location, window_order_number,
      drawings_status, drawings_pdf_location, drawings_history, colours_status, planning_status, energy_report_status, footing_certification_status, building_permit_status } = req.body || {};
    // Convert empty strings to null, but preserve non-empty strings
    const processValue = (val) => {
      if (val === undefined) return null;
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? null : trimmed;
      }
      return null;
    };
    // Process boolean/checkbox values: 
    // For "not provided" (undefined), return special sentinel '__SKIP__'
    // For "provided as true", return 'true'
    // For "provided as false/null", return '__NULL__' to explicitly set to null
    const processBoolean = (val) => {
      if (val === undefined) return '__SKIP__'; // Don't update this field
      if (val === true || val === 'true' || val === 'Y' || val === 'y') return 'true';
      return '__NULL__'; // Explicitly set to null (unchecked)
    };
    
    const client1ActiveValue = processBoolean(client1_active);
    const client2ActiveValue = processBoolean(client2_active);
    const client3ActiveValue = processBoolean(client3_active);
    
    console.log("Client active values:", {
      client1: client1ActiveValue,
      client2: client2ActiveValue,
      client3: client3ActiveValue,
    });
    
    // Build the SQL query - use CASE to handle boolean fields properly
    // For active fields: if provided is true, use the value (even if null to uncheck), otherwise keep existing
    // We need to distinguish between "not provided" (undefined) and "provided as null" (unchecked)
    // Using a CASE statement that checks a separate parameter indicating if value was provided
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
        project_cost = COALESCE($8, project_cost),
        client_name = COALESCE($9, client_name),
        email = COALESCE($10, email),
        phone = COALESCE($11, phone),
        client1_name = COALESCE($12, client1_name),
        client1_email = COALESCE($13, client1_email),
        client1_phone = COALESCE($14, client1_phone),
        client1_active = CASE WHEN $15 = '__SKIP__' THEN client1_active WHEN $15 = '__NULL__' THEN NULL ELSE $15 END,
        client2_name = COALESCE($16, client2_name),
        client2_email = COALESCE($17, client2_email),
        client2_phone = COALESCE($18, client2_phone),
        client2_active = CASE WHEN $19 = '__SKIP__' THEN client2_active WHEN $19 = '__NULL__' THEN NULL ELSE $19 END,
        client3_name = COALESCE($20, client3_name),
        client3_email = COALESCE($21, client3_email),
        client3_phone = COALESCE($22, client3_phone),
        client3_active = CASE WHEN $23 = '__SKIP__' THEN client3_active WHEN $23 = '__NULL__' THEN NULL ELSE $23 END,
        site_visit_status = COALESCE($24, site_visit_status),
        site_visit_date = CASE WHEN $27 = '__CLEAR__' THEN NULL ELSE COALESCE($25, site_visit_date) END,
        site_visit_time = CASE WHEN $28 = '__CLEAR__' THEN NULL ELSE COALESCE($26, site_visit_time) END,
        site_visit_notes = COALESCE($29, site_visit_notes),
        contract_status = COALESCE($30, contract_status),
        contract_sent_date = COALESCE($31, contract_sent_date),
        contract_complete_date = COALESCE($32, contract_complete_date),
        supporting_documents_status = COALESCE($33, supporting_documents_status),
        supporting_documents_sent_date = COALESCE($34, supporting_documents_sent_date),
        supporting_documents_complete_date = COALESCE($35, supporting_documents_complete_date),
        water_declaration_status = COALESCE($36, water_declaration_status),
        water_declaration_sent_date = COALESCE($37, water_declaration_sent_date),
        water_declaration_complete_date = COALESCE($38, water_declaration_complete_date),
        notes = COALESCE($39, notes),
        window_status = COALESCE($40, window_status),
        window_colour = COALESCE($41, window_colour),
        window_reveal = COALESCE($42, window_reveal),
        window_reveal_other = COALESCE($43, window_reveal_other),
        window_glazing = COALESCE($44, window_glazing),
        window_bal_rating = COALESCE($45, window_bal_rating),
        window_date_required = COALESCE($46, window_date_required),
        window_ordered_date = COALESCE($47, window_ordered_date),
        window_order_pdf_location = COALESCE($48, window_order_pdf_location),
        window_order_number = COALESCE($49, window_order_number),
        drawings_status = COALESCE($50, drawings_status),
        drawings_pdf_location = COALESCE($51, drawings_pdf_location),
        drawings_history = COALESCE($52, drawings_history),
        colours_status = COALESCE($53, colours_status),
        planning_status = COALESCE($54, planning_status),
        energy_report_status = COALESCE($55, energy_report_status),
        footing_certification_status = COALESCE($56, footing_certification_status),
        building_permit_status = COALESCE($57, building_permit_status),
        year = COALESCE($58, year),
        project_info_notes = COALESCE($59, project_info_notes),
        specs = COALESCE($60, specs),
        classification = COALESCE($61, classification),
        updated_at = NOW()
      WHERE id = $62
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
        processValue(project_cost),
        processValue(client_name),
        processValue(email),
        processValue(phone),
        processValue(client1_name),
        processValue(client1_email),
        processValue(client1_phone),
        client1ActiveValue, // 'NOT_PROVIDED', 'true', or null
        processValue(client2_name),
        processValue(client2_email),
        processValue(client2_phone),
        client2ActiveValue, // 'NOT_PROVIDED', 'true', or null
        processValue(client3_name),
        processValue(client3_email),
        processValue(client3_phone),
        client3ActiveValue, // 'NOT_PROVIDED', 'true', or null
        processValue(site_visit_status),
        processValue(site_visit_date),
        processValue(site_visit_time),
        // Sentinel values to indicate we want to clear these fields (when explicitly set to empty string)
        (site_visit_date === "" || site_visit_date === null) && site_visit_date !== undefined ? "__CLEAR__" : null,
        (site_visit_time === "" || site_visit_time === null) && site_visit_time !== undefined ? "__CLEAR__" : null,
        processValue(site_visit_notes),
        processValue(contract_status),
        processValue(contract_sent_date),
        processValue(contract_complete_date),
        processValue(supporting_documents_status),
        processValue(supporting_documents_sent_date),
        processValue(supporting_documents_complete_date),
        processValue(water_declaration_status),
        processValue(water_declaration_sent_date),
        processValue(water_declaration_complete_date),
        processValue(notes),
        processValue(window_status),
        processValue(window_colour),
        processValue(window_reveal),
        processValue(window_reveal_other),
        processValue(window_glazing),
        processValue(window_bal_rating),
        processValue(window_date_required),
        processValue(window_ordered_date),
        processValue(window_order_pdf_location),
        processValue(window_order_number),
        processValue(drawings_status),
        processValue(drawings_pdf_location),
        processValue(drawings_history),
        processValue(colours_status),
        processValue(planning_status),
        processValue(energy_report_status),
        processValue(footing_certification_status),
        processValue(building_permit_status),
        processValue(year),
        processValue(project_info_notes),
        processValue(specs),
        processValue(classification),
        id
      ]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }

    console.log("Update successful. Row count:", r.rowCount);
    res.json(r.rows[0]);
  } catch (e) {
    console.error("Update query error:", e.message);
    console.error("Stack:", e.stack);
    res.status(500).json({ error: e.message });
  }
});

// List users
app.get("/api/users", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const usersResult = await pool.query(
      "SELECT id, name, email, phone, created_at, updated_at FROM users ORDER BY name ASC, id ASC"
    );
    // Get positions for each user
    const usersWithPositions = await Promise.all(
      usersResult.rows.map(async (user) => {
        const positionsResult = await pool.query(
          `SELECT p.id, p.name 
           FROM positions p 
           INNER JOIN user_positions up ON p.id = up.position_id 
           WHERE up.user_id = $1`,
          [user.id]
        );
        return {
          ...user,
          positions: positionsResult.rows,
        };
      })
    );
    res.json(usersWithPositions);
  } catch (e) {
    console.error("Error fetching users:", e);
    console.error("Error stack:", e.stack);
    res.status(500).json({ error: e.message });
  }
});

// Create user
app.post("/api/users", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { name, email, phone, positionIds } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    await pool.query('BEGIN');
    
    // Create the user
    const userResult = await pool.query(
      `INSERT INTO users (name, email, phone) 
       VALUES ($1, $2, $3) RETURNING *`,
      [
        name.trim(),
        email ? email.trim() : null,
        phone ? phone.trim() : null,
      ]
    );

    const userId = userResult.rows[0].id;

    // Add positions if provided
    if (positionIds && Array.isArray(positionIds) && positionIds.length > 0) {
      for (const positionId of positionIds) {
        await pool.query(
          `INSERT INTO user_positions (user_id, position_id) 
           VALUES ($1, $2) 
           ON CONFLICT (user_id, position_id) DO NOTHING`,
          [userId, parseInt(positionId)]
        );
      }
    }

    await pool.query('COMMIT');

    // Fetch user with positions
    const userWithPositionsResult = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.created_at, u.updated_at 
       FROM users u WHERE u.id = $1`,
      [userId]
    );
    const positionsResult = await pool.query(
      `SELECT p.id, p.name 
       FROM positions p 
       INNER JOIN user_positions up ON p.id = up.position_id 
       WHERE up.user_id = $1`,
      [userId]
    );

    res.json({
      ...userWithPositionsResult.rows[0],
      positions: positionsResult.rows,
    });
  } catch (e) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

// List positions
app.get("/api/positions", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const r = await pool.query(
      "SELECT id, name, created_at, updated_at FROM positions ORDER BY name ASC, id ASC"
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update user
app.put("/api/users/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const { name, email, phone, positionIds } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    await pool.query('BEGIN');

    // Update the user
    const userResult = await pool.query(
      `UPDATE users 
       SET name = $1, email = $2, phone = $3, updated_at = NOW()
       WHERE id = $4 
       RETURNING *`,
      [
        name.trim(),
        email ? email.trim() : null,
        phone ? phone.trim() : null,
        id,
      ]
    );

    if (userResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: "user not found" });
    }

    // Delete existing positions
    await pool.query('DELETE FROM user_positions WHERE user_id = $1', [id]);

    // Add new positions if provided
    if (positionIds && Array.isArray(positionIds) && positionIds.length > 0) {
      for (const positionId of positionIds) {
        await pool.query(
          `INSERT INTO user_positions (user_id, position_id) 
           VALUES ($1, $2) 
           ON CONFLICT (user_id, position_id) DO NOTHING`,
          [id, parseInt(positionId)]
        );
      }
    }

    await pool.query('COMMIT');

    // Fetch user with positions
    const positionsResult = await pool.query(
      `SELECT p.id, p.name 
       FROM positions p 
       INNER JOIN user_positions up ON p.id = up.position_id 
       WHERE up.user_id = $1`,
      [id]
    );

    res.json({
      ...userResult.rows[0],
      positions: positionsResult.rows,
    });
  } catch (e) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

// Delete user
app.delete("/api/users/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    await pool.query('BEGIN');
    const r = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING *",
      [id]
    );
    if (r.rowCount === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: "not found" });
    }
    await pool.query('COMMIT');
    res.json({ success: true, deleted: r.rows[0] });
  } catch (e) {
    try { await pool.query('ROLLBACK'); } catch {}
    res.status(500).json({ error: e.message || "Failed to delete user" });
  }
});

// Create position
app.post("/api/positions", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    const r = await pool.query(
      `INSERT INTO positions (name) 
       VALUES ($1) RETURNING *`,
      [name.trim()]
    );

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update position
app.put("/api/positions/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    const r = await pool.query(
      `UPDATE positions 
       SET name = $1, updated_at = NOW()
       WHERE id = $2 
       RETURNING *`,
      [name.trim(), id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ error: "position not found" });
    }

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete position
app.delete("/api/positions/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const r = await pool.query(
      "DELETE FROM positions WHERE id = $1 RETURNING *",
      [id]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }
    res.json({ success: true, deleted: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to delete position" });
  }
});

// Get settings
app.get("/api/settings", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const r = await pool.query(
      "SELECT id, root_directory, create_folders, smtp_user, smtp_pass, global_password, admin_password, updated_at FROM settings WHERE id = 1"
    );
    if (r.rows.length === 0) {
      return res.json({
        id: 1,
        root_directory: null,
        create_folders: "true",
        smtp_user: null,
        smtp_pass: null,
        global_password: null,
        admin_password: null,
        updated_at: null,
      });
    }
    res.json(r.rows[0]);
  } catch (e) {
    console.error("Error fetching settings:", e);
    console.error("Error stack:", e.stack);
    res.status(500).json({ error: e.message });
  }
});

// Update settings
app.put("/api/settings", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { root_directory, create_folders, smtp_user, smtp_pass, global_password, admin_password } = req.body || {};

    const processValue = (val) => {
      if (val === undefined) return null;
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? null : trimmed;
      }
      return null;
    };

    const processBoolean = (val) => {
      if (val === undefined) return null;
      if (val === true || val === "true" || val === "Y" || val === "y" || val === "1") return "true";
      return "false";
    };

    const r = await pool.query(
      `INSERT INTO settings (id, root_directory, create_folders, smtp_user, smtp_pass, global_password, admin_password, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id)
       DO UPDATE SET
         root_directory = COALESCE($1, settings.root_directory),
         create_folders = COALESCE($2, settings.create_folders),
         smtp_user = COALESCE($3, settings.smtp_user),
         smtp_pass = COALESCE($4, settings.smtp_pass),
         global_password = COALESCE($5, settings.global_password),
         admin_password = COALESCE($6, settings.admin_password),
         updated_at = NOW()
       RETURNING id, root_directory, create_folders, smtp_user, smtp_pass, global_password, admin_password, updated_at`,
      [
        processValue(root_directory),
        processBoolean(create_folders),
        processValue(smtp_user),
        processValue(smtp_pass),
        processValue(global_password),
        processValue(admin_password),
      ]
    );

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get all email templates
app.get("/api/email-templates", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const result = await pool.query(
      "SELECT id, name, to_addresses, from_address, subject, body, created_at, updated_at FROM email_templates ORDER BY name ASC"
    );
    // Parse to_addresses from JSON string to array
    const templates = result.rows.map(row => ({
      ...row,
      to_addresses: row.to_addresses ? JSON.parse(row.to_addresses) : []
    }));
    res.json(templates);
  } catch (e) {
    console.error("Error fetching email templates:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get single email template
app.get("/api/email-templates/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid id" });
    }
    const result = await pool.query(
      "SELECT id, name, to_addresses, from_address, subject, body, created_at, updated_at FROM email_templates WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Email template not found" });
    }
    const template = {
      ...result.rows[0],
      to_addresses: result.rows[0].to_addresses ? JSON.parse(result.rows[0].to_addresses) : []
    };
    res.json(template);
  } catch (e) {
    console.error("Error fetching email template:", e);
    res.status(500).json({ error: e.message });
  }
});

// Create email template
app.post("/api/email-templates", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { name, to_addresses, from_address, subject, body } = req.body || {};
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Template name is required" });
    }

    const toAddressesJson = Array.isArray(to_addresses) 
      ? JSON.stringify(to_addresses) 
      : (to_addresses ? JSON.stringify([to_addresses]) : null);

    const result = await pool.query(
      `INSERT INTO email_templates (name, to_addresses, from_address, subject, body, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, name, to_addresses, from_address, subject, body, created_at, updated_at`,
      [name.trim(), toAddressesJson, from_address || null, subject || null, body || null]
    );

    const template = {
      ...result.rows[0],
      to_addresses: result.rows[0].to_addresses ? JSON.parse(result.rows[0].to_addresses) : []
    };
    res.json(template);
  } catch (e) {
    console.error("Error creating email template:", e);
    res.status(500).json({ error: e.message });
  }
});

// Update email template
app.put("/api/email-templates/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid id" });
    }

    const { name, to_addresses, from_address, subject, body } = req.body || {};
    
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Template name is required" });
    }

    const toAddressesJson = Array.isArray(to_addresses) 
      ? JSON.stringify(to_addresses) 
      : (to_addresses ? JSON.stringify([to_addresses]) : null);

    const result = await pool.query(
      `UPDATE email_templates 
       SET name = $1, to_addresses = $2, from_address = $3, subject = $4, body = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, to_addresses, from_address, subject, body, created_at, updated_at`,
      [name.trim(), toAddressesJson, from_address || null, subject || null, body || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Email template not found" });
    }

    const template = {
      ...result.rows[0],
      to_addresses: result.rows[0].to_addresses ? JSON.parse(result.rows[0].to_addresses) : []
    };
    res.json(template);
  } catch (e) {
    console.error("Error updating email template:", e);
    res.status(500).json({ error: e.message });
  }
});

// Delete email template
app.delete("/api/email-templates/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid id" });
    }

    const result = await pool.query(
      "DELETE FROM email_templates WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Email template not found" });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (e) {
    console.error("Error deleting email template:", e);
    res.status(500).json({ error: e.message });
  }
});

// Send HTML email via SMTP
app.post("/api/emails/send", async (req, res) => {
  const { to, from, subject, htmlBody } = req.body || {};

  if (!to || (Array.isArray(to) && to.length === 0)) {
    return res.status(400).json({ error: "To address is required" });
  }
  if (!from) {
    return res.status(400).json({ error: "From address is required" });
  }

  let smtpUser = null;
  let smtpPass = null;
  if (pool) {
    try {
      const r = await pool.query(
        "SELECT smtp_user, smtp_pass FROM settings WHERE id = 1"
      );
      if (r.rows[0]?.smtp_user && r.rows[0]?.smtp_pass) {
        smtpUser = r.rows[0].smtp_user;
        smtpPass = r.rows[0].smtp_pass;
      }
    } catch (e) {
      console.error("Error reading SMTP from settings:", e);
    }
  }
  if (!smtpUser || !smtpPass) {
    smtpUser = process.env.SMTP_USER;
    smtpPass = process.env.SMTP_PASS;
  }
  if (!smtpUser || !smtpPass) {
    return res.status(503).json({
      error:
        "SMTP not configured. Set SMTP User and SMTP Pass in Settings → File Settings, or use backend .env.",
    });
  }

  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const rawBody = (htmlBody || "").trim().replace(/\n/g, "<br>");
    const htmlEmailBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${rawBody}</body></html>`;

    const mailOptions = {
      from: from,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject: subject || "",
      html: htmlEmailBody,
    };

    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, messageId: info.messageId, message: "Email sent successfully!" });
  } catch (e) {
    console.error("Error sending email:", e);
    res.status(500).json({
      error: e.message || "Failed to send email. Check SMTP settings and credentials.",
    });
  }
});

// Helper function to copy directory recursively
async function copyDirectory(src, dest) {
  try {
    // Check if source exists
    await fs.access(src);
    
    // Create destination directory
    await fs.mkdir(dest, { recursive: true });
    
    // Read source directory contents
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively copy subdirectories
        await copyDirectory(srcPath, destPath);
      } else {
        // Copy files
        await fs.copyFile(srcPath, destPath);
      }
    }
  } catch (e) {
    throw new Error(`Failed to copy directory: ${e.message}`);
  }
}

// Create folder and copy template
app.post("/api/folders/create", async (req, res) => {
  try {
    const { path: folderPath, rootDirectory, year, state } = req.body || {};
    if (!folderPath) {
      return res.status(400).json({ error: "path required" });
    }

    console.log(`Received folder creation request:`);
    console.log(`  Raw path (as received):`, folderPath);
    console.log(`  Raw path (JSON):`, JSON.stringify(folderPath));
    console.log(`  Root directory:`, rootDirectory);
    console.log(`  Year:`, year);

    // Normalize paths to handle different path separators
    // On Windows, normalize will convert forward slashes to backslashes
    let folderPathNormalized = path.normalize(folderPath);
    
    // Fix Windows drive letter paths - ensure there's a backslash after the colon
    // e.g., "Z\path" should become "Z:\path"
    if (/^[A-Z]:[^\\]/.test(folderPathNormalized)) {
      folderPathNormalized = folderPathNormalized.replace(/^([A-Z]:)([^\\])/, '$1\\$2');
      console.log(`  Fixed drive letter path:`, folderPathNormalized);
    }
    
    console.log(`  Normalized path:`, folderPathNormalized);
    console.log(`  Normalized path (JSON):`, JSON.stringify(folderPathNormalized));
    
    // Verify it's an absolute path
    const isAbsolute = path.isAbsolute(folderPathNormalized);
    console.log(`  Is absolute path:`, isAbsolute);
    if (!isAbsolute) {
      console.warn(`  WARNING: Path is not absolute! Current working directory:`, process.cwd());
    }
    
    // Check if the project folder already exists
    let folderExists = false;
    try {
      const stats = await fs.stat(folderPathNormalized);
      if (stats.isDirectory()) {
        folderExists = true;
        // Check if folder is empty or has content
        const entries = await fs.readdir(folderPathNormalized);
        if (entries.length > 0) {
          // Folder exists and has content, don't overwrite or copy template
          console.log(`Project folder already exists with content: ${folderPathNormalized}`);
          return res.json({ success: true, path: folderPathNormalized, message: "Folder already exists" });
        }
      }
    } catch (e) {
      // Folder doesn't exist, we'll create it
      folderExists = false;
      console.log(`Folder doesn't exist yet, will create: ${folderPathNormalized}`);
    }

    // Create directory recursively (fs.mkdir with recursive: true won't create duplicates of existing directories)
    // It will only create directories that don't exist
    console.log(`Attempting to create folder: ${folderPathNormalized}`);
    await fs.mkdir(folderPathNormalized, { recursive: true });
    console.log(`mkdir() completed for: ${folderPathNormalized}`);
    
    // Verify the folder was created
    try {
      const stats = await fs.stat(folderPathNormalized);
      if (!stats.isDirectory()) {
        throw new Error("Created path exists but is not a directory");
      }
      console.log(`✓ Verified folder exists and is a directory: ${folderPathNormalized}`);
      
      // List parent directory to see what's there
      const parentDir = path.dirname(folderPathNormalized);
      const parentContents = await fs.readdir(parentDir);
      console.log(`Parent directory contents (${parentDir}):`, parentContents);
    } catch (verifyError) {
      console.error("Error verifying folder creation:", verifyError);
      throw new Error(`Folder creation verification failed: ${verifyError.message}`);
    }
    
    // Copy template folder structure if rootDirectory, year, and state are provided
    // Only copy if the folder was just created (not if it already existed with content)
    if (rootDirectory && year && state && !folderExists) {
      // Template is located at: rootDirectory\year\state\1-Folder Structure
      const templatePath = path.join(rootDirectory, year, state, "1-Folder Structure");
      
      console.log(`Looking for template at: ${templatePath}`);
      
      // Check if template folder exists
      try {
        await fs.access(templatePath);
        console.log(`Template folder found, copying contents to: ${folderPathNormalized}`);
        
        // Copy all contents from template to new project folder
        // Note: We copy the contents, not the template folder itself
        await copyDirectory(templatePath, folderPathNormalized);
        console.log(`✓ Template copied successfully to: ${folderPathNormalized}`);
      } catch (templateError) {
        // Template folder doesn't exist - that's okay, just continue without copying
        console.log(`Template folder not found at ${templatePath}, skipping copy.`);
        console.log(`Template error:`, templateError.message);
      }
    } else if (rootDirectory && year && !folderExists) {
      // Fallback: try without state (for backward compatibility)
      const templatePath = path.join(rootDirectory, year, "1-Folder Structure");
      console.log(`Looking for template at (fallback): ${templatePath}`);
      
      try {
        await fs.access(templatePath);
        console.log(`Template folder found (fallback), copying contents to: ${folderPathNormalized}`);
        await copyDirectory(templatePath, folderPathNormalized);
        console.log(`✓ Template copied successfully to: ${folderPathNormalized}`);
      } catch (templateError) {
        console.log(`Template folder not found at ${templatePath}, skipping copy.`);
      }
    }
    
    res.json({ success: true, path: folderPathNormalized });
  } catch (e) {
    console.error("Error creating folder:", e);
    console.error("Error stack:", e.stack);
    res.status(500).json({ error: e.message || "Failed to create folder" });
  }
});

// Locate/Upload proposal PDF (saves file and path)
app.post("/api/files/locate-proposal", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { projectId } = req.body;
    
    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required" });
    }

    // Only accept PDF files
    if (req.file.mimetype !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    // Get project details to build path
    let projectPath = null;
    if (pool) {
      const projectResult = await pool.query(
        "SELECT name, suburb, street FROM projects WHERE id = $1",
        [projectId]
      );
      
      if (projectResult.rows.length > 0) {
        const project = projectResult.rows[0];
        // Get root directory from settings
        const settingsResult = await pool.query("SELECT root_directory FROM settings WHERE id = 1");
        const rootDir = settingsResult.rows[0]?.root_directory;
        
        if (rootDir) {
          // Build project path: root_directory/street, suburb
          const projectName = project.street && project.suburb 
            ? `${project.street}, ${project.suburb}`.replace(/[<>:"/\\|?*]/g, '_')
            : project.name.replace(/[<>:"/\\|?*]/g, '_');
          projectPath = path.join(rootDir, projectName);
        }
      }
    }

    // Get the original filename
    const fileName = req.file.originalname;
    let fileLocation = fileName; // Default to just filename

    // If we have a project path, save the file there
    if (projectPath) {
      try {
        // Ensure the project folder exists
        await fs.mkdir(projectPath, { recursive: true });
        
        // Save the file with its original name
        const filePath = path.join(projectPath, fileName);
        await fs.writeFile(filePath, req.file.buffer);
        fileLocation = filePath;
        console.log(`Proposal PDF saved to: ${filePath}`);
      } catch (fileError) {
        console.error("Error saving file:", fileError);
        // Continue with just filename if file save fails
      }
    }

    // Update project record with proposal PDF location
    if (pool) {
      await pool.query(
        "UPDATE projects SET proposal_pdf_location = $1 WHERE id = $2",
        [fileLocation, projectId]
      );
    }

    console.log(`Proposal PDF location saved: ${fileLocation} for project ${projectId}`);
    res.json({ 
      success: true, 
      message: "Proposal location saved successfully",
      fileName: fileName,
      path: fileLocation
    });
  } catch (e) {
    console.error("Error saving proposal location:", e);
    res.status(500).json({ error: e.message || "Failed to save proposal location" });
  }
});

// Upload proposal PDF (original - for backward compatibility)
app.post("/api/files/upload-proposal", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { projectId, projectPath } = req.body;
    
    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required" });
    }

    if (!projectPath) {
      return res.status(400).json({ error: "Project path is required" });
    }

    // Only accept PDF files
    if (req.file.mimetype !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    // Ensure the project folder exists
    await fs.mkdir(projectPath, { recursive: true });

    // Save the file directly to the project root directory as "Proposal.pdf"
    const fileName = "Proposal.pdf";
    const filePath = path.join(projectPath, fileName);

    // Write file from buffer
    await fs.writeFile(filePath, req.file.buffer);

    // Update project record with proposal PDF location
    if (pool) {
      await pool.query(
        "UPDATE projects SET proposal_pdf_location = $1 WHERE id = $2",
        [filePath, projectId]
      );
    }

    console.log(`Proposal PDF uploaded successfully: ${filePath}`);
    res.json({ 
      success: true, 
      message: "Proposal uploaded successfully",
      path: filePath,
      fileName: fileName
    });
  } catch (e) {
    console.error("Error uploading proposal:", e);
    res.status(500).json({ error: e.message || "Failed to upload proposal" });
  }
});

// Upload window order PDF
app.post("/api/files/upload-window-order", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { projectId, projectPath, orderNumber } = req.body;
    
    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required" });
    }

    if (!projectPath) {
      return res.status(400).json({ error: "Project path is required" });
    }

    if (!orderNumber) {
      return res.status(400).json({ error: "Order number is required" });
    }

    // Only accept PDF files
    if (req.file.mimetype !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    // Ensure the project folder exists
    await fs.mkdir(projectPath, { recursive: true });

    // Save the file directly to the project root directory as "WindowOrder.pdf"
    const fileName = "WindowOrder.pdf";
    const filePath = path.join(projectPath, fileName);

    // Write file from buffer
    await fs.writeFile(filePath, req.file.buffer);

    // Update project record with window order PDF location and order number
    if (pool) {
      await pool.query(
        "UPDATE projects SET window_order_pdf_location = $1, window_order_number = $2 WHERE id = $3",
        [filePath, orderNumber, projectId]
      );
    }

    console.log(`Window order PDF uploaded successfully: ${filePath}`);
    res.json({ 
      success: true, 
      message: "Window order uploaded successfully",
      path: filePath,
      fileName: fileName
    });
  } catch (e) {
    console.error("Error uploading window order:", e);
    res.status(500).json({ error: e.message || "Failed to upload window order" });
  }
});

// Update site visit scheduled date and period for multiple projects
app.post("/api/projects/update-site-visit-scheduled", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  
  try {
    const { projects } = req.body;
    
    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      return res.status(400).json({ error: "Projects array is required" });
    }

    // Update each project
    for (const projectUpdate of projects) {
      const { projectId, date, period } = projectUpdate;
      
      if (!projectId) {
        continue; // Skip invalid entries
      }

      await pool.query(
        "UPDATE projects SET site_visit_scheduled_date = $1, site_visit_scheduled_period = $2, site_visit_status = $3 WHERE id = $4",
        [date || null, period || null, "Email Sent", projectId]
      );
    }

    console.log(`Site visit scheduled updated and status set to "Email Sent" for ${projects.length} project(s)`);
    res.json({ 
      success: true, 
      message: `Site visit schedule updated and status set to "Email Sent" for ${projects.length} project(s)`
    });
  } catch (e) {
    console.error("Error updating site visit schedule:", e);
    res.status(500).json({ error: e.message || "Failed to update site visit schedule" });
  }
});

// Serve window order PDF
app.get("/api/files/window-order/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    // Get project and window order PDF location
    const projectResult = await pool.query(
      "SELECT window_order_pdf_location FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const orderPdfPath = projectResult.rows[0].window_order_pdf_location;

    if (!orderPdfPath) {
      return res.status(404).json({ error: "Window order PDF not found for this project" });
    }

    // Check if file exists
    try {
      await fs.access(orderPdfPath);
    } catch (e) {
      return res.status(404).json({ error: "Window order PDF file does not exist" });
    }

    // Read and send the file
    const fileBuffer = await fs.readFile(orderPdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="WindowOrder.pdf"`);
    res.send(fileBuffer);
  } catch (error) {
    console.error("Error serving window order PDF:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve drawings PDF
app.get("/api/files/drawings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    // Get project and drawings PDF location
    const projectResult = await pool.query(
      "SELECT drawings_pdf_location FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const drawingsPdfPath = projectResult.rows[0].drawings_pdf_location;

    if (!drawingsPdfPath) {
      return res.status(404).json({ error: "Drawings PDF not found for this project" });
    }

    // Check if file exists
    try {
      await fs.access(drawingsPdfPath);
    } catch (e) {
      return res.status(404).json({ error: "Drawings PDF file does not exist" });
    }

    // Read and send the file
    const fileBuffer = await fs.readFile(drawingsPdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Drawings.pdf"`);
    res.send(fileBuffer);
  } catch (error) {
    console.error("Error serving drawings PDF:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve proposal PDF
app.get("/api/files/proposal/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    // Get project and proposal PDF location
    const projectResult = await pool.query(
      "SELECT proposal_pdf_location FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const proposalPath = projectResult.rows[0].proposal_pdf_location;

    if (!proposalPath) {
      return res.status(404).json({ error: "Proposal PDF not found for this project" });
    }

    // Check if file exists
    try {
      await fs.access(proposalPath);
    } catch (e) {
      return res.status(404).json({ error: "Proposal PDF file does not exist" });
    }

    // Read and send the file
    const fileBuffer = await fs.readFile(proposalPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Proposal.pdf"`);
    res.send(fileBuffer);
  } catch (e) {
    console.error("Error serving proposal PDF:", e);
    res.status(500).json({ error: e.message || "Failed to serve proposal PDF" });
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
