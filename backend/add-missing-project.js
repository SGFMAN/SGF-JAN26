// Add the one missing project
require("dotenv").config();
const { Pool } = require("pg");

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
    })
  : null;

if (!pool) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function addMissing() {
  const currentYear = new Date().getFullYear().toString();
  
  try {
    // Check if already exists
    const existing = await pool.query(
      "SELECT id FROM projects WHERE name = $1",
      ["34 Brooksby Circuit, HARKNESS"]
    );
    
    if (existing.rows.length > 0) {
      console.log("Project already exists");
      await pool.end();
      return;
    }
    
    await pool.query(
      `INSERT INTO projects (name, status, suburb, street, state, stream, year, deposit, project_cost, salesperson, client_name, email, phone, client1_name, client1_email, client1_phone, client1_active, client2_active, client3_active, contract_status, supporting_documents_status, water_declaration_status, planning_status, energy_report_status, footing_certification_status, building_permit_status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
      [
        "34 Brooksby Circuit, HARKNESS",
        "Design Phase",
        "HARKNESS",
        "34 Brooksby Circuit",
        "VIC",
        null,
        currentYear,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        'true',
        null,
        null,
        'Not Sent',
        'Not Sent',
        'Not Required',
        'Not Selected',
        'Not Submitted',
        'Not Submitted',
        'Not Submitted',
      ]
    );
    
    console.log("✅ Added: 34 Brooksby Circuit, HARKNESS");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
  
  await pool.end();
}

addMissing().catch(console.error);
