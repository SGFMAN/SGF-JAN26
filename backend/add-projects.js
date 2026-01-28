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

const projectsList = `ALTONA MEADOWS - 51 Donald Street (SSD)
AVONDALE HEIGHTS - 10 Deutscher Street (SSD)
BAYSWATER - 13 Larne Avenue (SSD)
BAYSWATER - 55 Sasses Avenue (SSD)
BAYSWATER - 69 Bona Vista Road (SSD)
BAYSWATER - 874 Mountain Hwy (Factory)
BAYSWATER - 919 Mountain Highway (SSD)
BEAUMARIS - 2 Wallace Crescent (SSD)
BELGRAVE SOUTH - 68 Lockwood Road (SSD)
BIRCHIP - 2 Sherwood Street (SSD)
BIRREGURRA - 47 Strachan Street (SSD)
BORONIA - 20 Robertson Crescent (SSD)
BORONIA - 24 Olive Grove (SSD)
BORONIA - 3 Biscay Court (HOME OFFICE)
BORONIA - 3 Cardiff Street (SSD)
BORONIA - 392 Boronia Road (SSD)
BORONIA - 394 Boronia Road (SSD)
BORONIA - 4 Shalimar Crescent (SSD)
BORONIA - 8 Eugenia Court (SSD)
BOX HILL - 11 Bedford Street (DPU)
BOX HILL - 3 Kintore Crescent (SSD)
BREAKWATER - 2-22 Fellmongers Road (DWELLING)
BRIGHTON - 84 Bay Street (DPU)
BROOKFIELD - 26 Rita Cres (Dual Occ)
BUNDOORA - 35 Chaucer Crescent (SSD)
BUNYIP - 20 Strafford Lane (DPU)
BURWOOD - 41 Arthur St (DPU)
CAMPBELLFIELD - 14 Roebourne Crescent (SSD)
CASTLEMAINE - 11 Maltby Drive (SSD)
CASTLEMAINE - 4C Butterworth Street (DWELLING)
CORIO - 13 Macedon Avenue (SSD)
CRAIGIEBURN - 3 Crestmont Terrace (DPU)
CRAIGIEBURN - 8 Chelmsford Court (SSD)
CRESWICK - 15 Lalor Lane (DPU)
CRIB POINT - 107 Disney Street (SSD)
CROYDON - 2-6 Bennison Street (DPU)
DALLAS - 7 Apollo Crescent (SSD)
DANDENONG NORTH - 7 Gardiner Avenue (SSD)
DON VALLEY - 1905 Don Road (SSD)
DONCASTER - 20 Margot Avenue (HOME OFFICE)
DONCASTER EAST - 27 Montreal Drive (DPU)
DONVALE - 63-65 Heads Road (DPU)
DRYSDALE - 15-19 Station Street (SSD)
FERNTREE GULLY - 1-412 Scoresby Road (SSD)
FERNTREE GULLY - 20 Greenaway Drive (SSD)
FERNTREE GULLY - 27 James Road (SSD)
FERNTREE GULLY - 74 Taldra Drive (SSD)
FERNTREE GULLY - 9 Hancock Drive (SSD) - CANCELLED
FOREST HILL - 55 Bennett Street (SSD)
FRANKSTON - 51 Laurina Crescent (SSD)
FRANKSTON - 9 Leawarra Parade (SSD)
FRANKSTON NORTH - 17 Mahogany Avenue (SSD)
FRANKSTON NORTH - 2-37 Longleaf Street (DWELLING)
FYANS CREEK - 192 Mokepilly Road (DPU & SSD)
HAMPTON EAST - 27 Widdop Cr (SSD)
HAMPTON PARK - 5 Cirrus Close (DPU)
HARKNESS - 34 Brooksby Circuit (DWELLING - SSD)
HEATHMONT - 48 Viviani Crescent (HOME OFFICE)
HEIDELBERG HEIGHTS - 5-22 Porter Road (HOME OFFICE)
HOPPERS CROSSING - 12 Kathleen Crescent (SSD)
HOPPERS CROSSING - 17 Hunter Avenue (SSD)
HOPPERS CROSSING - 2 Gabo Street (SSD)
HOPPERS CROSSING - 8 Paruna Place (SSD)
HORSHAM - 18 Philip Street (DWELLING & SSD)
KANGAROO FLAT - 17 Bronze Drive (DPU)
KEILOR PARK - 54 Spence St
KENNINGTON - 93 Condon Street (SSD)
KEYSBOROUGH - 11 Chris Court (DPU)
KEYSBOROUGH - 4 Trina Court (SSD)
KEYSBOROUGH - 9 Beverley Place (SSD)
KILMORE EAST - 5 Louis Rise (DPU)
KILSYTH - 10 Atherton Court (HOME OFFICE)
KILSYTH - 175 Sheffield Road (DPU)
KILSYTH - 82 Cambridge Road (DPU)
KNOXFIELD - 3 The Ridge (SSD)
KNOXFIELD - 60 O'Connor Road (DPU)
LANGWARRIN - 15 Leisureland Drive (DETACHED EXTENSION)
LANGWARRIN SOUTH - 40 West Road (DPU)
LARA - 100 McClelland Avenue (SSD)
LAVERTON - 5 Campbell Street (SSD)
LEONGATHA - 27 Ritchie Street (SSD)
LILYDALE - 11 Berry Court (SSD)
LONGFORD - 43 Peppertree Hill Road (DPU)
LYNBROOK - 8 Caversham Terrace (DPU)
LYSTERFIELD SOUTH - 7 Parkview Terrace (SSD)
MITCHAM - 429 Whitehorse Road (DPU)
MOOROOLBARK - 18 Kipling Avenue (SSD)
MORNINGTON - 56 Van Mess Avenue (SSD)
MORNINGTON - 56 Van Ness Avenue (SSD)
MORWELL - 28 Gillie Crescent (SSD)
MOUNT WAVERLEY - 20 Andrew Street (Office)
NARRE WARREN - 11 Warrington Close (SSD)
NARRE WARREN - 2 Darling Way (SSD)
NARRE WARREN NORTH - 35 Avenview Drive (DPU)
NARRE WARREN SOUTH - 261 Ormond Road (HOME OFFICE)
NEWINGTON - 28 Inkerman Street (SSD)
NOBLE PARK - 6 Taranto Drive (DPU)
NORLANE - 27 Tennyson Street, Norlane (SSD)
NOTTING HILL - 14 Westerfield Drive (DPU)
NUNAWADING - 16 Cyprus Avenue (SSD)
PARKDALE - 28 Davey Street (HOME OFFICE)
RIDDELLS CREEK - 20 Whittakers Lane (DPU)
RINGWOOD - 24 Kendall Street (SSD)
RINGWOOD EAST - 7 Rotherwood Avenue (SSD)
RINGWOOD NORTH - 38 Park Hill Drive (DPU)
ROSANNA - 9 Alfreda Avenue (HOME OFFICE)
ROWVILLE - 195 Dandelion Drive (DPU)
ROWVILLE - 5 Mantung Crescent (DPU)
ROXBURGH PARK - 21 Wilkinson Court (SSD)
SCOTSBURN - 68 Wiggins Road (DPU)
SEAFORD - 19 Hunt Drive (SSD)
SEAFORD - 65 Hadley Street (SSD)
SOLDIERS HILL - 506 Gregory Street (SSD)
SPRINGVALE - 797 Heatherton Road (SSD)
SPRINGVALE SOUTH - 31 Glenwood Drive (DPU)
SPRINGVALE SOUTH - 6 Camelot Drive (SSD)
SPRINGVALE SOUTH - 6 Lansor Street (SSD)
SUNBURY - 1 Gurners Lane (DPU)
SUNBURY - 25 Higgs Circuit (DPU)
SUNBURY - 48 Emu Road (DPU & SSD)
SUNSHINE - 7 Lowe Crescent (SSD)
SYDENHAM - 6 Innkeeper Place (DPU)
TEESDALE - 25 Squires Road (SSD)
TEMPLESTOWE - 13 Anthlin Court (DPU)
THE BASIN - 45 Old Forest Road (SSD)
THORNBURY - 52 Clarendon Street (SSD)
TRAFALGAR EAST - 19 Waratah Way (SSD)
TULLAMARINE - 4 Columbia Close (SSD)
VERMONT - 20 Trinian Street (SSD)
VERMONT SOUTH - 2 Woodleigh Crescent (SSD)
WARRAGUL - 3 Nursery Rise (DPU)
WERRIBEE - 6 Parrakeet Road (SSD)
WOORI YALLOCK - 1606 Warburton Highway (SSD)
WYNDHAM VALE - 15 Provan Drive (SSD)
WYNDHAM VALE - 196 McGrath Road (SSD)
WYNDHAM VALE - 6 Brimpton Grove (SSD)
YANNATHAN - 250 Hall Road (SSD)
YARRAMBAT - 261-279 Ironbark Road (DPU)`;

function parseProject(line) {
  // Remove " - CANCELLED" if present
  line = line.replace(/\s*-\s*CANCELLED$/, "");
  
  // Find the first " - " that separates suburb from street
  // (not the ones inside brackets)
  const match = line.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) {
    console.warn(`Skipping invalid line: ${line}`);
    return null;
  }
  
  const suburb = match[1].trim();
  let street = match[2].trim();
  
  // Remove anything in brackets at the end
  street = street.replace(/\s*\([^)]*\)\s*$/, "");
  
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
