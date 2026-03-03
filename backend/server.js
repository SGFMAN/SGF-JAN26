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
app.use(cors({ origin: true }));

// Increase body size limit for file uploads (50MB)
// Only parse JSON for requests with application/json content-type (skip multipart/form-data)
const jsonParser = express.json({ limit: '50mb' });
const urlencodedParser = express.urlencoded({ limit: '50mb', extended: true });

app.use((req, res, next) => {
  const contentType = (req.get('content-type') || '').toLowerCase();
  console.log("Body parser middleware - Content-Type:", contentType, "Path:", req.path);
  
  // CRITICAL: Skip parsing for multipart/form-data (let multer handle it)
  if (contentType.includes('multipart/form-data')) {
    console.log("Skipping body parsing for multipart/form-data request");
    return next();
  }
  // Parse JSON requests
  if (contentType.includes('application/json')) {
    console.log("Parsing as JSON");
    return jsonParser(req, res, next);
  }
  // Parse URL-encoded requests
  if (contentType.includes('application/x-www-form-urlencoded')) {
    console.log("Parsing as URL-encoded");
    return urlencodedParser(req, res, next);
  }
  // Skip parsing for other content types (no content-type header, etc.)
  console.log("Skipping body parsing (no matching content-type)");
  next();
});

// Configure multer for file uploads (store in memory, 50MB limit)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB in bytes
  }
});

// App mode cache (refreshed every 1-2 seconds or on update)
let appModeCache = { mode: "USE", lastCheck: 0 };
const APP_MODE_CACHE_TTL = 1500; // 1.5 seconds

// Helper function to check if request is from admin
async function isAdminRequest(req) {
  if (!pool) return false;
  try {
    // Allow localhost requests in development mode (bypass admin check)
    const host = req.headers.host || req.headers["host"] || "";
    const origin = req.headers.origin || req.headers["origin"] || "";
    const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1") || 
                        origin.includes("localhost:5173") || origin.includes("127.0.0.1:5173");
    
    if (isLocalhost) {
      console.log("Localhost request detected - granting admin access for dev mode");
      return true;
    }
    
    // Headers in Express are case-insensitive, but normalize to lowercase
    const userId = req.headers["x-user-id"] || req.headers["X-User-Id"];
    const passwordType = req.headers["x-password-type"] || req.headers["X-Password-Type"];
    
    if (!userId || passwordType !== "admin") {
      console.log("Admin check failed:", { userId, passwordType, headers: Object.keys(req.headers) });
      return false;
    }
    
    // Check if user has Admin position
    const userResult = await pool.query(
      `SELECT u.id 
       FROM users u
       INNER JOIN user_positions up ON u.id = up.user_id
       INNER JOIN positions p ON up.position_id = p.id
       WHERE u.id = $1 AND p.name = 'Admin'`,
      [parseInt(userId)]
    );
    
    const isAdmin = userResult.rows.length > 0;
    console.log("Admin check result:", { userId, isAdmin });
    return isAdmin;
  } catch (e) {
    console.error("Error checking admin status:", e);
    return false;
  }
}

// Helper function to get current app mode (with caching)
async function getAppMode() {
  if (!pool) return "USE";
  const now = Date.now();
  if (now - appModeCache.lastCheck < APP_MODE_CACHE_TTL) {
    return appModeCache.mode;
  }
  try {
    const result = await pool.query(
      "SELECT app_mode FROM settings WHERE id = 1"
    );
    const mode = result.rows.length > 0 && result.rows[0].app_mode 
      ? result.rows[0].app_mode 
      : "USE";
    appModeCache = { mode, lastCheck: now };
    return mode;
  } catch (e) {
    console.error("Error fetching app mode:", e);
    return "USE";
  }
}

// Middleware to check app mode and block non-admins in EDIT mode
async function appModeMiddleware(req, res, next) {
  // Skip static file requests (assets, images, etc.)
  if (req.path.startsWith("/assets/") || 
      req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i) ||
      req.path === "/vite.svg") {
    return next();
  }
  
  // Always allow health check
  if (req.path === "/health") {
    return next();
  }
  
  const mode = await getAppMode();
  
  // If USE mode, allow all traffic
  if (mode === "USE") {
    return next();
  }
  
  // EDIT mode - check if admin
  const isAdmin = await isAdminRequest(req);
  
  // Allow admin requests (admins can access everything)
  if (isAdmin) {
    return next();
  }
  
  // In EDIT mode, block ALL requests from non-admins
  // This includes login endpoints - users cannot log in during maintenance
  // Admin will use localhost:5173 (dev server) to switch back to USE mode
  
  // Block all other requests in EDIT mode
  if (req.path.startsWith("/api/")) {
    // API request - return 503 JSON
    return res.status(503).json({
      ok: false,
      maintenance: true,
      message: "SGF Central is under maintenance. Please try again shortly."
    });
  } else {
    // Non-API request - return 503 HTML
    return res.status(503).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>SGF Central - Under Maintenance</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #42464d;
            color: #fff;
          }
          .container {
            text-align: center;
            padding: 40px;
            max-width: 600px;
          }
          h1 {
            font-size: 2.5rem;
            margin-bottom: 20px;
            color: #fff;
          }
          p {
            font-size: 1.2rem;
            line-height: 1.6;
            color: #e0e0e0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Under Construction</h1>
          <p>SGF Central is under maintenance. Please try again shortly.</p>
        </div>
      </body>
      </html>
    `);
  }
}

// ------------------------------------------------------------
// Serve the built frontend (Vite dist) on the same port
// ------------------------------------------------------------
const frontendDist = path.join(__dirname, "..", "frontend", "dist");

// Apply app mode middleware for API routes
app.use(appModeMiddleware);

// Handle root route and index.html BEFORE express.static
// This ensures we can block non-admins in EDIT mode
app.get(["/", "/index.html"], async (req, res) => {
  const mode = await getAppMode();
  if (mode === "EDIT") {
    const isAdmin = await isAdminRequest(req);
    if (!isAdmin) {
      return res.status(503).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>SGF Central - Under Maintenance</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #42464d;
              color: #fff;
            }
            .container {
              text-align: center;
              padding: 40px;
              max-width: 600px;
            }
            h1 {
              font-size: 2.5rem;
              margin-bottom: 20px;
              color: #fff;
            }
            p {
              font-size: 1.2rem;
              line-height: 1.6;
              color: #e0e0e0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Under Construction</h1>
            <p>SGF Central is under maintenance. Please try again shortly.</p>
          </div>
        </body>
        </html>
      `);
    }
  }
  res.sendFile(path.join(frontendDist, "index.html"));
});

// Serve static assets (JS, CSS, images) - these are always allowed
// This comes AFTER the root route handler so index.html is handled above
app.use(express.static(frontendDist, { index: false })); // index: false prevents serving index.html automatically

