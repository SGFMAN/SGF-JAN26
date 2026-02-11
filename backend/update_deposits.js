require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});

// Projects with custom deposit amounts
const customDeposits = {
  "BUNDOORA - 35 Chaucer Crescent": "$5,000",
  "CARRUM DOWNS - 15 Viking Court": "$5,000",
  "CASTLEMAINE - 11 Maltby Drive": "$5,000",
  "DALLAS - 7 Apollo Crescent": "$3,500",
  "FERNTREE GULLY - 27 James Road": "$5,000",
  "HORSHAM - 18 Phillip Street": "$5,000",
  "KEYSBOROUGH - 10 Clarence Avenue": "$5,000",
  "LARA - 100 McClelland Avenue": "$5,000",
  "MELTON WEST - 14 Vista Drive": "$3,000",
  "MOUNT EVELYN - 95 Fernhill Road": "$5,000",
  "NARRE WARREN DARLING - 2 Darling Way": "$5,000",
  "ROWVILLE - 5 Mantung Crescent": "$1,000",
  "SPRINGVALE - 797 Heatherton Rd": "$5,000",
  "SUNBURY - 1 Gurners": "$5,000",
};

// Helper function to format deposit amount
function formatDeposit(amount) {
  return `$${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

// Helper function to calculate full deposit (5% of project cost)
function calculateFullDeposit(projectCost) {
  if (!projectCost) return null;
  
  // Extract numeric value from formatted string (e.g., "$123,456" -> 123456)
  const costStr = projectCost.toString().replace(/[^0-9]/g, "");
  const costNum = parseInt(costStr) || 0;
  
  if (costNum === 0) return null;
  
  // Calculate 5% (divide by 20)
  const fullDeposit = Math.floor(costNum / 20);
  return formatDeposit(fullDeposit);
}

// Helper function to match project by suburb and street
function matchProject(project, suburb, street) {
  const projectSuburb = (project.suburb || "").trim().toUpperCase();
  const projectStreet = (project.street || "").trim();
  const projectName = (project.name || "").trim().toUpperCase();
  
  const targetSuburb = suburb.trim().toUpperCase();
  const targetStreet = street.trim();
  
  // Normalize street addresses (remove common variations)
  const normalizeStreet = (str) => {
    return str.toUpperCase()
      .replace(/\s+/g, " ")
      .replace(/STREET/g, "ST")
      .replace(/ROAD/g, "RD")
      .replace(/AVENUE/g, "AVE")
      .replace(/CRESCENT/g, "CRES")
      .replace(/DRIVE/g, "DR")
      .replace(/COURT/g, "CT")
      .trim();
  };
  
  const normalizedProjectStreet = normalizeStreet(projectStreet);
  const normalizedTargetStreet = normalizeStreet(targetStreet);
  const normalizedProjectName = normalizeStreet(projectName);
  
  // Try exact match first
  if (projectSuburb === targetSuburb && normalizedProjectStreet === normalizedTargetStreet) {
    return true;
  }
  
  // Try matching by name field (format: "SUBBURB - STREET")
  if (projectName.includes(targetSuburb) && normalizedProjectName.includes(normalizedTargetStreet)) {
    return true;
  }
  
  // Try partial matching - check if suburb matches and street contains the target street
  if (projectSuburb === targetSuburb) {
    // Check if street numbers match (e.g., "35 Chaucer" matches "35 Chaucer Crescent")
    const targetStreetNum = targetStreet.match(/^\d+/)?.[0];
    const projectStreetNum = projectStreet.match(/^\d+/)?.[0];
    
    if (targetStreetNum && projectStreetNum && targetStreetNum === projectStreetNum) {
      // Check if street name is similar
      const targetStreetName = targetStreet.replace(/^\d+\s*/, "").toUpperCase();
      const projectStreetName = projectStreet.replace(/^\d+\s*/, "").toUpperCase();
      
      if (projectStreetName.includes(targetStreetName) || targetStreetName.includes(projectStreetName)) {
        return true;
      }
    }
  }
  
  return false;
}

async function updateDeposits() {
  try {
    console.log("Connecting to database...");
    
    // Fetch all projects
    const result = await pool.query("SELECT id, name, suburb, street, project_cost, deposit FROM projects");
    const projects = result.rows;
    
    console.log(`Found ${projects.length} projects`);
    
    let updatedCount = 0;
    let customUpdatedCount = 0;
    let skippedCount = 0;
    
    // First, update projects with custom deposits
    for (const [key, customDeposit] of Object.entries(customDeposits)) {
      const [suburb, ...streetParts] = key.split(" - ");
      const street = streetParts.join(" - ");
      
      // Find matching project
      const matchingProject = projects.find(p => matchProject(p, suburb, street));
      
      if (matchingProject) {
        await pool.query(
          "UPDATE projects SET deposit = $1 WHERE id = $2",
          [customDeposit, matchingProject.id]
        );
        console.log(`✓ Updated ${key}: ${customDeposit}`);
        customUpdatedCount++;
      } else {
        console.log(`✗ Could not find project: ${key}`);
        // Debug: show similar projects
        const similarProjects = projects.filter(p => {
          const pSuburb = (p.suburb || "").trim().toUpperCase();
          const pStreet = (p.street || "").trim().toUpperCase();
          const pName = (p.name || "").trim().toUpperCase();
          return pSuburb.includes(suburb.toUpperCase()) || 
                 pName.includes(suburb.toUpperCase()) ||
                 pStreet.includes(street.toUpperCase().split(" ")[0]);
        });
        if (similarProjects.length > 0) {
          console.log(`  Similar projects found:`);
          similarProjects.slice(0, 3).forEach(p => {
            console.log(`    - ID ${p.id}: ${p.suburb || "N/A"} - ${p.street || "N/A"} (name: ${p.name || "N/A"})`);
          });
        }
      }
    }
    
    // Then, update all other projects with full deposit
    for (const project of projects) {
      // Skip if this project has a custom deposit
      const hasCustomDeposit = Object.keys(customDeposits).some(key => {
        const [suburb, ...streetParts] = key.split(" - ");
        const street = streetParts.join(" - ");
        return matchProject(project, suburb, street);
      });
      
      if (hasCustomDeposit) {
        continue; // Already updated above
      }
      
      // Calculate full deposit
      const fullDeposit = calculateFullDeposit(project.project_cost);
      
      if (fullDeposit) {
        await pool.query(
          "UPDATE projects SET deposit = $1 WHERE id = $2",
          [fullDeposit, project.id]
        );
        updatedCount++;
      } else {
        // No project cost, skip
        skippedCount++;
      }
    }
    
    console.log("\n=== Summary ===");
    console.log(`Projects with custom deposits updated: ${customUpdatedCount}`);
    console.log(`Projects set to full deposit: ${updatedCount}`);
    console.log(`Projects skipped (no project cost): ${skippedCount}`);
    console.log(`Total projects processed: ${projects.length}`);
    
  } catch (error) {
    console.error("Error updating deposits:", error);
    throw error;
  } finally {
    await pool.end();
    console.log("\nDatabase connection closed.");
  }
}

// Run the migration
updateDeposits()
  .then(() => {
    console.log("\n✓ Deposit update completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✗ Deposit update failed:", error);
    process.exit(1);
  });
