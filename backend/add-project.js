// Script to add a new project directly to the database
require("dotenv").config();
const { Pool } = require("pg");

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.PGSSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    })
  : null;

// Project details
const projectData = {
  name: "23 Barrabool Street, DONCASTER EAST",
  suburb: "DONCASTER EAST",
  street: "23 Barrabool Street",
  year: "2023",
  status: "Design Phase", // Default status
};

async function addProject() {
  if (!pool) {
    console.error("❌ DATABASE_URL not set. Cannot connect to database.");
    process.exit(1);
  }

  console.log(`\n🔄 Adding new project to database...\n`);
  console.log(`   Suburb: ${projectData.suburb}`);
  console.log(`   Street: ${projectData.street}`);
  console.log(`   Year: ${projectData.year}`);
  console.log(`   Status: ${projectData.status}\n`);

  try {
    // Check if project already exists
    const checkResult = await pool.query(
      `SELECT id, suburb, street FROM projects 
       WHERE UPPER(TRIM(suburb)) = UPPER(TRIM($1)) 
       AND UPPER(TRIM(street)) = UPPER(TRIM($2))`,
      [projectData.suburb, projectData.street]
    );

    if (checkResult.rows.length > 0) {
      const existing = checkResult.rows[0];
      console.log(`⚠️  Project already exists:`);
      console.log(`   ID: ${existing.id}`);
      console.log(`   Suburb: ${existing.suburb}`);
      console.log(`   Street: ${existing.street}`);
      console.log(`\n❌ Project not added. Please use a different address or update the existing project.\n`);
      await pool.end();
      return;
    }

    // Insert the project with defaults
    const result = await pool.query(
      `INSERT INTO projects (
        name, 
        status, 
        suburb, 
        street, 
        year,
        project_log
      ) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING id, name, status, suburb, street, year`,
      [
        projectData.name,
        projectData.status,
        projectData.suburb,
        projectData.street,
        projectData.year,
        `Project Created - ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })}`
      ]
    );

    const newProject = result.rows[0];
    console.log(`✅ Project added successfully!`);
    console.log(`   ID: ${newProject.id}`);
    console.log(`   Name: ${newProject.name}`);
    console.log(`   Status: ${newProject.status}`);
    console.log(`   Suburb: ${newProject.suburb}`);
    console.log(`   Street: ${newProject.street}`);
    console.log(`   Year: ${newProject.year}`);
    console.log(`\n✅ Done!\n`);

    await pool.end();
  } catch (error) {
    console.error(`❌ Error adding project:`, error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

addProject().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