// SPA fallback: for any other non-API route, return index.html (after checking app mode)
app.get(/^\/(?!api).*/, async (req, res) => {
  // Allow approval page without authentication (secret page for clients)
  if (req.path.startsWith("/approve-concept/")) {
    return res.sendFile(path.join(frontendDist, "index.html"));
  }
  
  const mode = await getAppMode();
  if (mode === "EDIT") {
    const isAdmin = await isAdminRequest(req);
    if (!isAdmin) {
      return res.status(503).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>SGF Central - Under Maintenance</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #42464d;
              color: #fff;
            }
            .container {
              text-align: center;
              padding: 40px;
              max-width: 600px;
            }
            h1 {
              font-size: 2.5rem;
              margin-bottom: 20px;
              color: #fff;
            }
            p {
              font-size: 1.2rem;
              line-height: 1.6;
              color: #e0e0e0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Under Construction</h1>
            <p>SGF Central is under maintenance. Please try again shortly.</p>
          </div>
        </body>
        </html>
      `);
    }
  }
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
  // Add primary_position_id column if it doesn't exist
  try {
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='users' AND column_name='primary_position_id'
        ) THEN
          ALTER TABLE users ADD COLUMN primary_position_id INTEGER;
        END IF;
      END $$;
    `);
  } catch (e) {
    console.log(`Column primary_position_id might already exist:`, e.message);
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
  // Create substatuses table to store all possible substatuses and their details
  await pool.query(`
    CREATE TABLE IF NOT EXISTS substatuses (
      id SERIAL PRIMARY KEY,
      substatus TEXT NOT NULL,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(substatus, detail)
    );
  `);
  // Initialize default substatuses and details
  const defaultSubstatuses = [
    { substatus: "Town Planning", detail: "Further Information Required" },
    { substatus: "Town Planning", detail: "Section 50 Advertising" },
    { substatus: "Town Planning", detail: "Planning Permit Received – Waiting Flood Consent" },
    { substatus: "Town Planning", detail: "Waiting Arborist Report" },
    { substatus: "Town Planning", detail: "Planner on Leave" },
    { substatus: "Town Planning", detail: "Waiting Hydraulic Engineer Assessment" },
    { substatus: "VicSmart", detail: "Waiting Hydraulic Engineer Assessment" },
    { substatus: "Waiting", detail: "Covenant Removal" },
    { substatus: "Waiting", detail: "Deposit Balance" },
    { substatus: "Waiting", detail: "Hydraulic Engineering" },
    { substatus: "Waiting", detail: "Vince Assessment" },
    { substatus: "Waiting", detail: "PIC" },
    { substatus: "Waiting", detail: "Engineering" },
    { substatus: "Waiting", detail: "Approved Working Drawings" },
    { substatus: "Waiting", detail: "Approved Concept Drawings" },
    { substatus: "Waiting", detail: "Signed Contract and Docs" },
    { substatus: "Waiting", detail: "Septic Permit" },
    { substatus: "Waiting", detail: "JCA & Soil" },
  ];
  for (const item of defaultSubstatuses) {
    try {
      await pool.query(`
        INSERT INTO substatuses (substatus, detail)
        VALUES ($1, $2)
        ON CONFLICT (substatus, detail) DO NOTHING
      `, [item.substatus, item.detail]);
    } catch (e) {
      // Ignore errors for existing entries
    }
  }
  // Add new columns if they don't exist (for existing tables)
  // NOTE: 'year' field stores the project start DATE in YYYY-MM-DD format (this is the single date field for projects)
  // The year is ALWAYS derived from this date field - never stored separately
  const columnsToAdd = [
    'suburb', 'street', 'client_name', 'email', 'phone', 'stream', 'state', 'year',
    'deposit',
    'client1_name', 'client1_email', 'client1_phone', 'client1_active',
    'client2_name', 'client2_email', 'client2_phone', 'client2_active',
    'client3_name', 'client3_email', 'client3_phone', 'client3_active',
    'client_notes',
    'project_cost', 'salesperson', 'proposal_pdf_location',
    'site_visit_status', 'site_visit_date', 'site_visit_time', 'site_visit_notes', 'site_visit_scheduled_date', 'site_visit_scheduled_period',
    'contract_status', 'contract_sent_date', 'contract_complete_date',
    'supporting_documents_status', 'supporting_documents_sent_date', 'supporting_documents_complete_date',
    'water_authority', 'water_declaration_status', 'water_declaration_sent_date', 'water_declaration_complete_date',
    'notes', 'project_info_notes', 'specs', 'classification', 'project_log',
    'window_status', 'window_colour', 'window_reveal', 'window_reveal_other', 'window_glazing', 'window_bal_rating', 'window_date_required', 'window_ordered_date', 'window_order_pdf_location', 'window_order_number',
    'drawings_status', 'drawings_pdf_location', 'drawings_history', 'drawings_viewed_date', 'draftsperson', 'drawings_holder', 'colours_status', 'colours_notes', 'colours_pdf_location', 'colours_sent_date', 'colours_reminder_sent_date', 'planning_status', 'energy_report_status', 'footing_certification_status', 'building_permit_status',
    'number_of_robes', 'robe_widths', 'robe_plan_pdf_location', 'robe_colours_pdf_location', 'substatus', 'substatus_detail', 'on_hold', 'survey_status', 'soil_status'];
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
  for (const col of ["smtp_user", "smtp_pass", "smtp_user_secondary", "smtp_pass_secondary"]) {
    try {
      await pool.query(`ALTER TABLE settings ADD COLUMN ${col} TEXT`);
    } catch (e) {
      // Column might already exist, which is fine
      if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
        console.log(`Error adding column ${col}:`, e.message);
      }
    }
  }
  // Add colour_attachments columns if they don't exist
  for (const col of ["colour_attachments_vic", "colour_attachments_qld"]) {
    try {
      await pool.query(`ALTER TABLE settings ADD COLUMN ${col} TEXT`);
    } catch (e) {
      // Column might already exist, which is fine
      if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
        console.log(`Error adding column ${col}:`, e.message);
      }
    }
  }
  // Add send_drawings columns if they don't exist
  for (const col of ["send_drawings_vic", "send_drawings_qld"]) {
    try {
      await pool.query(`ALTER TABLE settings ADD COLUMN ${col} TEXT`);
    } catch (e) {
      // Column might already exist, which is fine
      if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
        console.log(`Error adding column ${col}:`, e.message);
      }
    }
  }
  // Add QLD settings columns if they don't exist
  for (const col of ["root_directory_qld", "create_folders_qld", "smtp_user_qld", "smtp_pass_qld", "test_project_name_qld", "test_folder_qld"]) {
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
  // Add app_mode column if it doesn't exist
  try {
    await pool.query(`ALTER TABLE settings ADD COLUMN app_mode TEXT DEFAULT 'USE'`);
    // Set default to USE if null
    await pool.query(`UPDATE settings SET app_mode = 'USE' WHERE id = 1 AND app_mode IS NULL`);
  } catch (e) {
    // Column might already exist, which is fine
    if (!e.message.includes("already exists") && !e.message.includes("duplicate column")) {
      console.log(`Error adding column app_mode:`, e.message);
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
      "SELECT id, name, status, suburb, street, state, client_name, email, phone, stream, year, deposit, project_cost, salesperson, proposal_pdf_location, site_visit_status, site_visit_date, site_visit_time, site_visit_notes, site_visit_scheduled_date, site_visit_scheduled_period, contract_status, contract_sent_date, contract_complete_date, supporting_documents_status, supporting_documents_sent_date, supporting_documents_complete_date, water_authority, water_declaration_status, water_declaration_sent_date, water_declaration_complete_date, notes, project_info_notes, specs, classification, project_log, window_status, window_colour, window_reveal, window_reveal_other, window_glazing, window_bal_rating, window_date_required, window_ordered_date, window_order_pdf_location, window_order_number, drawings_status, drawings_pdf_location, drawings_history, drawings_viewed_date, draftsperson, drawings_holder, colours_status, colours_notes, colours_pdf_location, colours_sent_date, colours_reminder_sent_date, planning_status, energy_report_status, footing_certification_status, building_permit_status, number_of_robes, robe_widths, robe_plan_pdf_location, robe_colours_pdf_location, substatus, substatus_detail, on_hold, survey_status, soil_status, updated_at, client1_name, client1_email, client1_phone, client1_active, client2_name, client2_email, client2_phone, client2_active, client3_name, client3_email, client3_phone, client3_active FROM projects ORDER BY updated_at DESC, id DESC"
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
      "SELECT id, name, status, suburb, street, state, client_name, email, phone, stream, year, deposit, project_cost, salesperson, proposal_pdf_location, site_visit_status, site_visit_date, site_visit_time, site_visit_notes, site_visit_scheduled_date, site_visit_scheduled_period, contract_status, contract_sent_date, contract_complete_date, supporting_documents_status, supporting_documents_sent_date, supporting_documents_complete_date, water_authority, water_declaration_status, water_declaration_sent_date, water_declaration_complete_date, notes, project_info_notes, specs, classification, project_log, window_status, window_colour, window_reveal, window_reveal_other, window_glazing, window_bal_rating, window_date_required, window_ordered_date, window_order_pdf_location, window_order_number, drawings_status, drawings_pdf_location, drawings_history, drawings_viewed_date, draftsperson, drawings_holder, colours_status, colours_notes, colours_pdf_location, colours_sent_date, colours_reminder_sent_date, planning_status, energy_report_status, footing_certification_status, building_permit_status, number_of_robes, robe_widths, robe_plan_pdf_location, robe_colours_pdf_location, substatus, substatus_detail, on_hold, survey_status, soil_status, updated_at, client1_name, client1_email, client1_phone, client1_active, client2_name, client2_email, client2_phone, client2_active, client3_name, client3_email, client3_phone, client3_active FROM projects WHERE id = $1",
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

// Bulk create projects (for manual project addition)
app.post("/api/projects/bulk", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { projects } = req.body || {};
    if (!Array.isArray(projects) || projects.length === 0) {
      return res.status(400).json({ error: "projects array required" });
    }

    const results = [];
    let addedCount = 0;
    let skippedCount = 0;

    for (const projectData of projects) {
      const { suburb, street, specs, project_cost, year, state, stream, status } = projectData;
      
      if (!suburb || !street) {
        results.push({ error: `Missing suburb or street for project`, data: projectData });
        skippedCount++;
        continue;
      }

      // Check if project already exists
      const checkResult = await pool.query(
        "SELECT id FROM projects WHERE UPPER(TRIM(suburb)) = $1 AND UPPER(TRIM(street)) = $2",
        [suburb.toUpperCase().trim(), street.toUpperCase().trim()]
      );

      if (checkResult.rows.length > 0) {
        results.push({ skipped: true, message: `${suburb} - ${street} already exists` });
        skippedCount++;
        continue;
      }

      // Create project name
      const name = `${suburb} - ${street}`;
      
      // Normalize date
      let projectDate = year || "2025-01-01";
      if (year && typeof year === 'string') {
        const yearStr = year.trim();
        if (/^\d{4}$/.test(yearStr)) {
          projectDate = `${yearStr}-01-01`;
        } else if (yearStr.includes("/")) {
          const parts = yearStr.split("/");
          if (parts.length === 3) {
            const part1 = parts[0].trim();
            const part2 = parts[1].trim();
            const part3 = parts[2].trim();
            if (parseInt(part1) > 12 && parseInt(part2) <= 12) {
              projectDate = `${part3}-${part2.padStart(2, "0")}-${part1.padStart(2, "0")}`;
            } else {
              projectDate = `${part3}-${part1.padStart(2, "0")}-${part2.padStart(2, "0")}`;
            }
          }
        }
      }

      // Create initial project log entry
      const now = new Date();
      const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
      const initialLogEntry = `${dateTimeStr} - Project Created`;

      // Insert project (matching the regular POST endpoint structure)
      const result = await pool.query(
        `INSERT INTO projects (name, status, suburb, street, state, stream, year, deposit, project_cost, salesperson, client_name, email, phone, client1_name, client1_email, client1_phone, client1_active, client2_active, client3_active, contract_status, supporting_documents_status, water_authority, water_declaration_status, planning_status, energy_report_status, footing_certification_status, building_permit_status, specs, classification, project_log) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30) 
         RETURNING id, name`,
        [
          name.trim(),
          (status || "Design Phase").trim(),
          suburb ? suburb.trim() : null,
          street ? street.trim() : null,
          (state || "QLD").trim(),
          (stream || "SGF - QLD").trim(),
          projectDate,
          null, // deposit
          project_cost ? project_cost.trim() : null,
          null, // salesperson
          null, // client_name
          null, // email
          null, // phone
          null, // client1_name
          null, // client1_email
          null, // client1_phone
          'true',  // client1_active - default to checked (true)
          null,    // client2_active - default to unchecked (null)
          null,    // client3_active - default to unchecked (null)
          'Not Sent',  // contract_status - default to Not Sent
          'Not Sent',  // supporting_documents_status - default to Not Sent
          'Not Required',  // water_authority - default to Not Required
          'Not Sent',  // water_declaration_status - default to Not Sent
          'Not Selected',  // planning_status - default to Not Selected
          'Not Submitted',  // energy_report_status - default to Not Submitted
          'Not Submitted',  // footing_certification_status - default to Not Submitted
          'Not Submitted',  // building_permit_status - default to Not Submitted
          specs ? specs.trim() : null,
          null, // classification
          initialLogEntry, // project_log - initial entry
        ]
      );

      results.push({ added: true, id: result.rows[0].id, name: result.rows[0].name });
      addedCount++;
    }

    res.json({
      success: true,
      added: addedCount,
      skipped: skippedCount,
      total: projects.length,
      results: results,
    });
  } catch (e) {
    console.error("Error in POST /api/projects/bulk:", e);
    res.status(500).json({ error: e.message });
  }
});

// Create project
app.post("/api/projects", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { name, status, suburb, street, state, stream, deposit, project_cost, salesperson, client_name, email, phone, client1_name, client1_email, client1_phone, specs, classification, year } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    // Normalize date: 'year' field stores project start DATE in YYYY-MM-DD format
    // If only a year is provided (e.g., "2024"), convert to full date (e.g., "2024-01-01")
    // The year is ALWAYS derived from this date field - never stored separately
    let projectDate = year || new Date().toISOString().split('T')[0];
    if (year && typeof year === 'string') {
      const yearStr = year.trim();
      if (/^\d{4}$/.test(yearStr)) {
        // Only year provided, set to January 1st
        projectDate = `${yearStr}-01-01`;
      } else if (yearStr.includes("/")) {
        // Handle MM/DD/YYYY or DD/MM/YYYY format
        const parts = yearStr.split("/");
        if (parts.length === 3) {
          const part1 = parts[0].trim();
          const part2 = parts[1].trim();
          const part3 = parts[2].trim();
          // If part1 > 12, assume DD/MM/YYYY, otherwise MM/DD/YYYY
          if (parseInt(part1) > 12 && parseInt(part2) <= 12) {
            projectDate = `${part3}-${part2.padStart(2, "0")}-${part1.padStart(2, "0")}`;
          } else {
            projectDate = `${part3}-${part1.padStart(2, "0")}-${part2.padStart(2, "0")}`;
          }
        }
      }
    }

    // Create initial project log entry
    const now = new Date();
    const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19); // Format: YYYY-MM-DD HH:MM:SS
    const initialLogEntry = `${dateTimeStr} - Project Created`;

    const r = await pool.query(
      `INSERT INTO projects (name, status, suburb, street, state, stream, year, deposit, project_cost, salesperson, client_name, email, phone, client1_name, client1_email, client1_phone, client1_active, client2_active, client3_active, contract_status, supporting_documents_status, water_authority, water_declaration_status, planning_status, energy_report_status, footing_certification_status, building_permit_status, specs, classification, project_log) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30) RETURNING *`,
      [
        name.trim(),
        (status || "Design Phase").trim(),
        suburb ? suburb.trim() : null,
        street ? street.trim() : null,
        state ? state.trim() : null,
        stream ? stream.trim() : null,
        projectDate,
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
        'Not Required',  // water_authority - default to Not Required
        'Not Sent',  // water_declaration_status - default to Not Sent
        'Not Selected',  // planning_status - default to Not Selected
        'Not Submitted',  // energy_report_status - default to Not Submitted
        'Not Submitted',  // footing_certification_status - default to Not Submitted
        'Not Submitted',  // building_permit_status - default to Not Submitted
        specs ? specs.trim() : null,  // specs
        classification ? classification.trim() : null,  // classification
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
    // Normalize date field if provided: 'year' field stores the full DATE (YYYY-MM-DD format)
    // If only a year is provided, convert to full date. The year is ALWAYS derived from the date field.
    let normalizedYear = undefined;
    if (req.body.year !== undefined) {
      const yearValue = req.body.year;
      if (yearValue === null || yearValue === "") {
        normalizedYear = null;
      } else {
        const yearStr = yearValue.toString().trim();
        // If only year provided (e.g., "2024"), convert to full date (e.g., "2024-01-01")
        if (/^\d{4}$/.test(yearStr)) {
          normalizedYear = `${yearStr}-01-01`;
        } else if (yearStr.includes("/")) {
          // Handle MM/DD/YYYY or DD/MM/YYYY format
          const parts = yearStr.split("/");
          if (parts.length === 3) {
            const part1 = parts[0].trim();
            const part2 = parts[1].trim();
            const part3 = parts[2].trim();
            // If part1 > 12, assume DD/MM/YYYY, otherwise MM/DD/YYYY
            if (parseInt(part1) > 12 && parseInt(part2) <= 12) {
              normalizedYear = `${part3}-${part2.padStart(2, "0")}-${part1.padStart(2, "0")}`;
            } else {
              normalizedYear = `${part3}-${part1.padStart(2, "0")}-${part2.padStart(2, "0")}`;
            }
          } else {
            normalizedYear = yearStr; // Keep as is if can't parse
          }
        } else {
          normalizedYear = yearStr; // Already in YYYY-MM-DD or other format, keep as is
        }
      }
    }
    
    const { name, status, stream, suburb, street, state, year, deposit, project_cost, client_name, email, phone,
      client1_name, client1_email, client1_phone, client1_active,
      client2_name, client2_email, client2_phone, client2_active,
      client3_name, client3_email, client3_phone, client3_active,
      client_notes,
      site_visit_status, site_visit_date, site_visit_time, site_visit_notes,
      contract_status, contract_sent_date, contract_complete_date,
      supporting_documents_status, supporting_documents_sent_date, supporting_documents_complete_date,
      water_authority, water_declaration_status, water_declaration_sent_date, water_declaration_complete_date,
      notes, project_info_notes, specs, classification,
      window_status, window_colour, window_reveal, window_reveal_other, window_glazing, window_bal_rating, window_date_required, window_ordered_date, window_order_pdf_location, window_order_number,
      drawings_status, drawings_pdf_location, drawings_history, drawings_viewed_date, draftsperson, drawings_holder, colours_status, colours_notes, colours_pdf_location, colours_sent_date, colours_reminder_sent_date, planning_status, energy_report_status, footing_certification_status, building_permit_status,
      number_of_robes, robe_widths, substatus, substatus_detail, on_hold, survey_status, soil_status } = req.body || {};
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
    const onHoldValue = processBoolean(on_hold);
    
    console.log("Client active values:", {
      client1: client1ActiveValue,
      client2: client2ActiveValue,
      client3: client3ActiveValue,
      on_hold: onHoldValue,
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
        client_notes = COALESCE($24, client_notes),
        site_visit_status = COALESCE($25, site_visit_status),
        site_visit_date = CASE WHEN $28 = '__CLEAR__' THEN NULL ELSE COALESCE($26, site_visit_date) END,
        site_visit_time = CASE WHEN $29 = '__CLEAR__' THEN NULL ELSE COALESCE($27, site_visit_time) END,
        site_visit_notes = COALESCE($30, site_visit_notes),
        contract_status = COALESCE($31, contract_status),
        contract_sent_date = COALESCE($32, contract_sent_date),
        contract_complete_date = COALESCE($33, contract_complete_date),
        supporting_documents_status = COALESCE($34, supporting_documents_status),
        supporting_documents_sent_date = COALESCE($35, supporting_documents_sent_date),
        supporting_documents_complete_date = COALESCE($36, supporting_documents_complete_date),
        water_authority = COALESCE($37, water_authority),
        water_declaration_status = COALESCE($38, water_declaration_status),
        water_declaration_sent_date = COALESCE($39, water_declaration_sent_date),
        water_declaration_complete_date = COALESCE($40, water_declaration_complete_date),
        notes = COALESCE($41, notes),
        window_status = COALESCE($42, window_status),
        window_colour = COALESCE($43, window_colour),
        window_reveal = COALESCE($44, window_reveal),
        window_reveal_other = COALESCE($45, window_reveal_other),
        window_glazing = COALESCE($46, window_glazing),
        window_bal_rating = COALESCE($47, window_bal_rating),
        window_date_required = COALESCE($48, window_date_required),
        window_ordered_date = COALESCE($49, window_ordered_date),
        window_order_pdf_location = COALESCE($50, window_order_pdf_location),
        window_order_number = COALESCE($51, window_order_number),
        drawings_status = COALESCE($52, drawings_status),
        drawings_pdf_location = COALESCE($53, drawings_pdf_location),
        drawings_history = COALESCE($54, drawings_history),
        drawings_viewed_date = COALESCE($55, drawings_viewed_date),
        draftsperson = COALESCE($56, draftsperson),
        drawings_holder = COALESCE($57, drawings_holder),
        colours_status = COALESCE($58, colours_status),
        colours_notes = COALESCE($59, colours_notes),
        colours_pdf_location = COALESCE($60, colours_pdf_location),
        colours_sent_date = COALESCE($61, colours_sent_date),
        colours_reminder_sent_date = COALESCE($62, colours_reminder_sent_date),
        planning_status = COALESCE($63, planning_status),
        energy_report_status = COALESCE($64, energy_report_status),
        footing_certification_status = COALESCE($65, footing_certification_status),
        building_permit_status = COALESCE($66, building_permit_status),
        year = COALESCE($67, year),
        project_info_notes = COALESCE($68, project_info_notes),
        specs = COALESCE($69, specs),
        classification = COALESCE($70, classification),
        number_of_robes = COALESCE($71, number_of_robes),
        robe_widths = COALESCE($72, robe_widths),
        substatus = COALESCE($73, substatus),
        substatus_detail = COALESCE($74, substatus_detail),
        on_hold = CASE WHEN $75 = '__SKIP__' THEN on_hold WHEN $75 = '__NULL__' THEN NULL ELSE $75 END,
        survey_status = COALESCE($76, survey_status),
        soil_status = COALESCE($77, soil_status),
        updated_at = NOW()
      WHERE id = $78
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
        processValue(client_notes),
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
        processValue(water_authority),
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
        processValue(drawings_viewed_date),
        processValue(draftsperson),
        processValue(drawings_holder),
        processValue(colours_status),
        processValue(colours_notes),
        processValue(colours_pdf_location),
        processValue(colours_sent_date),
        processValue(colours_reminder_sent_date),
        processValue(planning_status),
        processValue(energy_report_status),
        processValue(footing_certification_status),
        processValue(building_permit_status),
        normalizedYear !== undefined ? (normalizedYear === null ? null : normalizedYear) : processValue(year),
        processValue(project_info_notes),
        processValue(specs),
        processValue(classification),
        processValue(number_of_robes),
        processValue(robe_widths),
        processValue(substatus),
        processValue(substatus_detail),
        onHoldValue,
        processValue(survey_status),
        processValue(soil_status),
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
      "SELECT id, name, email, phone, primary_position_id, created_at, updated_at FROM users ORDER BY name ASC, id ASC"
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
    const { name, email, phone, positionIds, primaryPositionId } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    await pool.query('BEGIN');
    
    // Create the user
    const userResult = await pool.query(
      `INSERT INTO users (name, email, phone, primary_position_id) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [
        name.trim(),
        email ? email.trim() : null,
        phone ? phone.trim() : null,
        primaryPositionId ? parseInt(primaryPositionId) : null,
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
      `SELECT u.id, u.name, u.email, u.phone, u.primary_position_id, u.created_at, u.updated_at 
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
    const { name, email, phone, positionIds, primaryPositionId } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });

    await pool.query('BEGIN');

    // Update the user
    const userResult = await pool.query(
      `UPDATE users 
       SET name = $1, email = $2, phone = $3, primary_position_id = $4, updated_at = NOW()
       WHERE id = $5 
       RETURNING *`,
      [
        name.trim(),
        email ? email.trim() : null,
        phone ? phone.trim() : null,
        primaryPositionId ? parseInt(primaryPositionId) : null,
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

// Get app mode (admin only)
app.get("/api/admin/app-mode", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  
  // Check if admin
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  
  try {
    const mode = await getAppMode();
    res.json({ mode });
  } catch (e) {
    console.error("Error fetching app mode:", e);
    res.status(500).json({ error: e.message });
  }
});

// Update app mode (admin only)
app.put("/api/admin/app-mode", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  
  // Check if admin
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  
  try {
    const { mode } = req.body || {};
    
    // Validate mode
    if (mode !== "USE" && mode !== "EDIT") {
      return res.status(400).json({ error: "Mode must be 'USE' or 'EDIT'" });
    }
    
    await pool.query(
      `UPDATE settings SET app_mode = $1, updated_at = NOW() WHERE id = 1`,
      [mode]
    );
    
    // Update cache immediately
    appModeCache = { mode, lastCheck: Date.now() };
    
    res.json({ mode });
  } catch (e) {
    console.error("Error updating app mode:", e);
    res.status(500).json({ error: e.message });
  }
});

// Get settings
app.get("/api/settings", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const r = await pool.query(
      "SELECT id, root_directory, create_folders, smtp_user, smtp_pass, smtp_user_secondary, smtp_pass_secondary, root_directory_qld, create_folders_qld, smtp_user_qld, smtp_pass_qld, test_project_name_qld, test_folder_qld, global_password, admin_password, colour_attachments_vic, colour_attachments_qld, send_drawings_vic, send_drawings_qld, updated_at FROM settings WHERE id = 1"
    );
    if (r.rows.length === 0) {
      return res.json({
        id: 1,
        root_directory: null,
        create_folders: "true",
        smtp_user: null,
        smtp_pass: null,
        smtp_user_secondary: null,
        smtp_pass_secondary: null,
        root_directory_qld: null,
        create_folders_qld: "true",
        smtp_user_qld: null,
        smtp_pass_qld: null,
        test_project_name_qld: null,
        test_folder_qld: null,
        global_password: null,
        admin_password: null,
        colour_attachments_vic: null,
        colour_attachments_qld: null,
        send_drawings_vic: [],
        send_drawings_qld: [],
        updated_at: null,
      });
    }
    // Parse JSON arrays in response
    const result = r.rows[0];
    if (result.send_drawings_vic) {
      try {
        result.send_drawings_vic = JSON.parse(result.send_drawings_vic);
      } catch (e) {
        result.send_drawings_vic = [];
      }
    } else {
      result.send_drawings_vic = [];
    }
    if (result.send_drawings_qld) {
      try {
        result.send_drawings_qld = JSON.parse(result.send_drawings_qld);
      } catch (e) {
        result.send_drawings_qld = [];
      }
    } else {
      result.send_drawings_qld = [];
    }
    res.json(result);
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
    const { root_directory, create_folders, smtp_user, smtp_pass, smtp_user_secondary, smtp_pass_secondary, root_directory_qld, create_folders_qld, smtp_user_qld, smtp_pass_qld, test_project_name_qld, test_folder_qld, global_password, admin_password, colour_attachments_vic, colour_attachments_qld, send_drawings_vic, send_drawings_qld } = req.body || {};

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

    const processArray = (val) => {
      if (val === undefined || val === null) return null;
      if (Array.isArray(val)) {
        return JSON.stringify(val);
      }
      return null;
    };

    const r = await pool.query(
      `INSERT INTO settings (id, root_directory, create_folders, smtp_user, smtp_pass, smtp_user_secondary, smtp_pass_secondary, root_directory_qld, create_folders_qld, smtp_user_qld, smtp_pass_qld, test_project_name_qld, test_folder_qld, global_password, admin_password, colour_attachments_vic, colour_attachments_qld, send_drawings_vic, send_drawings_qld, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
       ON CONFLICT (id)
       DO UPDATE SET
         root_directory = COALESCE($1, settings.root_directory),
         create_folders = COALESCE($2, settings.create_folders),
         smtp_user = COALESCE($3, settings.smtp_user),
         smtp_pass = COALESCE($4, settings.smtp_pass),
         smtp_user_secondary = COALESCE($5, settings.smtp_user_secondary),
         smtp_pass_secondary = COALESCE($6, settings.smtp_pass_secondary),
         root_directory_qld = COALESCE($7, settings.root_directory_qld),
         create_folders_qld = COALESCE($8, settings.create_folders_qld),
         smtp_user_qld = COALESCE($9, settings.smtp_user_qld),
         smtp_pass_qld = COALESCE($10, settings.smtp_pass_qld),
         test_project_name_qld = COALESCE($11, settings.test_project_name_qld),
         test_folder_qld = COALESCE($12, settings.test_folder_qld),
         global_password = COALESCE($13, settings.global_password),
         admin_password = COALESCE($14, settings.admin_password),
         colour_attachments_vic = COALESCE($15, settings.colour_attachments_vic),
         colour_attachments_qld = COALESCE($16, settings.colour_attachments_qld),
         send_drawings_vic = COALESCE($17, settings.send_drawings_vic),
         send_drawings_qld = COALESCE($18, settings.send_drawings_qld),
         updated_at = NOW()
       RETURNING id, root_directory, create_folders, smtp_user, smtp_pass, smtp_user_secondary, smtp_pass_secondary, root_directory_qld, create_folders_qld, smtp_user_qld, smtp_pass_qld, test_project_name_qld, test_folder_qld, global_password, admin_password, colour_attachments_vic, colour_attachments_qld, send_drawings_vic, send_drawings_qld, updated_at`,
      [
        processValue(root_directory),
        processBoolean(create_folders),
        processValue(smtp_user),
        processValue(smtp_pass),
        processValue(smtp_user_secondary),
        processValue(smtp_pass_secondary),
        processValue(root_directory_qld),
        processBoolean(create_folders_qld),
        processValue(smtp_user_qld),
        processValue(smtp_pass_qld),
        processValue(test_project_name_qld),
        processValue(test_folder_qld),
        processValue(global_password),
        processValue(admin_password),
        processValue(colour_attachments_vic),
        processValue(colour_attachments_qld),
        processArray(send_drawings_vic),
        processArray(send_drawings_qld),
      ]
    );

    // Parse JSON arrays in response
    const result = r.rows[0];
    if (result.send_drawings_vic) {
      try {
        result.send_drawings_vic = JSON.parse(result.send_drawings_vic);
      } catch (e) {
        result.send_drawings_vic = [];
      }
    } else {
      result.send_drawings_vic = [];
    }
    if (result.send_drawings_qld) {
      try {
        result.send_drawings_qld = JSON.parse(result.send_drawings_qld);
      } catch (e) {
        result.send_drawings_qld = [];
      }
    } else {
      result.send_drawings_qld = [];
    }

    res.json(result);
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

// Helper function to get SMTP credentials based on from_address
async function getSmtpCredentialsForFromAddress(fromAddress) {
  if (!pool) {
    return {
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
    };
  }

  try {
    const settingsResult = await pool.query(
      "SELECT smtp_user, smtp_pass, smtp_user_secondary, smtp_pass_secondary FROM settings WHERE id = 1"
    );

    if (settingsResult.rows.length === 0) {
      return {
        smtpUser: process.env.SMTP_USER,
        smtpPass: process.env.SMTP_PASS,
      };
    }

    const settings = settingsResult.rows[0];
    const primaryEmail = settings.smtp_user?.trim().toLowerCase();
    const secondaryEmail = settings.smtp_user_secondary?.trim().toLowerCase();
    const fromEmail = fromAddress?.trim().toLowerCase();

    // Match from_address to determine which SMTP to use
    if (fromEmail && secondaryEmail && fromEmail === secondaryEmail) {
      // Use secondary SMTP if from_address matches secondary email
      if (settings.smtp_user_secondary && settings.smtp_pass_secondary) {
        return {
          smtpUser: settings.smtp_user_secondary,
          smtpPass: settings.smtp_pass_secondary,
        };
      }
    }

    // Default to primary SMTP (or match if from_address matches primary)
    if (settings.smtp_user && settings.smtp_pass) {
      return {
        smtpUser: settings.smtp_user,
        smtpPass: settings.smtp_pass,
      };
    }

    // Fallback to environment variables
    return {
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
    };
  } catch (e) {
    console.error("Error fetching SMTP credentials:", e);
    return {
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
    };
  }
}

// Helper function to add SGF logo to email HTML and attachments
async function addLogoToEmail(htmlBody, attachments = []) {
  const logoPath = "Z:\\1.SGF PROJECT MANAGEMENT\\SGF RESOURCES\\LOGOS\\SGF.jpg";
  
  try {
    // Check if logo file exists
    await fs.access(logoPath);
    
    // Read logo file
    const logoBuffer = await fs.readFile(logoPath);
    
    // Add logo as CID attachment
    attachments.push({
      filename: "SGF.jpg",
      content: logoBuffer,
      cid: "sgf-logo", // Content-ID for embedding
      contentType: "image/jpeg",
    });
    
    // Add logo image to HTML body (at the end)
    const logoHtml = `<br><br><div style="text-align: left; margin-top: 20px;"><img src="cid:sgf-logo" alt="SGF Logo" style="max-width: 200px; height: auto;" /></div>`;
    
    // Insert logo before closing body/html tags, or append if no tags
    if (htmlBody.includes("</body>")) {
      htmlBody = htmlBody.replace("</body>", `${logoHtml}</body>`);
    } else if (htmlBody.includes("</html>")) {
      htmlBody = htmlBody.replace("</html>", `${logoHtml}</html>`);
    } else {
      // No HTML structure, just append
      htmlBody = htmlBody + logoHtml;
    }
    
    return { htmlBody, attachments };
  } catch (e) {
    console.error("Error adding logo to email:", e.message);
    // If logo can't be found, continue without it
    return { htmlBody, attachments };
  }
}

// Send HTML email via SMTP
app.post("/api/emails/send", async (req, res) => {
  const { to, from, subject, htmlBody } = req.body || {};

  if (!to || (Array.isArray(to) && to.length === 0)) {
    return res.status(400).json({ error: "To address is required" });
  }
  if (!from) {
    return res.status(400).json({ error: "From address is required" });
  }

  // Get SMTP credentials based on from_address
  const smtpCreds = await getSmtpCredentialsForFromAddress(from);
  let smtpUser = smtpCreds.smtpUser;
  let smtpPass = smtpCreds.smtpPass;

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
    let htmlEmailBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${rawBody}</body></html>`;

    // Add logo to email
    const logoResult = await addLogoToEmail(htmlEmailBody, []);
    htmlEmailBody = logoResult.htmlBody;

    const mailOptions = {
      from: from,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject: subject || "",
      html: htmlEmailBody,
      attachments: logoResult.attachments,
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

// Send drawings PDF via email with attachment
app.post("/api/emails/send-drawings", async (req, res) => {
  const { projectId, toEmail, attachDrawings, toEmails, customBody, from, subject: customSubject } = req.body || {};
  const attachPdf = attachDrawings !== false; // Default to true if not specified

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required" });
  }

  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL not set" });
  }

  // Get project details and drawings PDF location
  let project = null;
  let drawingsPdfPath = null;
  try {
    const projectResult = await pool.query(
      "SELECT suburb, street, drawings_pdf_location FROM projects WHERE id = $1",
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    project = projectResult.rows[0];
    drawingsPdfPath = project.drawings_pdf_location;

    // Only check for PDF file if we need to attach it
    if (attachPdf) {
      if (!drawingsPdfPath) {
        return res.status(404).json({ error: "Drawings PDF not found for this project" });
      }

      // Check if file exists
      try {
        await fs.access(drawingsPdfPath);
      } catch (e) {
        return res.status(404).json({ error: "Drawings PDF file does not exist on disk" });
      }
    }
  } catch (e) {
    console.error("Error fetching project:", e);
    return res.status(500).json({ error: "Failed to fetch project details" });
  }

  // Get SMTP credentials based on the "from" address
  // Fetch all SMTP settings to match the correct one
  let smtpUser = null;
  let smtpPass = null;
  let fromAddress = from || null;
  
  try {
    const r = await pool.query(
      "SELECT smtp_user, smtp_pass, smtp_user_secondary, smtp_pass_secondary, smtp_user_qld, smtp_pass_qld FROM settings WHERE id = 1"
    );
    if (r.rows[0]) {
      const settings = r.rows[0];
      
      // If from address is provided, match it to the correct SMTP account
      if (fromAddress) {
        if (settings.smtp_user_secondary && fromAddress.toLowerCase() === settings.smtp_user_secondary.toLowerCase()) {
          smtpUser = settings.smtp_user_secondary;
          smtpPass = settings.smtp_pass_secondary;
        } else if (settings.smtp_user_qld && fromAddress.toLowerCase() === settings.smtp_user_qld.toLowerCase()) {
          smtpUser = settings.smtp_user_qld;
          smtpPass = settings.smtp_pass_qld;
        } else if (settings.smtp_user && fromAddress.toLowerCase() === settings.smtp_user.toLowerCase()) {
          smtpUser = settings.smtp_user;
          smtpPass = settings.smtp_pass;
        } else {
          // Default to primary SMTP if no match
          smtpUser = settings.smtp_user;
          smtpPass = settings.smtp_pass;
        }
      } else {
        // No from address provided, use primary SMTP
        smtpUser = settings.smtp_user;
        smtpPass = settings.smtp_pass;
      }
    }
  } catch (e) {
    console.error("Error reading SMTP from settings:", e);
  }
  
  // Fallback to environment variables if settings not found
  if (!smtpUser || !smtpPass) {
    smtpUser = process.env.SMTP_USER;
    smtpPass = process.env.SMTP_PASS;
  }
  
  if (!smtpUser || !smtpPass) {
    return res.status(503).json({
      error:
        "SMTP not configured. Set SMTP User and SMTP Pass in Settings → Email Settings, or use backend .env.",
    });
  }
  
  // Use the from address if provided, otherwise use the SMTP user
  if (!fromAddress) {
    fromAddress = smtpUser;
  }

  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";

  try {
    // Read the PDF file only if we need to attach it
    let fileBuffer = null;
    let fileName = null;
    if (attachPdf && drawingsPdfPath) {
      fileBuffer = await fs.readFile(drawingsPdfPath);
      fileName = drawingsPdfPath.split("\\").pop() || drawingsPdfPath.split("/").pop() || "drawings.pdf";
    }

    // Create email transporter
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    // Prepare email content
    const suburb = (project.suburb || "").toUpperCase();
    const street = project.street || "";
    
    // Use custom subject if provided, otherwise use default
    const subject = customSubject || `New Drawings - ${suburb} - ${street}`;
    
    // Use custom body if provided, otherwise build default body
    let htmlBody;
    if (customBody !== undefined && customBody !== null) {
      htmlBody = customBody.toString();
      
      // Add "Approve Concept Here" button for CONCEPT client emails (when attachDrawings is true)
      // Check if this is a CONCEPT email by looking for "CONCEPT" in the subject, body, or comment marker
      const isConceptEmail = attachPdf === true && (
        (customSubject && customSubject.includes("CONCEPT")) || 
        htmlBody.includes("CONCEPT") || 
        htmlBody.includes("<!-- CONCEPT -->")
      );
      
      if (isConceptEmail) {
        // Add approval button link - make it more prominent
        const approvalUrl = `http://192.168.0.222:3001/approve-concept/${projectId}`;
        const approvalButtonHtml = `
          <br><br>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${approvalUrl}" style="
              display: inline-block;
              padding: 20px 48px;
              background-color: #4D93D9;
              color: #ffffff;
              text-decoration: none;
              border-radius: 10px;
              font-weight: 600;
              font-size: 1.3rem;
              box-shadow: 0 4px 12px rgba(77, 147, 217, 0.4);
            ">Approve Concept Here</a>
          </div>
        `;
        
        // Find the word "approve" (case-insensitive) and insert button right after it
        const approvePattern = /\bapprove\b/i;
        const match = htmlBody.match(approvePattern);
        if (match) {
          // Find the end of the word "approve" (including any trailing punctuation or whitespace)
          const insertIndex = match.index + match[0].length;
          // Insert button right after "approve"
          htmlBody = htmlBody.slice(0, insertIndex) + approvalButtonHtml + htmlBody.slice(insertIndex);
        } else {
          // Fallback: insert before "Powered by" or at the end
          const poweredByPattern = /Powered by SGF Central/i;
          const poweredByMatch = htmlBody.match(poweredByPattern);
          if (poweredByMatch) {
            const insertIndex = poweredByMatch.index;
            htmlBody = htmlBody.slice(0, insertIndex) + approvalButtonHtml + htmlBody.slice(insertIndex);
          } else {
            // Last resort: append at the end
            htmlBody += approvalButtonHtml;
          }
        }
      }
      
      // Only add "View Drawings" button for Drafting Notes emails (Preview & Send Email modal)
      // Do NOT add it for "Email Drawings to Client" emails (when attachDrawings is true)
      if (attachPdf === false) {
        // Add button link to drawings page directly after the notes
        const drawingsUrl = `http://192.168.0.222:3001/project/${projectId}?view=drawings`;
        const buttonHtml = `
          <br><br>
          <div style="text-align: left; margin: 20px 0;">
            <a href="${drawingsUrl}" style="
              display: inline-block;
              padding: 16px 32px;
              background-color: #4D93D9;
              color: #ffffff;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 500;
              font-size: 1.1rem;
            ">View Drawings</a>
          </div>
        `;
        
        // Find where the notes section ends and insert button right after it
        // Look for patterns that come after the notes: {Draftsperson}, {Position}, or "Powered by"
        let buttonInserted = false;
        
        // Find the position right before {Draftsperson} or {Position} tokens
        // These tokens come after the notes section
        const afterNotesPatterns = [
          /{Draftsperson}/i,
          /{Position}/i,
          /<b>.*?<\/b>\s*Powered by/i,
          /Powered by SGF Central/i
        ];
        
        for (const pattern of afterNotesPatterns) {
          const match = htmlBody.match(pattern);
          if (match) {
            // Insert button right before this pattern
            const insertIndex = match.index;
            htmlBody = htmlBody.slice(0, insertIndex) + buttonHtml + htmlBody.slice(insertIndex);
            buttonInserted = true;
            break;
          }
        }
        
        // Fallback: if we can't find the pattern, append at the end
        if (!buttonInserted) {
          htmlBody += buttonHtml;
        }
      }
    } else {
      // Build default email body with optional notes
      const { notes } = req.body || {};
      htmlBody = `New Drawings for ${suburb} - ${street}`;
      if (notes && notes.trim()) {
        htmlBody += `<br><br>${notes.trim().replace(/\n/g, "<br>")}`;
      }
      htmlBody += `<br><br>SGF CENTRAL`;
    }

    // Use provided emails (array or single) or default to info@superiorgrannyflats.com.au
    let recipientEmails = [];
    
    if (toEmails && Array.isArray(toEmails) && toEmails.length > 0) {
      // Use provided array of emails
      recipientEmails = toEmails.filter(email => email && email.trim());
    } else if (toEmail) {
      // Fallback to single email for backward compatibility
      recipientEmails = [toEmail];
    } else {
      // Default to info@superiorgrannyflats.com.au
      recipientEmails = ["info@superiorgrannyflats.com.au"];
    }
    
    if (recipientEmails.length === 0) {
      return res.status(400).json({ error: "No valid recipient email addresses provided" });
    }
    
    const recipientEmail = recipientEmails.join(", ");
    
    // fromAddress is already set above based on the "from" parameter and matching SMTP credentials

    // Prepare attachments array
    const emailAttachments = [];
    
    // Only attach PDF if requested
    if (attachPdf && drawingsPdfPath && fileBuffer) {
      emailAttachments.push({
        filename: fileName,
        content: fileBuffer,
        contentType: "application/pdf",
      });
    }

    // Add logo to email
    const logoResult = await addLogoToEmail(htmlBody, emailAttachments);

    const mailOptions = {
      from: fromAddress,
      to: recipientEmail,
      subject: subject,
      html: logoResult.htmlBody,
      attachments: logoResult.attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    res.json({ success: true, messageId: info.messageId, message: "Drawings email sent successfully!" });
  } catch (e) {
    console.error("Error sending drawings email:", e);
    res.status(500).json({
      error: e.message || "Failed to send email. Check SMTP settings and credentials.",
    });
  }
});

// Send colours PDFs via email with attachments
app.post("/api/emails/send-colours", async (req, res) => {
  const { projectId, attachAffordable, attachSuperior, toEmails, customBody } = req.body || {};

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required" });
  }

  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL not set" });
  }

  // Get project details including client names
  let project = null;
  try {
    const projectResult = await pool.query(
      "SELECT suburb, street, state, client1_name, client1_active, client2_name, client2_active, client3_name, client3_active, draftsperson FROM projects WHERE id = $1",
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    project = projectResult.rows[0];
  } catch (e) {
    console.error("Error fetching project:", e);
    return res.status(500).json({ error: "Failed to fetch project details" });
  }

  // Get settings for colour attachments path and SMTP
  let colourAttachmentsPath = null;
  let smtpUser = null;
  let smtpPass = null;
  try {
    const settingsResult = await pool.query(
      "SELECT colour_attachments_vic, colour_attachments_qld, smtp_user, smtp_pass FROM settings WHERE id = 1"
    );
    
    if (settingsResult.rows.length > 0) {
      const settings = settingsResult.rows[0];
      // Use VIC or QLD path based on project state
      if (project.state === "VIC") {
        colourAttachmentsPath = settings.colour_attachments_vic;
      } else if (project.state === "QLD") {
        colourAttachmentsPath = settings.colour_attachments_qld;
      }
      
      smtpUser = settings.smtp_user;
      smtpPass = settings.smtp_pass;
    }
  } catch (e) {
    console.error("Error reading settings:", e);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }

  if (!colourAttachmentsPath) {
    return res.status(400).json({ 
      error: `Colour attachments path not configured for ${project.state || "this state"}. Please set it in Settings → File Settings.` 
    });
  }

  // Get email template by name
  let template = null;
  try {
    const templateResult = await pool.query(
      "SELECT id, name, to_addresses, from_address, subject, body FROM email_templates WHERE name = $1",
      ["COLOURS - Send"]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email template "COLOURS - Send" not found. Please create it in Settings → Email Settings.' });
    }
    
    try {
      template = {
        ...templateResult.rows[0],
        to_addresses: templateResult.rows[0].to_addresses ? JSON.parse(templateResult.rows[0].to_addresses) : []
      };
    } catch (parseError) {
      console.error("Error parsing template to_addresses:", parseError);
      template = {
        ...templateResult.rows[0],
        to_addresses: []
      };
    }
  } catch (e) {
    console.error("Error fetching email template:", e);
    return res.status(500).json({ error: `Failed to fetch email template: ${e.message}` });
  }

  // Get Colour Consultant name(s)
  let colourConsultantName = "";
  try {
    const consultantResult = await pool.query(
      `SELECT DISTINCT u.name 
       FROM users u
       INNER JOIN user_positions up ON u.id = up.user_id
       INNER JOIN positions p ON up.position_id = p.id
       WHERE LOWER(TRIM(p.name)) = LOWER(TRIM($1))
       ORDER BY u.name ASC`,
      ["Colour Consultant"]
    );
    
    if (consultantResult.rows.length > 0) {
      const consultantNames = consultantResult.rows.map(row => row.name.trim()).filter(name => name);
      if (consultantNames.length === 1) {
        colourConsultantName = consultantNames[0];
      } else if (consultantNames.length > 1) {
        // Multiple consultants: "Name1, Name2 & Name3"
        if (consultantNames.length === 2) {
          colourConsultantName = `${consultantNames[0]} & ${consultantNames[1]}`;
        } else {
          const allButLast = consultantNames.slice(0, -1).join(", ");
          const last = consultantNames[consultantNames.length - 1];
          colourConsultantName = `${allButLast} & ${last}`;
        }
      }
    }
  } catch (e) {
    console.error("Error fetching Colour Consultant:", e);
    // Don't fail if we can't find consultant, just leave token as empty string
  }

  // Build attachment paths
  // Normalize the path (handle trailing slashes/backslashes)
  const normalizedPath = colourAttachmentsPath.replace(/[\/\\]+$/, "");
  const attachments = [];
  
  if (attachAffordable) {
    const affordablePath = path.join(normalizedPath, "COLOR_AFFORDABLE.pdf");
    console.log(`Attempting to read COLOR_AFFORDABLE.pdf from: ${affordablePath}`);
    try {
      await fs.access(affordablePath);
      const fileBuffer = await fs.readFile(affordablePath);
      attachments.push({
        filename: "COLOR_AFFORDABLE.pdf",
        content: fileBuffer,
        contentType: "application/pdf",
      });
      console.log(`Successfully loaded COLOR_AFFORDABLE.pdf`);
    } catch (e) {
      console.error(`Error reading COLOR_AFFORDABLE.pdf: ${e.message}`, e);
      return res.status(404).json({ error: `COLOR_AFFORDABLE.pdf not found at ${affordablePath}. Error: ${e.message}` });
    }
  }

  if (attachSuperior) {
    const superiorPath = path.join(normalizedPath, "COLOR_SUPERIOR.pdf");
    console.log(`Attempting to read COLOR_SUPERIOR.pdf from: ${superiorPath}`);
    try {
      await fs.access(superiorPath);
      const fileBuffer = await fs.readFile(superiorPath);
      attachments.push({
        filename: "COLOR_SUPERIOR.pdf",
        content: fileBuffer,
        contentType: "application/pdf",
      });
      console.log(`Successfully loaded COLOR_SUPERIOR.pdf`);
    } catch (e) {
      console.error(`Error reading COLOR_SUPERIOR.pdf: ${e.message}`, e);
      return res.status(404).json({ error: `COLOR_SUPERIOR.pdf not found at ${superiorPath}. Error: ${e.message}` });
    }
  }

  if (attachments.length === 0) {
    return res.status(400).json({ error: "At least one attachment must be selected" });
  }

  // Get SMTP credentials based on template's from_address
  // For QLD projects, use QLD SMTP; for VIC projects, use from_address to determine primary/secondary
  if (project.state === "QLD") {
    try {
      const qldSettingsResult = await pool.query(
        "SELECT smtp_user_qld, smtp_pass_qld FROM settings WHERE id = 1"
      );
      if (qldSettingsResult.rows[0]?.smtp_user_qld && qldSettingsResult.rows[0]?.smtp_pass_qld) {
        smtpUser = qldSettingsResult.rows[0].smtp_user_qld;
        smtpPass = qldSettingsResult.rows[0].smtp_pass_qld;
      }
    } catch (e) {
      console.error("Error reading QLD SMTP from settings:", e);
    }
  } else {
    // VIC project - use from_address to determine which SMTP to use
    const fromAddress = template.from_address;
    const smtpCreds = await getSmtpCredentialsForFromAddress(fromAddress);
    smtpUser = smtpCreds.smtpUser;
    smtpPass = smtpCreds.smtpPass;
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
    // Create email transporter
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    // Prepare email content from template
    const suburb = (project.suburb || "").toUpperCase();
    const street = project.street || "";
    
    // Get active client names (first names only)
    const activeClientFirstNames = [];
    if (project.client1_active === true || project.client1_active === 'true') {
      if (project.client1_name && project.client1_name.trim()) {
        const firstName = project.client1_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    if (project.client2_active === true || project.client2_active === 'true') {
      if (project.client2_name && project.client2_name.trim()) {
        const firstName = project.client2_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    if (project.client3_active === true || project.client3_active === 'true') {
      if (project.client3_name && project.client3_name.trim()) {
        const firstName = project.client3_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    
    // Format client first names with commas and "&"
    let clientName = "";
    if (activeClientFirstNames.length === 0) {
      clientName = ""; // No active clients
    } else if (activeClientFirstNames.length === 1) {
      clientName = activeClientFirstNames[0];
    } else if (activeClientFirstNames.length === 2) {
      clientName = `${activeClientFirstNames[0]} & ${activeClientFirstNames[1]}`;
    } else {
      // 3 or more: "Name1, Name2 & Name3"
      const allButLast = activeClientFirstNames.slice(0, -1).join(", ");
      const last = activeClientFirstNames[activeClientFirstNames.length - 1];
      clientName = `${allButLast} & ${last}`;
    }
    
    // Format project name: "<Street>, <Suburb>"
    const projectName = `${street || ""}, ${suburb || ""}`.trim().replace(/^,\s*|,\s*$/g, "");
    
    // Get draftsperson name
    let draftspersonName = "";
    if (project.draftsperson) {
      try {
        const draftspersonResult = await pool.query("SELECT name FROM users WHERE id = $1", [project.draftsperson]);
        if (draftspersonResult.rows.length > 0) {
          draftspersonName = draftspersonResult.rows[0].name || "";
        }
      } catch (e) {
        console.error("Error fetching draftsperson name:", e);
      }
    }
    
    // Replace template variables in subject and body
    let subject = (template.subject || "").toString();
    // Use customBody if provided, otherwise use template body
    let htmlBody = (customBody !== undefined && customBody !== null) ? customBody.toString() : (template.body || "").toString();
    
    // Replace common placeholders
    subject = subject.replace(/\{SUBURB\}/g, suburb)
                     .replace(/\{STREET\}/g, street)
                     .replace(/\{ClientName\}/g, clientName)
                     .replace(/\{ProjectName\}/g, projectName)
                     .replace(/\{ColourConsultant\}/g, colourConsultantName)
                     .replace(/\{Draftsperson\}/g, draftspersonName)
                     .replace(/\{DRAFTSPERSON\}/g, draftspersonName);
    // Only replace tokens in htmlBody if customBody was not provided (to avoid double replacement)
    if (customBody === undefined || customBody === null) {
      htmlBody = htmlBody.replace(/\{SUBURB\}/g, suburb)
                         .replace(/\{STREET\}/g, street)
                         .replace(/\{ClientName\}/g, clientName)
                         .replace(/\{ProjectName\}/g, projectName)
                         .replace(/\{ColourConsultant\}/g, colourConsultantName)
                         .replace(/\{Draftsperson\}/g, draftspersonName)
                         .replace(/\{DRAFTSPERSON\}/g, draftspersonName);
    }
    
    // Convert newlines to HTML breaks
    htmlBody = htmlBody.replace(/\n/g, "<br>");
    
    // Wrap in HTML structure if not already HTML
    if (!htmlBody.includes("<html") && !htmlBody.includes("<!DOCTYPE")) {
      htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${htmlBody}</body></html>`;
    }

    // Use provided emails or template default
    let recipientEmails = [];
    if (toEmails && Array.isArray(toEmails) && toEmails.length > 0) {
      recipientEmails = toEmails.filter(email => email && email.trim());
    } else if (template.to_addresses && Array.isArray(template.to_addresses) && template.to_addresses.length > 0) {
      recipientEmails = template.to_addresses.filter(email => email && email.trim());
    }
    
    if (recipientEmails.length === 0) {
      return res.status(400).json({ error: "No valid recipient email addresses provided" });
    }
    
    const recipientEmail = recipientEmails.join(", ");

    // Use template's from_address (or fallback to SMTP user)
    // Office 365 requires the "from" address to match the authenticated user
    const fromAddress = template.from_address || smtpUser;
    
    // Add logo to email (logo will be added to existing attachments array)
    const logoResult = await addLogoToEmail(htmlBody, attachments);
    
    const mailOptions = {
      from: fromAddress,
      to: recipientEmail,
      subject: subject,
      html: logoResult.htmlBody,
      attachments: logoResult.attachments,
    };

    console.log(`Sending colours email from: ${fromAddress}`);
    console.log(`Sending colours email to: ${recipientEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Attachments: ${attachments.length} file(s)`);
    
    // Verify SMTP connection before sending
    try {
      await transporter.verify();
      console.log("SMTP connection verified successfully");
    } catch (verifyError) {
      console.error("SMTP verification failed:", verifyError);
      return res.status(500).json({
        error: `SMTP connection failed: ${verifyError.message || verifyError}`,
        details: verifyError.response || verifyError.code,
      });
    }
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully. Message ID: ${info.messageId}`);
    
    // Add project log entry
    try {
      const now = new Date();
      const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
      const attachmentsList = [];
      if (attachAffordable) attachmentsList.push("Affordable");
      if (attachSuperior) attachmentsList.push("Superior");
      const attachmentsText = attachmentsList.length > 0 ? ` - ${attachmentsList.join(", ")}` : "";
      const logEntry = `Colours Email Sent${attachmentsText} - ${dateTimeStr}`;
      
      // Get current project log
      const projectLogResult = await pool.query(
        "SELECT project_log FROM projects WHERE id = $1",
        [projectId]
      );
      
      const currentLog = projectLogResult.rows[0]?.project_log || "";
      const newLog = currentLog ? `${currentLog}\n${logEntry}` : logEntry;
      
      // Update project log and colours_sent_date
      await pool.query(
        "UPDATE projects SET project_log = $1, colours_sent_date = $2 WHERE id = $3",
        [newLog, dateTimeStr, projectId]
      );
      
      console.log(`Project log and colours_sent_date updated for project ${projectId}`);
    } catch (logError) {
      console.error("Error updating project log:", logError);
      // Don't fail the request if log update fails
    }
    
    res.json({ success: true, messageId: info.messageId, message: "Colours email sent successfully!" });
  } catch (e) {
    console.error("Error sending colours email:", e);
    console.error("Error stack:", e.stack);
    
    // Extract more detailed error information from nodemailer
    let errorMessage = e.message || "Failed to send email. Check SMTP settings and credentials.";
    let errorDetails = null;
    
    if (e.response) {
      errorDetails = e.response;
      errorMessage += ` Response: ${e.response}`;
    }
    if (e.responseCode) {
      errorDetails = { code: e.responseCode, response: e.response };
      errorMessage += ` Code: ${e.responseCode}`;
    }
    if (e.command) {
      errorMessage += ` Command: ${e.command}`;
    }
    
    res.status(500).json({
      error: errorMessage,
      details: errorDetails || (process.env.NODE_ENV === "development" ? e.stack : undefined),
    });
  }
});

// Send colours reminder email - identical to send-colours but uses "COLOURS - Remind" template
app.post("/api/emails/send-colours-reminder", async (req, res) => {
  const { projectId, attachAffordable, attachSuperior, toEmails, customBody } = req.body || {};

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required" });
  }

  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL not set" });
  }

  // Get project details including client names
  let project = null;
  try {
    const projectResult = await pool.query(
      "SELECT suburb, street, state, client1_name, client1_active, client2_name, client2_active, client3_name, client3_active, draftsperson FROM projects WHERE id = $1",
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    project = projectResult.rows[0];
  } catch (e) {
    console.error("Error fetching project:", e);
    return res.status(500).json({ error: "Failed to fetch project details" });
  }

  // Get settings for colour attachments path and SMTP
  let colourAttachmentsPath = null;
  let smtpUser = null;
  let smtpPass = null;
  try {
    const settingsResult = await pool.query(
      "SELECT colour_attachments_vic, colour_attachments_qld, smtp_user, smtp_pass, smtp_user_secondary, smtp_pass_secondary FROM settings WHERE id = 1"
    );
    
    if (settingsResult.rows.length > 0) {
      const settings = settingsResult.rows[0];
      // Use VIC or QLD path based on project state
      if (project.state === "VIC") {
        colourAttachmentsPath = settings.colour_attachments_vic;
      } else if (project.state === "QLD") {
        colourAttachmentsPath = settings.colour_attachments_qld;
      }
      
      smtpUser = settings.smtp_user;
      smtpPass = settings.smtp_pass;
    }
  } catch (e) {
    console.error("Error reading settings:", e);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }

  if (!colourAttachmentsPath) {
    return res.status(400).json({ 
      error: `Colour attachments path not configured for ${project.state || "this state"}. Please set it in Settings → File Settings.` 
    });
  }

  // Get email template by name - use "COLOURS - Remind"
  let template = null;
  try {
    const templateResult = await pool.query(
      "SELECT id, name, to_addresses, from_address, subject, body FROM email_templates WHERE name = $1",
      ["COLOURS - Remind"]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email template "COLOURS - Remind" not found. Please create it in Settings → Email Settings.' });
    }
    
    try {
      template = {
        ...templateResult.rows[0],
        to_addresses: templateResult.rows[0].to_addresses ? JSON.parse(templateResult.rows[0].to_addresses) : []
      };
    } catch (parseError) {
      console.error("Error parsing template to_addresses:", parseError);
      template = {
        ...templateResult.rows[0],
        to_addresses: []
      };
    }
  } catch (e) {
    console.error("Error fetching email template:", e);
    return res.status(500).json({ error: `Failed to fetch email template: ${e.message}` });
  }

  // Get Colour Consultant name(s)
  let colourConsultantName = "";
  try {
    const consultantResult = await pool.query(
      `SELECT DISTINCT u.name 
       FROM users u
       INNER JOIN user_positions up ON u.id = up.user_id
       INNER JOIN positions p ON up.position_id = p.id
       WHERE LOWER(TRIM(p.name)) = LOWER(TRIM($1))
       ORDER BY u.name ASC`,
      ["Colour Consultant"]
    );
    
    if (consultantResult.rows.length > 0) {
      const consultantNames = consultantResult.rows.map(row => row.name.trim()).filter(name => name);
      if (consultantNames.length === 1) {
        colourConsultantName = consultantNames[0];
      } else if (consultantNames.length > 1) {
        // Multiple consultants: "Name1, Name2 & Name3"
        if (consultantNames.length === 2) {
          colourConsultantName = `${consultantNames[0]} & ${consultantNames[1]}`;
        } else {
          const allButLast = consultantNames.slice(0, -1).join(", ");
          const last = consultantNames[consultantNames.length - 1];
          colourConsultantName = `${allButLast} & ${last}`;
        }
      }
    }
  } catch (e) {
    console.error("Error fetching Colour Consultant:", e);
    // Don't fail if we can't find consultant, just leave token as empty string
  }

  // Build attachment paths
  // Normalize the path (handle trailing slashes/backslashes)
  const normalizedPath = colourAttachmentsPath.replace(/[\/\\]+$/, "");
  const attachments = [];
  
  if (attachAffordable) {
    const affordablePath = path.join(normalizedPath, "COLOR_AFFORDABLE.pdf");
    console.log(`Attempting to read COLOR_AFFORDABLE.pdf from: ${affordablePath}`);
    try {
      await fs.access(affordablePath);
      const fileBuffer = await fs.readFile(affordablePath);
      attachments.push({
        filename: "COLOR_AFFORDABLE.pdf",
        content: fileBuffer,
        contentType: "application/pdf",
      });
      console.log(`Successfully loaded COLOR_AFFORDABLE.pdf`);
    } catch (e) {
      console.error(`Error reading COLOR_AFFORDABLE.pdf: ${e.message}`, e);
      return res.status(404).json({ error: `COLOR_AFFORDABLE.pdf not found at ${affordablePath}. Error: ${e.message}` });
    }
  }

  if (attachSuperior) {
    const superiorPath = path.join(normalizedPath, "COLOR_SUPERIOR.pdf");
    console.log(`Attempting to read COLOR_SUPERIOR.pdf from: ${superiorPath}`);
    try {
      await fs.access(superiorPath);
      const fileBuffer = await fs.readFile(superiorPath);
      attachments.push({
        filename: "COLOR_SUPERIOR.pdf",
        content: fileBuffer,
        contentType: "application/pdf",
      });
      console.log(`Successfully loaded COLOR_SUPERIOR.pdf`);
    } catch (e) {
      console.error(`Error reading COLOR_SUPERIOR.pdf: ${e.message}`, e);
      return res.status(404).json({ error: `COLOR_SUPERIOR.pdf not found at ${superiorPath}. Error: ${e.message}` });
    }
  }

  if (attachments.length === 0) {
    return res.status(400).json({ error: "At least one attachment must be selected" });
  }

  // Get SMTP credentials based on template's from_address
  // For QLD projects, use QLD SMTP; for VIC projects, use from_address to determine primary/secondary
  if (project.state === "QLD") {
    // QLD projects use QLD SMTP
    try {
      const settingsResult = await pool.query(
        "SELECT smtp_user_qld, smtp_pass_qld FROM settings WHERE id = 1"
      );
      if (settingsResult.rows.length > 0 && settingsResult.rows[0].smtp_user_qld && settingsResult.rows[0].smtp_pass_qld) {
        smtpUser = settingsResult.rows[0].smtp_user_qld;
        smtpPass = settingsResult.rows[0].smtp_pass_qld;
      }
    } catch (e) {
      console.error("Error reading QLD SMTP from settings:", e);
    }
  } else {
    // VIC project - use from_address to determine which SMTP to use
    const fromAddress = template.from_address;
    const smtpCreds = await getSmtpCredentialsForFromAddress(fromAddress);
    smtpUser = smtpCreds.smtpUser;
    smtpPass = smtpCreds.smtpPass;
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
    // Create email transporter
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    // Prepare email content from template
    const suburb = (project.suburb || "").toUpperCase();
    const street = project.street || "";
    
    // Get active client names (first names only)
    const activeClientFirstNames = [];
    if (project.client1_active === true || project.client1_active === 'true') {
      if (project.client1_name && project.client1_name.trim()) {
        const firstName = project.client1_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    if (project.client2_active === true || project.client2_active === 'true') {
      if (project.client2_name && project.client2_name.trim()) {
        const firstName = project.client2_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    if (project.client3_active === true || project.client3_active === 'true') {
      if (project.client3_name && project.client3_name.trim()) {
        const firstName = project.client3_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    
    // Format client first names with commas and "&"
    let clientName = "";
    if (activeClientFirstNames.length === 0) {
      clientName = ""; // No active clients
    } else if (activeClientFirstNames.length === 1) {
      clientName = activeClientFirstNames[0];
    } else if (activeClientFirstNames.length === 2) {
      clientName = `${activeClientFirstNames[0]} & ${activeClientFirstNames[1]}`;
    } else {
      // 3 or more: "Name1, Name2 & Name3"
      const allButLast = activeClientFirstNames.slice(0, -1).join(", ");
      const last = activeClientFirstNames[activeClientFirstNames.length - 1];
      clientName = `${allButLast} & ${last}`;
    }
    
    // Format project name: "<Street>, <Suburb>"
    const projectName = `${street || ""}, ${suburb || ""}`.trim().replace(/^,\s*|,\s*$/g, "");
    
    // Get draftsperson name
    let draftspersonName = "";
    if (project.draftsperson) {
      try {
        const draftspersonResult = await pool.query("SELECT name FROM users WHERE id = $1", [project.draftsperson]);
        if (draftspersonResult.rows.length > 0) {
          draftspersonName = draftspersonResult.rows[0].name || "";
        }
      } catch (e) {
        console.error("Error fetching draftsperson name:", e);
      }
    }
    
    // Replace template variables in subject and body
    let subject = (template.subject || "").toString();
    // Use customBody if provided, otherwise use template body
    let htmlBody = (customBody !== undefined && customBody !== null) ? customBody.toString() : (template.body || "").toString();
    
    // Replace common placeholders
    subject = subject.replace(/\{SUBURB\}/g, suburb)
                     .replace(/\{STREET\}/g, street)
                     .replace(/\{ClientName\}/g, clientName)
                     .replace(/\{ProjectName\}/g, projectName)
                     .replace(/\{ColourConsultant\}/g, colourConsultantName)
                     .replace(/\{Draftsperson\}/g, draftspersonName)
                     .replace(/\{DRAFTSPERSON\}/g, draftspersonName);
    // Only replace tokens in htmlBody if customBody was not provided (to avoid double replacement)
    if (customBody === undefined || customBody === null) {
      htmlBody = htmlBody.replace(/\{SUBURB\}/g, suburb)
                         .replace(/\{STREET\}/g, street)
                         .replace(/\{ClientName\}/g, clientName)
                         .replace(/\{ProjectName\}/g, projectName)
                         .replace(/\{ColourConsultant\}/g, colourConsultantName)
                         .replace(/\{Draftsperson\}/g, draftspersonName)
                         .replace(/\{DRAFTSPERSON\}/g, draftspersonName);
    }
    
    // Convert newlines to HTML breaks
    htmlBody = htmlBody.replace(/\n/g, "<br>");
    
    // Wrap in HTML structure if not already HTML
    if (!htmlBody.includes("<html") && !htmlBody.includes("<!DOCTYPE")) {
      htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${htmlBody}</body></html>`;
    }

    // Use provided emails or template default
    let recipientEmails = [];
    if (toEmails && Array.isArray(toEmails) && toEmails.length > 0) {
      recipientEmails = toEmails.filter(email => email && email.trim());
    } else if (template.to_addresses && Array.isArray(template.to_addresses) && template.to_addresses.length > 0) {
      recipientEmails = template.to_addresses.filter(email => email && email.trim());
    }
    
    if (recipientEmails.length === 0) {
      return res.status(400).json({ error: "No valid recipient email addresses provided" });
    }
    
    const recipientEmail = recipientEmails.join(", ");

    // Use template's from_address (or fallback to SMTP user)
    // Office 365 requires the "from" address to match the authenticated user
    const fromAddress = template.from_address || smtpUser;
    
    // Add logo to email (logo will be added to existing attachments array)
    const logoResult = await addLogoToEmail(htmlBody, attachments);
    
    const mailOptions = {
      from: fromAddress,
      to: recipientEmail,
      subject: subject,
      html: logoResult.htmlBody,
      attachments: logoResult.attachments,
    };

    console.log(`Sending colours reminder email from: ${fromAddress}`);
    console.log(`Sending colours reminder email to: ${recipientEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Attachments: ${attachments.length} file(s)`);
    
    // Verify SMTP connection before sending
    try {
      await transporter.verify();
      console.log("SMTP connection verified successfully");
    } catch (verifyError) {
      console.error("SMTP verification failed:", verifyError);
      return res.status(500).json({
        error: `SMTP connection failed: ${verifyError.message || verifyError}`,
        details: verifyError.response || verifyError.code,
      });
    }
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully. Message ID: ${info.messageId}`);
    
    // Add project log entry and update colours_reminder_sent_date
    try {
      const now = new Date();
      const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
      const attachmentsList = [];
      if (attachAffordable) attachmentsList.push("Affordable");
      if (attachSuperior) attachmentsList.push("Superior");
      const attachmentsText = attachmentsList.length > 0 ? ` - ${attachmentsList.join(", ")}` : "";
      const logEntry = `Colours Reminder Email Sent${attachmentsText} - ${dateTimeStr}`;
      
      // Get current project log
      const projectLogResult = await pool.query(
        "SELECT project_log FROM projects WHERE id = $1",
        [projectId]
      );
      
      const currentLog = projectLogResult.rows[0]?.project_log || "";
      const newLog = currentLog ? `${currentLog}\n${logEntry}` : logEntry;
      
      // Update project log and colours_reminder_sent_date
      await pool.query(
        "UPDATE projects SET project_log = $1, colours_reminder_sent_date = $2 WHERE id = $3",
        [newLog, dateTimeStr, projectId]
      );
      
      console.log(`Project log and colours_reminder_sent_date updated for project ${projectId}`);
    } catch (logError) {
      console.error("Error updating project log:", logError);
      // Don't fail the request if log update fails
    }
    
    res.json({ success: true, messageId: info.messageId, message: "Colours reminder email sent successfully!" });
  } catch (e) {
    console.error("Error in POST /api/emails/send-colours-reminder:", e);
    console.error("Error stack:", e.stack);
    
    // Extract more detailed error information from nodemailer
    let errorMessage = e.message || "Failed to send email. Check SMTP settings and credentials.";
    let errorDetails = null;
    
    if (e.response) {
      errorDetails = e.response;
      errorMessage += ` Response: ${e.response}`;
    }
    if (e.responseCode) {
      errorDetails = { code: e.responseCode, response: e.response };
      errorMessage += ` Code: ${e.responseCode}`;
    }
    if (e.command) {
      errorMessage += ` Command: ${e.command}`;
    }
    
    res.status(500).json({
      error: errorMessage,
      details: errorDetails || (process.env.NODE_ENV === "development" ? e.stack : undefined),
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
        "SELECT name, suburb, street, state, year, classification FROM projects WHERE id = $1",
        [projectId]
      );
      
      if (projectResult.rows.length > 0) {
        const project = projectResult.rows[0];
        // Get root directory from settings
        const settingsResult = await pool.query("SELECT root_directory FROM settings WHERE id = 1");
        const rootDir = settingsResult.rows[0]?.root_directory;
        
        if (rootDir) {
          // Extract year from date field (always derive year from the date, never store separately)
          // The 'year' field stores the full date in YYYY-MM-DD format
          let projectYear = "";
          if (project.year) {
            const dateStr = project.year.toString();
            if (dateStr.includes("-")) {
              // Extract year from date format (YYYY-MM-DD) - always derive from date
              projectYear = dateStr.split("-")[0];
            } else if (/^\d{4}$/.test(dateStr)) {
              // Legacy: if it's just a year, use it (but should be converted to full date)
              projectYear = dateStr;
            } else {
              // Fallback to current year if date format is invalid
              projectYear = new Date().getFullYear().toString();
            }
          } else {
            // Fallback to current year if no date set
            projectYear = new Date().getFullYear().toString();
          }
          
          // Get state (uppercase)
          const state = (project.state || "").toUpperCase();
          
          if (!state) {
            return res.status(400).json({ error: "Project state is required to save proposal" });
          }
          
          // Get suburb and street
          const suburb = (project.suburb || "").toUpperCase();
          const street = project.street || "";
          
          // Build project path: root_directory/year/state/suburb - street
          // NOTE: Do NOT include classification abbreviation in folder name
          const projectFolderName = `${suburb} - ${street}`.replace(/[<>:"/\\|?*]/g, '_');
          projectPath = path.join(rootDir, projectYear, state, projectFolderName);
        }
      }
    }

    // Get the original filename
    const fileName = req.file.originalname;
    let fileLocation = fileName; // Default to just filename

    // If we have a project path, construct the expected file location
    // (Don't create folders or copy files - just store the path to where the file should be)
    if (projectPath) {
      // Construct the full file path where the proposal should be located
      const filePath = path.join(projectPath, fileName);
      fileLocation = filePath;
      console.log(`Proposal PDF location set to: ${filePath} (no files or folders created)`);
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
    console.log("=== Proposal Upload Request ===");
    console.log("1. Has file:", !!req.file);
    console.log("2. File details:", req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : "No file");
    console.log("3. Request body keys:", Object.keys(req.body));
    console.log("4. projectId:", req.body.projectId);
    console.log("5. projectPath:", req.body.projectPath);
    
    if (!req.file) {
      console.error("6. ERROR: No file uploaded");
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { projectId, projectPath } = req.body;
    
    if (!projectId) {
      console.error("6. ERROR: Project ID is missing");
      return res.status(400).json({ error: "Project ID is required" });
    }

    if (!projectPath) {
      console.error("6. ERROR: Project path is missing");
      return res.status(400).json({ error: "Project path is required" });
    }

    // Only accept PDF files
    if (req.file.mimetype !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    // DO NOT create folders - folders should ONLY be created when a new project is first created
    // Save the file directly to the project root directory as "Proposal.pdf"
    const fileName = "Proposal.pdf";
    const filePath = path.join(projectPath, fileName);

    // Write file from buffer (this will fail if folder doesn't exist, which is correct behavior)
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

    // Construct the file path (don't create folders or copy files - just save the path)
    const fileName = "WindowOrder.pdf";
    const filePath = path.join(projectPath, fileName);
    
    console.log(`Window order PDF path set to: ${filePath} (no files or folders created)`);

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
    const { projects, updateStatus } = req.body;
    
    if (!projects || !Array.isArray(projects) || projects.length === 0) {
      return res.status(400).json({ error: "Projects array is required" });
    }

    // Update each project
    for (const projectUpdate of projects) {
      const { projectId, date, period } = projectUpdate;
      
      if (!projectId) {
        continue; // Skip invalid entries
      }

      // Only update status if updateStatus is true
      if (updateStatus === true) {
        await pool.query(
          "UPDATE projects SET site_visit_scheduled_date = $1, site_visit_scheduled_period = $2, site_visit_status = $3 WHERE id = $4",
          [date || null, period || null, "Email Sent", projectId]
        );
      } else {
        // Only update date and period, not status
        await pool.query(
          "UPDATE projects SET site_visit_scheduled_date = $1, site_visit_scheduled_period = $2 WHERE id = $3",
          [date || null, period || null, projectId]
        );
      }
    }

    const statusMsg = updateStatus === true ? " and status set to \"Email Sent\"" : "";
    console.log(`Site visit scheduled updated${statusMsg} for ${projects.length} project(s)`);
    res.json({ 
      success: true, 
      message: `Site visit schedule updated${statusMsg} for ${projects.length} project(s)`
    });
  } catch (e) {
    console.error("Error updating site visit schedule:", e);
    res.status(500).json({ error: e.message || "Failed to update site visit schedule" });
  }
});

// Send colours Windows & Roof email - identical to send-colours-reminder but uses "COLORS - Windows&Roof" template
app.post("/api/emails/send-colours-windows-roof", async (req, res) => {
  const { projectId, attachAffordable, attachSuperior, toEmails, customBody } = req.body || {};

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required" });
  }

  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL not set" });
  }

  // Get project details including client names
  let project = null;
  try {
    const projectResult = await pool.query(
      "SELECT suburb, street, state, client1_name, client1_active, client2_name, client2_active, client3_name, client3_active, draftsperson FROM projects WHERE id = $1",
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    project = projectResult.rows[0];
  } catch (e) {
    console.error("Error fetching project:", e);
    return res.status(500).json({ error: "Failed to fetch project details" });
  }

  // Get settings for colour attachments path and SMTP
  let colourAttachmentsPath = null;
  let smtpUser = null;
  let smtpPass = null;
  try {
    const settingsResult = await pool.query(
      "SELECT colour_attachments_vic, colour_attachments_qld, smtp_user, smtp_pass, smtp_user_secondary, smtp_pass_secondary FROM settings WHERE id = 1"
    );
    
    if (settingsResult.rows.length > 0) {
      const settings = settingsResult.rows[0];
      // Use VIC or QLD path based on project state
      if (project.state === "VIC") {
        colourAttachmentsPath = settings.colour_attachments_vic;
      } else if (project.state === "QLD") {
        colourAttachmentsPath = settings.colour_attachments_qld;
      }
      
      smtpUser = settings.smtp_user;
      smtpPass = settings.smtp_pass;
    }
  } catch (e) {
    console.error("Error reading settings:", e);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }

  if (!colourAttachmentsPath) {
    return res.status(400).json({ 
      error: `Colour attachments path not configured for ${project.state || "this state"}. Please set it in Settings → File Settings.` 
    });
  }

  // Get email template by name - use "COLORS - Windows&Roof"
  let template = null;
  try {
    const templateResult = await pool.query(
      "SELECT id, name, to_addresses, from_address, subject, body FROM email_templates WHERE name = $1",
      ["COLORS - Windows&Roof"]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email template "COLORS - Windows&Roof" not found. Please create it in Settings → Email Settings.' });
    }
    
    try {
      template = {
        ...templateResult.rows[0],
        to_addresses: templateResult.rows[0].to_addresses ? JSON.parse(templateResult.rows[0].to_addresses) : []
      };
    } catch (parseError) {
      console.error("Error parsing template to_addresses:", parseError);
      template = {
        ...templateResult.rows[0],
        to_addresses: []
      };
    }
  } catch (e) {
    console.error("Error fetching email template:", e);
    return res.status(500).json({ error: `Failed to fetch email template: ${e.message}` });
  }

  // Get Colour Consultant name(s)
  let colourConsultantName = "";
  try {
    const consultantResult = await pool.query(
      `SELECT DISTINCT u.name 
       FROM users u
       INNER JOIN user_positions up ON u.id = up.user_id
       INNER JOIN positions p ON up.position_id = p.id
       WHERE LOWER(TRIM(p.name)) = LOWER(TRIM($1))
       ORDER BY u.name ASC`,
      ["Colour Consultant"]
    );
    
    if (consultantResult.rows.length > 0) {
      const consultantNames = consultantResult.rows.map(row => row.name.trim()).filter(name => name);
      if (consultantNames.length === 1) {
        colourConsultantName = consultantNames[0];
      } else if (consultantNames.length > 1) {
        // Multiple consultants: "Name1, Name2 & Name3"
        if (consultantNames.length === 2) {
          colourConsultantName = `${consultantNames[0]} & ${consultantNames[1]}`;
        } else {
          const allButLast = consultantNames.slice(0, -1).join(", ");
          const last = consultantNames[consultantNames.length - 1];
          colourConsultantName = `${allButLast} & ${last}`;
        }
      }
    }
  } catch (e) {
    console.error("Error fetching Colour Consultant:", e);
    // Don't fail if we can't find consultant, just leave token as empty string
  }

  // Build attachment paths
  // Normalize the path (handle trailing slashes/backslashes)
  const normalizedPath = colourAttachmentsPath.replace(/[\/\\]+$/, "");
  const attachments = [];
  
  if (attachAffordable) {
    const affordablePath = path.join(normalizedPath, "COLOR_AFFORDABLE.pdf");
    console.log(`Attempting to read COLOR_AFFORDABLE.pdf from: ${affordablePath}`);
    try {
      await fs.access(affordablePath);
      const fileBuffer = await fs.readFile(affordablePath);
      attachments.push({
        filename: "COLOR_AFFORDABLE.pdf",
        content: fileBuffer,
        contentType: "application/pdf",
      });
      console.log(`Successfully loaded COLOR_AFFORDABLE.pdf`);
    } catch (e) {
      console.error(`Error reading COLOR_AFFORDABLE.pdf: ${e.message}`, e);
      return res.status(404).json({ error: `COLOR_AFFORDABLE.pdf not found at ${affordablePath}. Error: ${e.message}` });
    }
  }

  if (attachSuperior) {
    const superiorPath = path.join(normalizedPath, "COLOR_SUPERIOR.pdf");
    console.log(`Attempting to read COLOR_SUPERIOR.pdf from: ${superiorPath}`);
    try {
      await fs.access(superiorPath);
      const fileBuffer = await fs.readFile(superiorPath);
      attachments.push({
        filename: "COLOR_SUPERIOR.pdf",
        content: fileBuffer,
        contentType: "application/pdf",
      });
      console.log(`Successfully loaded COLOR_SUPERIOR.pdf`);
    } catch (e) {
      console.error(`Error reading COLOR_SUPERIOR.pdf: ${e.message}`, e);
      return res.status(404).json({ error: `COLOR_SUPERIOR.pdf not found at ${superiorPath}. Error: ${e.message}` });
    }
  }

  if (attachments.length === 0) {
    return res.status(400).json({ error: "At least one attachment must be selected" });
  }

  // Get SMTP credentials based on template's from_address
  // For QLD projects, use QLD SMTP; for VIC projects, use from_address to determine primary/secondary
  if (project.state === "QLD") {
    // QLD projects use QLD SMTP
    try {
      const settingsResult = await pool.query(
        "SELECT smtp_user_qld, smtp_pass_qld FROM settings WHERE id = 1"
      );
      if (settingsResult.rows.length > 0 && settingsResult.rows[0].smtp_user_qld && settingsResult.rows[0].smtp_pass_qld) {
        smtpUser = settingsResult.rows[0].smtp_user_qld;
        smtpPass = settingsResult.rows[0].smtp_pass_qld;
      }
    } catch (e) {
      console.error("Error reading QLD SMTP from settings:", e);
    }
  } else {
    // VIC project - use from_address to determine which SMTP to use
    const fromAddress = template.from_address;
    const smtpCreds = await getSmtpCredentialsForFromAddress(fromAddress);
    smtpUser = smtpCreds.smtpUser;
    smtpPass = smtpCreds.smtpPass;
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
    // Create email transporter
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });

    // Prepare email content from template
    const suburb = (project.suburb || "").toUpperCase();
    const street = project.street || "";
    
    // Get active client names (first names only)
    const activeClientFirstNames = [];
    if (project.client1_active === true || project.client1_active === 'true') {
      if (project.client1_name && project.client1_name.trim()) {
        const firstName = project.client1_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    if (project.client2_active === true || project.client2_active === 'true') {
      if (project.client2_name && project.client2_name.trim()) {
        const firstName = project.client2_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    if (project.client3_active === true || project.client3_active === 'true') {
      if (project.client3_name && project.client3_name.trim()) {
        const firstName = project.client3_name.trim().split(/\s+/)[0]; // Get first word
        if (firstName) activeClientFirstNames.push(firstName);
      }
    }
    
    // Format client first names with commas and "&"
    let clientName = "";
    if (activeClientFirstNames.length === 0) {
      clientName = ""; // No active clients
    } else if (activeClientFirstNames.length === 1) {
      clientName = activeClientFirstNames[0];
    } else if (activeClientFirstNames.length === 2) {
      clientName = `${activeClientFirstNames[0]} & ${activeClientFirstNames[1]}`;
    } else {
      // 3 or more: "Name1, Name2 & Name3"
      const allButLast = activeClientFirstNames.slice(0, -1).join(", ");
      const last = activeClientFirstNames[activeClientFirstNames.length - 1];
      clientName = `${allButLast} & ${last}`;
    }
    
    // Format project name: "<Street>, <Suburb>"
    const projectName = `${street || ""}, ${suburb || ""}`.trim().replace(/^,\s*|,\s*$/g, "");
    
    // Get draftsperson name
    let draftspersonName = "";
    if (project.draftsperson) {
      try {
        const draftspersonResult = await pool.query("SELECT name FROM users WHERE id = $1", [project.draftsperson]);
        if (draftspersonResult.rows.length > 0) {
          draftspersonName = draftspersonResult.rows[0].name || "";
        }
      } catch (e) {
        console.error("Error fetching draftsperson name:", e);
      }
    }
    
    // Replace template variables in subject and body
    let subject = (template.subject || "").toString();
    // Use customBody if provided, otherwise use template body
    let htmlBody = (customBody !== undefined && customBody !== null) ? customBody.toString() : (template.body || "").toString();
    
    // Replace common placeholders
    subject = subject.replace(/\{SUBURB\}/g, suburb)
                     .replace(/\{STREET\}/g, street)
                     .replace(/\{ClientName\}/g, clientName)
                     .replace(/\{ProjectName\}/g, projectName)
                     .replace(/\{ColourConsultant\}/g, colourConsultantName)
                     .replace(/\{Draftsperson\}/g, draftspersonName)
                     .replace(/\{DRAFTSPERSON\}/g, draftspersonName);
    // Only replace tokens in htmlBody if customBody was not provided (to avoid double replacement)
    if (customBody === undefined || customBody === null) {
      htmlBody = htmlBody.replace(/\{SUBURB\}/g, suburb)
                         .replace(/\{STREET\}/g, street)
                         .replace(/\{ClientName\}/g, clientName)
                         .replace(/\{ProjectName\}/g, projectName)
                         .replace(/\{ColourConsultant\}/g, colourConsultantName)
                         .replace(/\{Draftsperson\}/g, draftspersonName)
                         .replace(/\{DRAFTSPERSON\}/g, draftspersonName);
    }
    
    // Convert newlines to HTML breaks
    htmlBody = htmlBody.replace(/\n/g, "<br>");
    
    // Wrap in HTML structure if not already HTML
    if (!htmlBody.includes("<html") && !htmlBody.includes("<!DOCTYPE")) {
      htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${htmlBody}</body></html>`;
    }

    // Use provided emails or template default
    let recipientEmails = [];
    if (toEmails && Array.isArray(toEmails) && toEmails.length > 0) {
      recipientEmails = toEmails.filter(email => email && email.trim());
    } else if (template.to_addresses && Array.isArray(template.to_addresses) && template.to_addresses.length > 0) {
      recipientEmails = template.to_addresses.filter(email => email && email.trim());
    }
    
    if (recipientEmails.length === 0) {
      return res.status(400).json({ error: "No valid recipient email addresses provided" });
    }
    
    const recipientEmail = recipientEmails.join(", ");

    // Use template's from_address (or fallback to SMTP user)
    // Office 365 requires the "from" address to match the authenticated user
    const fromAddress = template.from_address || smtpUser;
    
    // Add logo to email (logo will be added to existing attachments array)
    const logoResult = await addLogoToEmail(htmlBody, attachments);
    
    const mailOptions = {
      from: fromAddress,
      to: recipientEmail,
      subject: subject,
      html: logoResult.htmlBody,
      attachments: logoResult.attachments,
    };

    console.log(`Sending colours Windows & Roof email from: ${fromAddress}`);
    console.log(`Sending colours Windows & Roof email to: ${recipientEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Attachments: ${attachments.length} file(s)`);
    
    // Verify SMTP connection before sending
    try {
      await transporter.verify();
      console.log("SMTP connection verified successfully");
    } catch (verifyError) {
      console.error("SMTP verification failed:", verifyError);
      return res.status(500).json({
        error: `SMTP connection failed: ${verifyError.message || verifyError}`,
        details: verifyError.response || verifyError.code,
      });
    }
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully. Message ID: ${info.messageId}`);
    
    // Add project log entry
    try {
      const now = new Date();
      const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
      const attachmentsList = [];
      if (attachAffordable) attachmentsList.push("Affordable");
      if (attachSuperior) attachmentsList.push("Superior");
      const attachmentsText = attachmentsList.length > 0 ? ` - ${attachmentsList.join(", ")}` : "";
      const logEntry = `Colours Windows & Roof Email Sent${attachmentsText} - ${dateTimeStr}`;
      
      // Get current project log
      const projectLogResult = await pool.query(
        "SELECT project_log FROM projects WHERE id = $1",
        [projectId]
      );
      
      const currentLog = projectLogResult.rows[0]?.project_log || "";
      const newLog = currentLog ? `${currentLog}\n${logEntry}` : logEntry;
      
      // Update project log
      await pool.query(
        "UPDATE projects SET project_log = $1 WHERE id = $2",
        [newLog, projectId]
      );
      
      console.log(`Project log updated for project ${projectId}`);
    } catch (logError) {
      console.error("Error updating project log:", logError);
      // Don't fail the request if log update fails
    }
    
    res.json({ success: true, messageId: info.messageId, message: "Colours Windows & Roof email sent successfully!" });
  } catch (e) {
    console.error("Error in POST /api/emails/send-colours-windows-roof:", e);
    console.error("Error stack:", e.stack);
    
    // Extract more detailed error information from nodemailer
    let errorMessage = e.message || "Failed to send email. Check SMTP settings and credentials.";
    let errorDetails = null;
    
    if (e.response) {
      errorDetails = e.response;
      errorMessage += ` Response: ${e.response}`;
    }
    if (e.responseCode) {
      errorDetails = { code: e.responseCode, response: e.response };
      errorMessage += ` Code: ${e.responseCode}`;
    }
    if (e.command) {
      errorMessage += ` Command: ${e.command}`;
    }
    
    res.status(500).json({
      error: errorMessage,
      details: errorDetails,
    });
  }
});

// Send windows order email
app.post("/api/emails/send-windows-order", async (req, res) => {
  const { projectId, customBody, windowColour, windowReveal, windowGlazing, windowBalRating, windowDateRequired } = req.body || {};

  if (!projectId) {
    return res.status(400).json({ error: "Project ID is required" });
  }

  if (!pool) {
    return res.status(500).json({ error: "DATABASE_URL not set" });
  }

  // Get project details including drawings PDF location
  let project = null;
  let drawingsPdfPath = null;
  try {
    const projectResult = await pool.query(
      "SELECT suburb, street, state, drawings_pdf_location FROM projects WHERE id = $1",
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    project = projectResult.rows[0];
    drawingsPdfPath = project.drawings_pdf_location;
  } catch (e) {
    console.error("Error fetching project:", e);
    return res.status(500).json({ error: "Failed to fetch project details" });
  }

  // Get SMTP settings
  let smtpUser = null;
  let smtpPass = null;
  try {
    const settingsResult = await pool.query(
      "SELECT smtp_user, smtp_pass, smtp_user_secondary, smtp_pass_secondary, smtp_user_qld, smtp_pass_qld FROM settings WHERE id = 1"
    );
    
    if (settingsResult.rows.length > 0) {
      const settings = settingsResult.rows[0];
      if (project.state === "QLD") {
        smtpUser = settings.smtp_user_qld;
        smtpPass = settings.smtp_pass_qld;
      } else {
        smtpUser = settings.smtp_user;
        smtpPass = settings.smtp_pass;
      }
    }
  } catch (e) {
    console.error("Error reading settings:", e);
    return res.status(500).json({ error: "Failed to fetch settings" });
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

  // Get email template
  let template = null;
  try {
    const templateResult = await pool.query(
      "SELECT id, name, to_addresses, from_address, subject, body FROM email_templates WHERE name = $1",
      ["WINDOWS - Order"]
    );
    
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email template "WINDOWS - Order" not found. Please create it in Settings → Email Settings.' });
    }
    
    try {
      template = {
        ...templateResult.rows[0],
        to_addresses: templateResult.rows[0].to_addresses ? JSON.parse(templateResult.rows[0].to_addresses) : []
      };
    } catch (parseError) {
      console.error("Error parsing template to_addresses:", parseError);
      template = {
        ...templateResult.rows[0],
        to_addresses: []
      };
    }
  } catch (e) {
    console.error("Error fetching email template:", e);
    return res.status(500).json({ error: `Failed to fetch email template: ${e.message}` });
  }

  // Build window ordering information
  // Note: windowDateRequired will already be formatted (date string for "Normal", "Urgent" for urgent)
  const windowInfo = `Window Colour: ${windowColour || "N/A"}
Reveal: ${windowReveal || "N/A"}
Glazing: ${windowGlazing || "N/A"}
BAL Rating: ${windowBalRating || "N/A"}
Date Required: ${windowDateRequired || "N/A"}`;

  // Prepare email content
  const suburb = (project.suburb || "").toUpperCase();
  const street = project.street || "";
  const projectName = `${street || ""}, ${suburb || ""}`.trim().replace(/^,\s*|,\s*$/g, "");
  
  // Replace template variables in subject and body
  let subject = (template.subject || "").toString();
  // Use customBody if provided, otherwise use template body
  let htmlBody = (customBody !== undefined && customBody !== null) ? customBody.toString() : (template.body || "").toString();
  
  // Replace common placeholders
  subject = subject.replace(/\{SUBURB\}/g, suburb)
                   .replace(/\{STREET\}/g, street)
                   .replace(/\{ProjectName\}/g, projectName);
  
  // Only replace tokens in htmlBody if customBody was not provided
  if (customBody === undefined || customBody === null) {
    htmlBody = htmlBody.replace(/\{SUBURB\}/g, suburb)
                       .replace(/\{STREET\}/g, street)
                       .replace(/\{ProjectName\}/g, projectName);
    
    // Insert window info after "<b>Scope</b>"
    // Look for <b>Scope</b> or <b>scope</b> (case insensitive)
    const scopePattern = /<b>Scope<\/b>/i;
    const match = htmlBody.match(scopePattern);
    if (match) {
      // Find the position after the closing </b>
      const insertIndex = match.index + match[0].length;
      // Insert window info after </b>
      htmlBody = htmlBody.slice(0, insertIndex) + "\n\n" + windowInfo + htmlBody.slice(insertIndex);
    } else {
      // If "<b>Scope</b>" not found, append at the end
      htmlBody = htmlBody + "\n\n" + windowInfo;
    }
  }
  
  // Convert newlines to HTML breaks
  htmlBody = htmlBody.replace(/\n/g, "<br>");
  
  // Wrap in HTML structure if not already HTML
  if (!htmlBody.includes("<html") && !htmlBody.includes("<!DOCTYPE")) {
    htmlBody = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${htmlBody}</body></html>`;
  }

  // Use template's to_addresses only (not from request)
  let recipientEmails = [];
  if (template.to_addresses && Array.isArray(template.to_addresses) && template.to_addresses.length > 0) {
    recipientEmails = template.to_addresses.filter(email => email && email.trim());
  }
  
  if (recipientEmails.length === 0) {
    return res.status(400).json({ error: "No recipient email addresses configured in the template. Please set recipients in Settings → Email Settings." });
  }
  
  const recipientEmail = recipientEmails.join(", ");

  // Use template's from_address (or fallback to SMTP user)
  const fromAddress = template.from_address || smtpUser;
  
  // Build attachments array - attach drawings PDF (required)
  const attachments = [];
  
  if (!drawingsPdfPath) {
    return res.status(400).json({ error: "Drawings PDF not found for this project. Please upload drawings on the Drawings page before sending the window order email." });
  }
  
  try {
    // Check if file exists
    await fs.access(drawingsPdfPath);
    const fileBuffer = await fs.readFile(drawingsPdfPath);
    const fileName = drawingsPdfPath.split("\\").pop() || drawingsPdfPath.split("/").pop() || "drawings.pdf";
    attachments.push({
      filename: fileName,
      content: fileBuffer,
      contentType: "application/pdf",
    });
    console.log(`Successfully loaded drawings PDF: ${fileName}`);
  } catch (e) {
    console.error(`Error reading drawings PDF: ${e.message}`, e);
    return res.status(404).json({ error: `Drawings PDF file does not exist at ${drawingsPdfPath}. Please ensure the drawings PDF has been uploaded correctly.` });
  }
  
  // Add logo to email (logo will be added to existing attachments array)
  const logoResult = await addLogoToEmail(htmlBody, attachments);
  
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

    const mailOptions = {
      from: fromAddress,
      to: recipientEmail,
      subject: subject,
      html: logoResult.htmlBody,
      attachments: logoResult.attachments,
    };

    console.log(`Sending windows order email from: ${fromAddress}`);
    console.log(`Sending windows order email to: ${recipientEmail}`);
    console.log(`Subject: ${subject}`);
    
    // Verify SMTP connection before sending
    try {
      await transporter.verify();
      console.log("SMTP connection verified successfully");
    } catch (verifyError) {
      console.error("SMTP verification failed:", verifyError);
      return res.status(500).json({
        error: `SMTP connection failed: ${verifyError.message || verifyError}`,
        details: verifyError.response || verifyError.code,
      });
    }
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully. Message ID: ${info.messageId}`);
    
    // Update window status to "Ordered" and set ordered date
    try {
      const now = new Date();
      const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
      
      // Get current project log
      const projectLogResult = await pool.query(
        "SELECT project_log FROM projects WHERE id = $1",
        [projectId]
      );
      
      const currentLog = projectLogResult.rows[0]?.project_log || "";
      const logEntry = `Window Order Email Sent - ${dateTimeStr}`;
      const newLog = currentLog ? `${currentLog}\n${logEntry}` : logEntry;
      
      // Update project log, window status, and window_ordered_date
      await pool.query(
        "UPDATE projects SET project_log = $1, window_status = $2, window_ordered_date = $3 WHERE id = $4",
        [newLog, "Ordered", dateTimeStr, projectId]
      );
      
      console.log(`Project log and window status updated for project ${projectId}`);
    } catch (logError) {
      console.error("Error updating project log:", logError);
      // Don't fail the request if log update fails
    }
    
    res.json({ success: true, messageId: info.messageId, message: "Window order email sent successfully!" });
  } catch (e) {
    console.error("Error in POST /api/emails/send-windows-order:", e);
    console.error("Error stack:", e.stack);
    
    let errorMessage = e.message || "Failed to send email. Check SMTP settings and credentials.";
    let errorDetails = null;
    
    if (e.response) {
      errorDetails = e.response;
      errorMessage += ` Response: ${e.response}`;
    }
    if (e.responseCode) {
      errorDetails = { code: e.responseCode, response: e.response };
      errorMessage += ` Code: ${e.responseCode}`;
    }
    if (e.command) {
      errorMessage += ` Command: ${e.command}`;
    }
    
    res.status(500).json({
      error: errorMessage,
      details: errorDetails || (process.env.NODE_ENV === "development" ? e.stack : undefined),
    });
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

// Serve colours PDF
app.get("/api/files/colours/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    // Get project and colours PDF location
    const projectResult = await pool.query(
      "SELECT colours_pdf_location FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const coloursPdfPath = projectResult.rows[0].colours_pdf_location;

    if (!coloursPdfPath) {
      return res.status(404).json({ error: "Colours PDF not found for this project" });
    }

    // Check if file exists
    try {
      await fs.access(coloursPdfPath);
    } catch (e) {
      return res.status(404).json({ error: "Colours PDF file does not exist" });
    }

    // Read and send the file
    const fileBuffer = await fs.readFile(coloursPdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Colours.pdf"`);
    res.send(fileBuffer);
  } catch (error) {
    console.error("Error serving colours PDF:", error);
    res.status(500).json({ error: error.message });
  }
});

// Serve markup PDF for a specific revision
app.get("/api/files/markup/:id/:revisionIndex", async (req, res) => {
  try {
    const { id, revisionIndex } = req.params;
    const revisionIdx = parseInt(revisionIndex, 10);
    
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    // Get project and drawings history
    const projectResult = await pool.query(
      "SELECT drawings_history FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Parse drawings history
    let drawingsHistory = [];
    try {
      const historyValue = projectResult.rows[0].drawings_history;
      if (historyValue) {
        drawingsHistory = typeof historyValue === 'string' ? JSON.parse(historyValue) : historyValue;
      }
    } catch (e) {
      console.error("Error parsing drawings_history:", e);
      return res.status(500).json({ error: "Failed to parse drawings history" });
    }

    // Check if revision index is valid
    if (revisionIdx < 0 || revisionIdx >= drawingsHistory.length) {
      return res.status(404).json({ error: "Revision not found" });
    }

    const markupPdfPath = drawingsHistory[revisionIdx]?.markup_pdf_location;

    if (!markupPdfPath) {
      return res.status(404).json({ error: "Markup PDF not found for this revision" });
    }

    // Check if file exists
    try {
      await fs.access(markupPdfPath);
    } catch (e) {
      return res.status(404).json({ error: "Markup PDF file does not exist" });
    }

    // Read and send the file
    const fileBuffer = await fs.readFile(markupPdfPath);
    const fileName = markupPdfPath.split("\\").pop() || markupPdfPath.split("/").pop() || "Markup.pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.send(fileBuffer);
  } catch (error) {
    console.error("Error serving markup PDF:", error);
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

// Locate/Upload robe plan PDF (saves file and path)
app.post("/api/files/locate-robe-plan", upload.single("file"), async (req, res) => {
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

    // If we have a project path, construct the expected file location
    // (Don't create folders or copy files - just store the path to where the file should be)
    if (projectPath) {
      // Construct the full file path where the robe plan should be located
      const filePath = path.join(projectPath, fileName);
      fileLocation = filePath;
      console.log(`Robe plan PDF location set to: ${filePath} (no files or folders created)`);
    }

    // Update project record with robe plan PDF location
    if (pool) {
      await pool.query(
        "UPDATE projects SET robe_plan_pdf_location = $1 WHERE id = $2",
        [fileLocation, projectId]
      );
    }

    console.log(`Robe plan PDF location saved: ${fileLocation} for project ${projectId}`);
    res.json({ 
      success: true, 
      message: "Robe plan location saved successfully",
      fileName: fileName,
      path: fileLocation
    });
  } catch (e) {
    console.error("Error saving robe plan location:", e);
    res.status(500).json({ error: e.message || "Failed to save robe plan location" });
  }
});

// Serve robe plan PDF
app.get("/api/files/robe-plan/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    // Get project and robe plan PDF location
    const projectResult = await pool.query(
      "SELECT robe_plan_pdf_location FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const robePlanPath = projectResult.rows[0].robe_plan_pdf_location;

    if (!robePlanPath) {
      return res.status(404).json({ error: "Robe plan PDF not found for this project" });
    }

    // Check if file exists
    try {
      await fs.access(robePlanPath);
    } catch (e) {
      return res.status(404).json({ error: "Robe plan PDF file does not exist" });
    }

    // Read and send the file
    const fileBuffer = await fs.readFile(robePlanPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="RobePlan.pdf"`);
    res.send(fileBuffer);
  } catch (e) {
    console.error("Error serving robe plan PDF:", e);
    res.status(500).json({ error: e.message || "Failed to serve robe plan PDF" });
  }
});

// Locate/Upload robe colours PDF (saves file and path)
app.post("/api/files/locate-robe-colours", upload.single("file"), async (req, res) => {
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

    // If we have a project path, construct the expected file location
    // (Don't create folders or copy files - just store the path to where the file should be)
    if (projectPath) {
      // Construct the full file path where the robe colours should be located
      const filePath = path.join(projectPath, fileName);
      fileLocation = filePath;
      console.log(`Robe colours PDF location set to: ${filePath} (no files or folders created)`);
    }

    // Update project record with robe colours PDF location
    if (pool) {
      await pool.query(
        "UPDATE projects SET robe_colours_pdf_location = $1 WHERE id = $2",
        [fileLocation, projectId]
      );
    }

    console.log(`Robe colours PDF location saved: ${fileLocation} for project ${projectId}`);
    res.json({ 
      success: true, 
      message: "Robe colours location saved successfully",
      fileName: fileName,
      path: fileLocation
    });
  } catch (e) {
    console.error("Error saving robe colours location:", e);
    res.status(500).json({ error: e.message || "Failed to save robe colours location" });
  }
});

// Serve robe colours PDF
app.get("/api/files/robe-colours/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!pool) {
      return res.status(500).json({ error: "DATABASE_URL not set" });
    }

    // Get project and robe colours PDF location
    const projectResult = await pool.query(
      "SELECT robe_colours_pdf_location FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const robeColoursPath = projectResult.rows[0].robe_colours_pdf_location;

    if (!robeColoursPath) {
      return res.status(404).json({ error: "Robe colours PDF not found for this project" });
    }

    // Check if file exists
    try {
      await fs.access(robeColoursPath);
    } catch (e) {
      return res.status(404).json({ error: "Robe colours PDF file does not exist" });
    }

    // Read and send the file
    const fileBuffer = await fs.readFile(robeColoursPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="RobeColours.pdf"`);
    res.send(fileBuffer);
  } catch (e) {
    console.error("Error serving robe colours PDF:", e);
    res.status(500).json({ error: e.message || "Failed to serve robe colours PDF" });
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

// ========== HOTLIST ENDPOINTS ==========
// Hotlist items are stored as projects with status "Hotlist"

// List hotlist items (projects with status "Hotlist")
app.get("/api/hotlist", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const r = await pool.query(
      "SELECT id, name, status, suburb, street, state, client_name, email, phone, updated_at FROM projects WHERE status = $1 ORDER BY updated_at DESC, id DESC",
      ["Hotlist"]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single hotlist item
app.get("/api/hotlist/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const r = await pool.query(
      "SELECT id, name, status, suburb, street, state, client_name, email, phone, updated_at FROM projects WHERE id = $1 AND status = $2",
      [id, "Hotlist"]
    );
    
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "not found" });
    }
    
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create hotlist item (as project with status "Hotlist")
app.post("/api/hotlist", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { street, suburb, state, client_name, email, phone } = req.body || {};
    
    // Derive name from street + suburb (same as normal projects)
    const projectName = `${street || ""}, ${suburb || ""}`.trim() || "New Hotlist Item";
    
    // Derive year from current date
    const currentYear = new Date().getFullYear().toString();

    // Create initial project log entry
    const now = new Date();
    const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
    const initialLogEntry = `${dateTimeStr} - Hotlist Item Created`;

    // Use same fields as normal projects - populate client1_name, client1_email, client1_phone
    const r = await pool.query(
      `INSERT INTO projects (name, status, suburb, street, state, client_name, email, phone, year, client1_name, client1_email, client1_phone, client1_active, client2_active, client3_active, contract_status, supporting_documents_status, water_authority, water_declaration_status, planning_status, energy_report_status, footing_certification_status, building_permit_status, project_log) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) RETURNING id, name, status, suburb, street, state, client_name, email, phone, updated_at`,
      [
        projectName,
        "Hotlist", // Status is "Hotlist"
        suburb ? suburb.trim() : null,
        street ? street.trim() : null,
        state ? state.trim() : null,
        client_name ? client_name.trim() : null,
        email ? email.trim() : null,
        phone ? phone.trim() : null,
        currentYear,
        client_name ? client_name.trim() : null, // client1_name (same as client_name)
        email ? email.trim() : null, // client1_email (same as email)
        phone ? phone.trim() : null, // client1_phone (same as phone)
        'true',  // client1_active
        null,    // client2_active
        null,    // client3_active
        'Not Sent',  // contract_status
        'Not Sent',  // supporting_documents_status
        'Not Required',  // water_authority
        'Not Sent',  // water_declaration_status
        'Not Selected',  // planning_status
        'Not Submitted',  // energy_report_status
        'Not Submitted',  // footing_certification_status
        'Not Submitted',  // building_permit_status
        initialLogEntry,  // project_log
      ]
    );

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update hotlist item
app.put("/api/hotlist/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const { street, suburb, state, client_name, email, phone } = req.body || {};
    
    const processValue = (val) => {
      if (val === undefined) return null;
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed === "" ? null : trimmed;
      }
      return val;
    };

    // Derive name from street + suburb
    const projectName = `${processValue(street) || ""}, ${processValue(suburb) || ""}`.trim() || "New Hotlist Item";

    // Keep client1 fields in sync with client_name, email, phone (same as normal projects)
    const r = await pool.query(
      `UPDATE projects 
       SET name = $1, street = $2, suburb = $3, state = $4, client_name = $5, email = $6, phone = $7, 
           client1_name = $5, client1_email = $6, client1_phone = $7, updated_at = NOW()
       WHERE id = $8 AND status = $9 RETURNING id, name, status, suburb, street, state, client_name, email, phone, updated_at`,
      [
        projectName,
        processValue(street),
        processValue(suburb),
        processValue(state),
        processValue(client_name),
        processValue(email),
        processValue(phone),
        id,
        "Hotlist"
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

// Delete hotlist item
app.delete("/api/hotlist/:id", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    const r = await pool.query(
      "DELETE FROM projects WHERE id = $1 AND status = $2 RETURNING id, name, status, suburb, street, state, client_name, email, phone, updated_at",
      [id, "Hotlist"]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }
    res.json({ success: true, deleted: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to delete hotlist item" });
  }
});

// Approve concept drawings (public endpoint - no auth required)
app.post("/api/projects/:id/approve-concept", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    // Get current project data
    const projectResult = await pool.query(
      "SELECT drawings_history, drawings_status, name, status, stream, suburb, street, state, deposit, project_cost, client_name, email, phone, client1_name, client1_email, client1_phone, client1_active, client2_name, client2_email, client2_phone, client2_active, client3_name, client3_email, client3_phone, client3_active, site_visit_status, site_visit_date, site_visit_time, contract_status, contract_sent_date, contract_complete_date, supporting_documents_status, supporting_documents_sent_date, supporting_documents_complete_date, water_declaration_status, water_declaration_sent_date, water_declaration_complete_date, notes, window_status, window_colour, window_reveal, window_reveal_other, window_glazing, window_bal_rating, window_date_required, window_ordered_date, window_order_pdf_location, window_order_number, drawings_pdf_location, drawings_viewed_date, colours_status, planning_status, energy_report_status, footing_certification_status, building_permit_status, draftsperson, survey_status, soil_status FROM projects WHERE id = $1",
      [id]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = projectResult.rows[0];

    // Get current drawings history
    let drawingsHistory = [];
    try {
      const historyValue = project.drawings_history;
      if (historyValue) {
        drawingsHistory = typeof historyValue === 'string' ? JSON.parse(historyValue) : historyValue;
      }
    } catch (e) {
      console.error("Error parsing drawings_history:", e);
      return res.status(400).json({ error: "Invalid drawings history data" });
    }

    if (drawingsHistory.length === 0) {
      return res.status(400).json({ error: "No drawings have been uploaded yet" });
    }

    // Mark the last entry as concept approved
    const lastIndex = drawingsHistory.length - 1;
    drawingsHistory[lastIndex] = {
      ...drawingsHistory[lastIndex],
      conceptApproved: true
    };

    // Update project with approved concept
    const projectName = project?.street && project?.suburb 
      ? `${project.street}, ${project.suburb}`.trim() 
      : project?.name || "";

    const updateResult = await pool.query(
      `UPDATE projects 
       SET drawings_history = $1, 
           drawings_status = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, drawings_status, drawings_history`,
      [JSON.stringify(drawingsHistory), "Concept Stage", id]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: "Failed to update project" });
    }

    res.json({ 
      success: true, 
      message: "Concept approved successfully",
      project: updateResult.rows[0]
    });
  } catch (e) {
    console.error("Error approving concept:", e);
    res.status(500).json({ error: e.message || "Failed to approve concept" });
  }
});

// Get all substatuses
app.get("/api/substatuses", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const result = await pool.query(
      "SELECT * FROM substatuses ORDER BY substatus, detail"
    );
    res.json(result.rows);
  } catch (e) {
    console.error("Error fetching substatuses:", e);
    res.status(500).json({ error: e.message });
  }
});

// Add a new substatus
app.post("/api/substatuses", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
  try {
    const { substatus, detail } = req.body;
    if (!substatus) {
      return res.status(400).json({ error: "substatus is required" });
    }
    const result = await pool.query(
      `INSERT INTO substatuses (substatus, detail)
       VALUES ($1, $2)
       ON CONFLICT (substatus, detail) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [substatus, detail || null]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error("Error creating substatus:", e);
    res.status(500).json({ error: e.message });
  }
});

// Upgrade hotlist item to project (Sold) - changes status from "Hotlist" to "Design Phase"
app.post("/api/hotlist/:id/sold", async (req, res) => {
  if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  try {
    // Get project with Hotlist status
    const projectResult = await pool.query(
      "SELECT * FROM projects WHERE id = $1 AND status = $2",
      [id, "Hotlist"]
    );
    
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "hotlist item not found" });
    }

    const project = projectResult.rows[0];
    
    // Update project log
    const now = new Date();
    const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
    const logEntry = project.project_log 
      ? `${project.project_log}\n${dateTimeStr} - Status changed from Hotlist to Design Phase (Sold)`
      : `${dateTimeStr} - Status changed from Hotlist to Design Phase (Sold)`;

    // Update status from "Hotlist" to "Design Phase"
    const updateResult = await pool.query(
      `UPDATE projects 
       SET status = $1, project_log = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      ["Design Phase", logEntry, id]
    );

    const updatedProject = updateResult.rows[0];

    res.json({ success: true, project: updatedProject });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to upgrade hotlist item to project" });
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
