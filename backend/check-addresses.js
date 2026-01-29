// Script to check how addresses are stored in the database
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

// List of suburbs to check
const suburbsToCheck = [
  "Doncaster East",
  "Eltham",
  "Breakwater",
  "Bayswater",
  "Warragul",
  "Castlemaine",
  "Birchip",
  "Springvale South",
  "Ringwood",
  "Burwood",
  "Boronia",
  "Kilsyth",
  "Noble Park",
  "Rowville",
  "Wyndham Vale",
  "Montrose",
  "Seville",
  "Ringwood North",
  "Roxburgh Park",
  "Newington",
  "Emerald",
  "Bellfield",
  "Frankston North",
  "Notting Hill",
  "Knoxfield",
  "Box Hill",
  "Vermont",
  "Forest Hill",
  "Altona Meadows",
  "The Basin",
  "Narre Warren",
  "Mt Eliza",
  "Hampton East",
  "Springvale",
  "Sunshine",
  "Teesdale",
  "Frankston",
  "Nunawading",
  "Sydenham",
  "Langwarrin",
  "Seaford",
];

async function checkAddresses() {
  if (!pool) {
    console.error("❌ DATABASE_URL not set. Cannot connect to database.");
    process.exit(1);
  }

  console.log(`\n🔍 Checking addresses in database...\n`);

  for (const suburb of suburbsToCheck) {
    try {
      const result = await pool.query(
        `SELECT id, suburb, street, status FROM projects 
         WHERE UPPER(TRIM(suburb)) LIKE UPPER(TRIM($1)) || '%'
         ORDER BY suburb, street`,
        [suburb]
      );

      if (result.rows.length > 0) {
        console.log(`\n📍 ${suburb}:`);
        result.rows.forEach((row) => {
          console.log(`   ID ${row.id}: ${row.street || '(no street)'} - Status: ${row.status}`);
        });
      } else {
        console.log(`\n📍 ${suburb}: No projects found`);
      }
    } catch (error) {
      console.error(`❌ Error checking ${suburb}:`, error.message);
    }
  }

  await pool.end();
}

checkAddresses().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
