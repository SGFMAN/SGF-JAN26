const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});

// Projects to add
const projects = [
  {
    suburb: "SLACKS CREEK",
    street: "5 GEEBA ST",
    specs: "SUPERIOR",
    project_cost: "$193,240",
    year: "2025-01-01", // Default to Jan 1st, 2025
    state: "QLD",
    stream: "SGF - QLD",
    status: "Design Phase",
  },
  {
    suburb: "BROWNS PLAINS",
    street: "55 YANCY ST",
    specs: "SUPERIOR",
    project_cost: "$189,730",
    year: "2025-01-01",
    state: "QLD",
    stream: "SGF - QLD",
    status: "Design Phase",
  },
  {
    suburb: "SAMFORD VALLEY",
    street: "50 GREGGS RD",
    specs: "SUPERIOR",
    project_cost: "$233,880",
    year: "2025-01-01",
    state: "QLD",
    stream: "SGF - QLD",
    status: "Design Phase",
  },
];

async function addProjects() {
  try {
    console.log("Connecting to database...");
    
    let addedCount = 0;
    let skippedCount = 0;
    
    for (const project of projects) {
      // Check if project already exists (by suburb and street)
      const checkResult = await pool.query(
        "SELECT id FROM projects WHERE UPPER(TRIM(suburb)) = $1 AND UPPER(TRIM(street)) = $2",
        [project.suburb.toUpperCase().trim(), project.street.toUpperCase().trim()]
      );
      
      if (checkResult.rows.length > 0) {
        console.log(`✗ Skipped ${project.suburb} - ${project.street} (already exists)`);
        skippedCount++;
        continue;
      }
      
      // Create project name from suburb and street
      const name = `${project.suburb} - ${project.street}`;
      
      // Insert project
      const result = await pool.query(
        `INSERT INTO projects (name, status, suburb, street, state, stream, year, project_cost, specs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, name`,
        [
          name,
          project.status,
          project.suburb,
          project.street,
          project.state,
          project.stream,
          project.year,
          project.project_cost,
          project.specs,
        ]
      );
      
      console.log(`✓ Added: ${name} (ID: ${result.rows[0].id})`);
      addedCount++;
    }
    
    console.log("\n=== Summary ===");
    console.log(`Projects added: ${addedCount}`);
    console.log(`Projects skipped: ${skippedCount}`);
    console.log(`Total processed: ${projects.length}`);
    
  } catch (error) {
    console.error("Error adding projects:", error);
    throw error;
  } finally {
    await pool.end();
    console.log("\nDatabase connection closed.");
  }
}

// Run the script
addProjects()
  .then(() => {
    console.log("\n✓ Project addition completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✗ Project addition failed:", error);
    process.exit(1);
  });
