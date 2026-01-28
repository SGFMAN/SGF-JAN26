// Script to add multiple projects to the database
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

const projectsList = `CARRUM DOWNS - 15 Viking Court (SSD)
DIGGERS REST - 12 Mullock Road (SSD)
HOPPERS CROSSING - 30 Macedon Street (SSD)
KEYSBOROUGH - 10 Clarence Avenue (SSD)
MELTON - 14 Vista Drive (SSD)
NARRE WARREN SOUTH - 242 Ormond Road (SSD)
PARKDALE - 20 Sixth Street (DPU)
SUNSHINE - 20 Moira Street (SSD)
WANTIRNA - 7 Aminya Court (DPU)`;

function parseProject(line) {
  // Remove " - CANCELLED" if present
  line = line.replace(/\s*-\s*CANCELLED$/, "");
  
  // Skip lines that are just headers or empty
  if (!line.trim()) {
    return null;
  }
  
  // Find the first " - " that separates suburb from street
  // Handle cases where there might be " - " in the street name or brackets
  const match = line.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) {
    console.warn(`Skipping invalid line: ${line}`);
    return null;
  }
  
  const suburb = match[1].trim();
  let street = match[2].trim();
  
  // Remove anything in brackets at the end
  street = street.replace(/\s*\([^)]*\)\s*$/, "");
  
  // Clean up any trailing dashes or extra spaces
  street = street.replace(/\s*-\s*$/, "").trim();
  
  // Derive name from street + suburb
  const name = `${street}, ${suburb}`.trim();
  
  return { name, suburb, street, state: "VIC" };
}

async function addProjects() {
  const lines = projectsList.split("\n").filter(line => line.trim());
  const projects = lines.map(parseProject).filter(p => p !== null);
  
  console.log(`Parsed ${projects.length} projects`);
  
  const currentYear = new Date().getFullYear().toString();
  let successCount = 0;
  let errorCount = 0;
  
  for (const project of projects) {
    try {
      // Check if project already exists (by name)
      const existing = await pool.query(
        "SELECT id FROM projects WHERE name = $1",
        [project.name]
      );
      
      if (existing.rows.length > 0) {
        console.log(`⏭️  Skipping (already exists): ${project.name}`);
        continue;
      }
      
      await pool.query(
        `INSERT INTO projects (name, status, suburb, street, state, stream, year, deposit, project_cost, salesperson, client_name, email, phone, client1_name, client1_email, client1_phone, client1_active, client2_active, client3_active, contract_status, supporting_documents_status, water_declaration_status, planning_status, energy_report_status, footing_certification_status, building_permit_status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
        [
          project.name,
          "Design Phase",
          project.suburb,
          project.street,
          project.state,
          null, // stream
          currentYear,
          null, // deposit
          null, // project_cost
          null, // salesperson
          null, // client_name
          null, // email
          null, // phone
          null, // client1_name
          null, // client1_email
          null, // client1_phone
          'true',  // client1_active
          null,    // client2_active
          null,    // client3_active
          'Not Sent',  // contract_status
          'Not Sent',  // supporting_documents_status
          'Not Required',  // water_declaration_status
          'Not Selected',  // planning_status
          'Not Submitted',  // energy_report_status
          'Not Submitted',  // footing_certification_status
          'Not Submitted',  // building_permit_status
        ]
      );
      
      console.log(`✅ Added: ${project.name}`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error adding ${project.name}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n📊 Summary: ${successCount} added, ${errorCount} errors`);
  await pool.end();
}

addProjects().catch(console.error);
