// Script to update classification for specific projects
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

// List of projects to update (suburb and street)
const projectsToUpdate = [
  { suburb: "BOX HILL", street: "11 Bedford Street" },
  { suburb: "BRIGHTON", street: "84 Bay Street" },
  { suburb: "BUNYIP", street: "20 Strafford Lane" },
  { suburb: "BURWOOD", street: "41 Arthur St" },
  { suburb: "CRAIGIEBURN", street: "3 Crestmont Terrace" },
  { suburb: "CRESWICK", street: "15 Lalor Lane" },
  { suburb: "CROYDON", street: "2-6 Bennison Street" },
  { suburb: "DONCASTER EAST", street: "27 Montreal Drive" },
  { suburb: "DONVALE", street: "63-65 Heads Road" },
  { suburb: "FYANS CREEK", street: "192 Mokepilly Road" },
  { suburb: "HAMPTON PARK", street: "5 Cirrus Close" },
  { suburb: "KANGAROO FLAT", street: "17 Bronze Drive" },
  { suburb: "KEYSBOROUGH", street: "11 Chris Court" },
  { suburb: "KILMORE EAST", street: "5 Louis Rise" },
  { suburb: "KILSYTH", street: "175 Sheffield Road" },
  { suburb: "KILSYTH", street: "82 Cambridge Road" },
  { suburb: "KNOXFIELD", street: "60 O'Connor Road" },
  { suburb: "LANGWARRIN SOUTH", street: "40 West Road" },
  { suburb: "LONGFORD", street: "43 Peppertree Hill Road" },
  { suburb: "LYNBROOK", street: "8 Caversham Terrace" },
  { suburb: "MITCHAM", street: "429 Whitehorse Road" },
  { suburb: "NARRE WARREN NORTH", street: "35 Avenview Drive" },
  { suburb: "NOBLE PARK", street: "6 Taranto Drive" },
  { suburb: "NOTTING HILL", street: "14 Westerfield Drive" },
  { suburb: "RIDDELLS CREEK", street: "20 Whittakers Lane" },
  { suburb: "RINGWOOD NORTH", street: "38 Park Hill Drive" },
  { suburb: "ROWVILLE", street: "195 Dandelion Drive" },
  { suburb: "ROWVILLE", street: "5 Mantung Crescent" },
  { suburb: "SCOTSBURN", street: "68 Wiggins Road" },
  { suburb: "SPRINGVALE SOUTH", street: "31 Glenwood Drive" },
  { suburb: "SUNBURY", street: "1 Gurners Lane" },
  { suburb: "SUNBURY", street: "25 Higgs Circuit" },
  { suburb: "SUNBURY", street: "48 Emu Road" },
  { suburb: "SYDENHAM", street: "6 Innkeeper Place" },
  { suburb: "TEMPLESTOWE", street: "13 Anthlin Court" },
  { suburb: "WARRAGUL", street: "3 Nursery Rise" },
  { suburb: "YARRAMBAT", street: "261-279 Ironbark Road" },
];

const NEW_CLASSIFICATION = "Dependant Persons Unit";

async function updateClassifications() {
  if (!pool) {
    console.error("❌ DATABASE_URL not set. Cannot connect to database.");
    process.exit(1);
  }

  console.log(`\n🔄 Starting classification update for ${projectsToUpdate.length} projects...\n`);

  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  for (const project of projectsToUpdate) {
    try {
      // Find the project by suburb and street (case-insensitive)
      const findResult = await pool.query(
        `SELECT id, suburb, street, classification FROM projects 
         WHERE UPPER(TRIM(suburb)) = UPPER(TRIM($1)) 
         AND UPPER(TRIM(street)) = UPPER(TRIM($2))`,
        [project.suburb, project.street]
      );

      if (findResult.rows.length === 0) {
        console.log(`⚠️  Not found: ${project.suburb} - ${project.street}`);
        notFoundCount++;
        continue;
      }

      const foundProject = findResult.rows[0];
      
      // Check if already has the correct classification
      if (foundProject.classification === NEW_CLASSIFICATION) {
        console.log(`✓ Already set: ${project.suburb} - ${project.street} (ID: ${foundProject.id})`);
        successCount++;
        continue;
      }

      // Update the classification
      await pool.query(
        `UPDATE projects SET classification = $1 WHERE id = $2`,
        [NEW_CLASSIFICATION, foundProject.id]
      );

      console.log(`✓ Updated: ${project.suburb} - ${project.street} (ID: ${foundProject.id})`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error updating ${project.suburb} - ${project.street}:`, error.message);
      errorCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✓ Successfully updated: ${successCount}`);
  console.log(`   ⚠️  Not found: ${notFoundCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`\n✅ Done!\n`);

  await pool.end();
}

updateClassifications().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
