// Script to update project status to "Construction Phase" for specific projects
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

// List of projects to update (format: "Street, Suburb")
const projectAddresses = [
  "23 Barrabool St, Doncaster East",
  "145 Brougham St, Eltham",
  "2/22 Fellmongers Rd, Breakwater",
  "919 Mountain Hwy, Bayswater",
  "3 Nursery Rise, Warragul",
  "4C Butterworth St, Castlemaine",
  "2 Sherwood St, Birchip",
  "6 Lansor St, Springvale South",
  "24 Kendall St, Ringwood",
  "41 Arthur St, Burwood",
  "394 Boronia Rd, Boronia",
  "175 Sheffield Rd, Kilsyth",
  "6 Taranto Dr, Noble Park",
  "195 Dandelion Rd, Rowville",
  "20 Robertson Cres, Boronia",
  "6 Brimpton Grove, Wyndham Vale",
  "83 Moore St, Montrose",
  "35 Gardiner Rd, Seville",
  "38 Park Hill Rd, Ringwood North",
  "21 Wilkinson Ct, Roxburgh Park",
  "28 Inkerman St, Newington",
  "14 Station St, Emerald",
  "392 Boronia Rd, Boronia",
  "35A Wilkinson Cres, Bellfield",
  "17 Mahogany Ave, Frankston North",
  "196 McGrath Rd, Wyndham Vale",
  "14 Westerfield Dr, Notting Hill",
  "60 O'Connor Rd, Knoxfield",
  "11 Bedford St, Box Hill",
  "20 Trinian St, Vermont",
  "55 Bennett St, Forest Hill",
  "51 Donald St, Altona Meadows",
  "3 Kintore Cres, Box Hill",
  "3 Cardiff St, Boronia",
  "23 Stuart St, The Basin",
  "11 Warrington Cl, Narre Warren",
  "97 Baden Powell Dr, Mt Eliza",
  "27 Widdop Cres, Hampton East",
  "6 Camelot Dr, Springvale",
  "7 Lowe St, Sunshine",
  "25 Squires Rd, Teesdale",
  "9 Leawarra Pde, Frankston",
  "16 Cyprus Ave, Nunawading",
  "24 Olive Grove, Boronia",
  "6 Innkeeper Pl, Sydenham",
  "15 Leisureland Dr, Langwarrin",
  "65 Hadley St, Seaford",
  "19 Hunt Dr, Seaford",
  "51 Laurina Cres, Frankston North",
];

// Parse addresses into suburb and street
const projectsToUpdate = projectAddresses.map((address) => {
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length !== 2) {
    throw new Error(`Invalid address format: ${address}`);
  }
  return {
    street: parts[0],
    suburb: parts[1],
  };
});

const NEW_STATUS = "Construction Phase";

async function updateStatuses() {
  if (!pool) {
    console.error("❌ DATABASE_URL not set. Cannot connect to database.");
    process.exit(1);
  }

  console.log(`\n🔄 Starting status update for ${projectsToUpdate.length} projects...\n`);

  let successCount = 0;
  let notFoundCount = 0;
  let alreadySetCount = 0;
  let errorCount = 0;

  for (const project of projectsToUpdate) {
    try {
      // Normalize street names for matching (handle abbreviations)
      const normalizeStreet = (street) => {
        return street
          .toUpperCase()
          .replace(/\s+/g, " ")
          .trim()
          .replace(/\bST\b/g, "STREET")
          .replace(/\bRD\b/g, "ROAD")
          .replace(/\bDR\b/g, "DRIVE")
          .replace(/\bCRES\b/g, "CRESCENT")
          .replace(/\bAVE\b/g, "AVENUE")
          .replace(/\bPDE\b/g, "PARADE")
          .replace(/\bPL\b/g, "PLACE")
          .replace(/\bCT\b/g, "COURT")
          .replace(/\bCL\b/g, "CLOSE")
          .replace(/\bHWY\b/g, "HIGHWAY")
          .replace(/\bCR\b/g, "CRESCENT")
          .replace(/\bGVE\b/g, "GROVE")
          .replace(/\//g, "-")
          .replace(/\s+/g, " ");
      };

      const normalizedInputStreet = normalizeStreet(project.street);
      
      // Find the project by suburb and street (case-insensitive, with normalization)
      const findResult = await pool.query(
        `SELECT id, suburb, street, status FROM projects 
         WHERE UPPER(TRIM(suburb)) = UPPER(TRIM($1)) 
         AND UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(street), ' ST ', ' STREET '), ' RD ', ' ROAD '), ' DR ', ' DRIVE '), ' CRES ', ' CRESCENT '), ' AVE ', ' AVENUE '), ' PDE ', ' PARADE '), ' PL ', ' PLACE '), ' CT ', ' COURT '), ' CL ', ' CLOSE '), ' HWY ', ' HIGHWAY '), ' CR ', ' CRESCENT '), ' GVE ', ' GROVE '), '/', '-'), '  ', ' ')) = $2`,
        [project.suburb, normalizedInputStreet]
      );

      if (findResult.rows.length === 0) {
        console.log(`⚠️  Not found: ${project.suburb} - ${project.street}`);
        notFoundCount++;
        continue;
      }

      const foundProject = findResult.rows[0];
      
      // Check if already has the correct status
      if (foundProject.status === NEW_STATUS) {
        console.log(`✓ Already set: ${project.suburb} - ${project.street} (ID: ${foundProject.id})`);
        alreadySetCount++;
        continue;
      }

      // Update the status
      await pool.query(
        `UPDATE projects SET status = $1 WHERE id = $2`,
        [NEW_STATUS, foundProject.id]
      );

      console.log(`✓ Updated: ${project.suburb} - ${project.street} (ID: ${foundProject.id}) - Status changed from "${foundProject.status}" to "${NEW_STATUS}"`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error updating ${project.suburb} - ${project.street}:`, error.message);
      errorCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✓ Successfully updated: ${successCount}`);
  console.log(`   ✓ Already set: ${alreadySetCount}`);
  console.log(`   ⚠️  Not found: ${notFoundCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`\n✅ Done!\n`);

  await pool.end();
}

updateStatuses().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
