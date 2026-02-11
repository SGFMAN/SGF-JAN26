require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});

// Normalize date field: convert year-only to full date, preserve existing dates
function normalizeDate(value) {
  if (!value) return null;
  
  const str = value.toString().trim();
  
  // If it's already a full date in YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  
  // If it's a date in MM/DD/YYYY format, convert to YYYY-MM-DD
  if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length === 3) {
      // Could be MM/DD/YYYY or DD/MM/YYYY - try both
      const part1 = parts[0].trim();
      const part2 = parts[1].trim();
      const part3 = parts[2].trim();
      
      // If part1 > 12, it's likely DD/MM/YYYY, otherwise assume MM/DD/YYYY
      if (parseInt(part1) > 12 && parseInt(part2) <= 12) {
        // DD/MM/YYYY format
        return `${part3}-${part2.padStart(2, "0")}-${part1.padStart(2, "0")}`;
      } else {
        // MM/DD/YYYY format
        return `${part3}-${part1.padStart(2, "0")}-${part2.padStart(2, "0")}`;
      }
    }
  }
  
  // If it's just a year (YYYY), convert to YYYY-01-01
  if (/^\d{4}$/.test(str)) {
    return `${str}-01-01`;
  }
  
  // If it's a date with dashes but might be in different format, try to parse
  if (str.includes("-")) {
    const parts = str.split("-");
    if (parts.length === 3) {
      const part1 = parts[0].trim();
      const part2 = parts[1].trim();
      const part3 = parts[2].trim();
      
      // If first part is 4 digits, assume YYYY-MM-DD
      if (/^\d{4}$/.test(part1)) {
        return `${part1}-${part2.padStart(2, "0")}-${part3.padStart(2, "0")}`;
      }
    }
  }
  
  // If we can't parse it, return null (will need manual review)
  console.warn(`Could not parse date: ${str}`);
  return null;
}

async function migrateDates() {
  try {
    console.log("Fetching all projects...");
    const result = await pool.query('SELECT id, year FROM projects');
    const projects = result.rows;
    
    console.log(`Found ${projects.length} projects to process.`);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const project of projects) {
      const normalizedDate = normalizeDate(project.year);
      
      if (normalizedDate === null && project.year) {
        console.log(`⚠️  Project ${project.id}: Could not normalize "${project.year}" - skipping`);
        skipped++;
        continue;
      }
      
      if (normalizedDate === project.year) {
        // No change needed
        continue;
      }
      
      try {
        await pool.query(
          'UPDATE projects SET year = $1 WHERE id = $2',
          [normalizedDate, project.id]
        );
        console.log(`✓ Project ${project.id}: "${project.year}" → "${normalizedDate}"`);
        updated++;
      } catch (error) {
        console.error(`✗ Project ${project.id}: Error updating - ${error.message}`);
        errors++;
      }
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("Migration Summary:");
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped (could not parse): ${skipped}`);
    console.log(`  Errors: ${errors}`);
    console.log(`  Total: ${projects.length}`);
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("Migration error:", error);
  } finally {
    await pool.end();
  }
}

migrateDates();
