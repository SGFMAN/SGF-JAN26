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

const projectsList = `ABERFELDIE - 36 Beaver Street
ALBANVALE - 7 Tamara Street (SSD)
ALPHINGTON - 33 Bennett Street
BAYSWATER NORTH - 2 Jennings Road
BAYSWATER NORTH - 39 Grant Drive
BELLFIELD - 35A Wilkinson Crescent (DWELLING)
BENTLEIGH EAST - 55 Gowrie Street - DPU CONCEPT
BERWICK - 23 inglis
BERWICK - 36 Hillgrove Crescent (DPU)
BLACK HILL - 615 Peel Street
BLACKBURN - 6 Alandale Road (SSD)
BLACKBURN SOUTH-18 Agnew St
BORONIA - 14 Queenstown Road (SSD)
BORONIA - 71 Stewart Street (SSD)
BORONIA - 76 Stewart Street
BORONIA - U1 2 Normleith Grove (HOME OFFICE)
BULLEEN - 11 Vista Street
BUNDOORA - 6 Mersey Street (SSD)
CAPEL SOUND - 1739 Point Nepean Road (HOME OFFICE)
CARRUM - 16 Dyson Road (SSD)
CASTLEMAINE - 4A Butterworth Street (DWELLING)
CASTLEMAINE - 7 Pleasant Street (SSD)
CHIRNSIDE PARK - 6 Southern Cross (
CLAYTON - 34 Jaguar Drive
CLIFTON SPRINGS - 8 Labulla Court (SSD)
COOLAROO - 9 Yelta Court (SSD)
CRAIGIEBURN - 20 Whitley Crescent (DPU)
CRANBOURNE - 39 Arleon Crescent (SSD)
CRANBOURNE WEST - 5 Alberton Drive
CRIB POINT - 15 Mentiplay Street
CROYDON - 53 Bayswater Road (HOME OFFICE)
CROYDON - 9 Pytchley Road
CROYDON NORTH - 2 46 Humber Road (HOME OFFICE)
CROYDON NORTH - 21 Oaktree Road
CROYDON NORTH - 3 Rustic Rise
DANDENONG NORTH - 153 Outlook Drive (SSD)
DARLEY - 8 Correa Court (DPU)
DOREEN - 4 Carribie Road
EDITHVALE - 12 Randall Avenue
ELTHAM - 145 Brougham Street (DWELLING)
EMERALD - 14 Station Ave (DPU)
EPPING - 18 Bluebell Drive
EPPING - 18 Campbell Street
FAIRFIELD - 1 Hall Street
FAWKNER - 1-1 Preston Street (HOME OFFICE)
FAWKNER - 4 Kiddle Street (DPU)
FERNTREE GULLY - 10 Warrabel Road (SSD)
FERNTREE GULLY - 7 The Knoll (SSD)
FOREST HILL - 3 Cumberland Court (SSD)
FRANKSTON - 2 Blackheath Avenue
FRANKSTON - 3 Baillie Court
FRANKSTON NORTH - 15 Poplar Street (SSD)
FRANKSTON SOUTH - 21 Stradbroke Avenue
FRANKSTON SOUTH - 6 Idon Avenue (DPU)
GLENROY - 197 Daley Street
GRANTVILLE - 1388 Bass Highway (DPU)
HAMPTON PARK - 1 Bradley Court
HAMPTON PARK - 16 Mary Street
HAWTHORN - 17 Connell Street (SSD)
HAWTHORN - 21 Selbourne Street (DPU)
HOPETOUN PARK - 14 Riverview Drive (DPU)
HOPPERS CROSSING - 8 Carling Court
HUGHESDALE - 2-14 Arthur Street (DPU)
HUNTINGDALE - 1 Franklyn Street (DETACHED EXTENSION)
HUON CREEK - 23 Arwon Road (DPU)
INDIGO VALLEY - 709 Indigo Creek Road (DPU)
IVANHOE - 51 Foster Street (SSD)
JACANA - 145 Sunset Boulevard
KEILOR DOWNS - 38 Wimmera Crescent
KEYSBOROUGH - 363 Corrigan Road
KILSYTH - 2 Kerrilea Court (HOME OFFICE)
KILSYTH - 20 Lobosco Court (DPU)
KURUNJANG - 1915 Gisborne-Melton Road (HOME OFFICE)
KYNETON - 95 Sebastopol Road (DPU)
LALOR - 9 Valerie Street
LANGWARRIN - 6 Mathew Court
LARA - 9 St Anthony Court
LILYDALE - 4 Munro Avenue (SSD)
LILYDALE - 5 Valencia Road
LILYDALE - 98 Alexandra Road (HOME OFFICE)
LOCKWOOD SOUTH - 29 Corrard Court
LONGWARRY - 40 Corduroy Road (DPU)
LONGWARRY NORTH - 111 Morrison Road (DPU)
LORNE - 10 Smith Street
LYSTERFIELD - 35 Bellfield Drive (SSD)
MERRICKS NORTH - 85 Merricks Road (DPU)
MICKLEHAM - 36 Realm Vista
MITCHAM - 13-15 Edgerton Road
MITCHAM - 17 Walwa Street
MITCHAM - 9 Blossom Street (HOME OFFICE)
MITCHAM - 9 Lake Avenue
MONBULK - 10 Harvest Close (DPU)
MONTROSE - 83 Moore Avenue
MOOROOLBARK - 16 Oakbank Court (SSD)
MOOROOLBARK - 6 Caldera Court (DPU)
MOOROOLBARK - 61 Partridge Way (SSD)
MOOROOLBARK - 9 Daymar Drive
MOOROOLBARK - 94 Hayrick Lane (HOME OFFICE)
MORNINGTON - 23 Coimadai Court (Home Office)
MOUNT ELIZA - 7 Coles Court (TEST)
MOUNT ELIZA - 97 Baden Powell Drive (SSD)
MOUNT EVELYN - 12 The Wridgeway (SSD)
MULGRAVE - 69 Highfield Avenue
MULGRAVE - 70 Portland Street (DPU)
NAR NAR GOON - 3 Richards Road
NARRE WARREN - 2 Christina Street
NARRE WARREN SOUTH - 14-16 Laramie Road (DPU)
NOBLE PARK - 18 Wallarano Drive (SSD)
NOBLE PARK - 228 Corrigan Road (DPU)
NORLANE - 60 Wendover Avenue (SSD)
NORLANE - 600 Thompson Road (SSD)
NOTTING HILL - 16 Saniky Street
NOTTING HILL - 18 Saniky Street
NOTTING HILL - 27 Longbourne Avenue (SSD)
NUNAWADING - 23 High Street (HOME OFFICE)
NUNAWADING - 37 Springvale Rd (SSD)
OAKLEIGH - 40 Davey Avenue
OAKLEIGH SOUTH - 15 Stradbroke Street
OAKLEIGH SOUTH - 18 Luntar Road (SSD)
POINT COOK - 14 Dunkirk Drive
RINGWOOD EAST - 5 Holland Road
RINGWOOD EAST - 92 Dublin Road
ROMSEY - 16 Francis Close (DPU)
ROMSEY - 51 Ewing Drive (DPU)
SCORESBY - 8 Seville Grove
SEBASTOPOL - 4 Weeah Court
SEVILLE - 35 Gardiner Road (DPU)
SPRINGVALE - 33 Wilberton Drive (SSD)
SPRINGVALE - 6 Belmont Court (SSD)
SPRINGVALE - 75 Lewis Street
SPRINGVALE SOUTH - 11 Dianne Court
SPRINGVALE SOUTH - 21 Cotswold Crescent
ST ALBANS - 18 Highcombe Cr (CANCELLED)
ST ALBANS - 94 East Esplanade (SSD)
SUNBURY - 4 Possum Tail Run (DPU)
SYDENHAM - 1-7 Buckingham Street (DPU)
THE BASIN - 23 Stuart Street (DPU)
TOOTGAROOK - 20 Yolland Street
TRUGANINA - 25 Doubell Boulevard (DPU)
UPPER FERNTREE GULLY - 9 Willow Road
VERMONT - 12 Mawson Court (DPU)
VERMONT - 14 Uralla Street (DPU)
VERMONT - 5 Myuna Court
VERMONT - 95 Boronia Road
VIOLET TOWN - 46 Cowslip Street (DPU)
WANTIRNA - 4 Erin Place
WANTIRNA SOUTH - 15 Witken Avenue (HOME OFFICE)
WANTIRNA SOUTH - 22 Fraser Crescent (DPU)
WANTIRNA SOUTH - 3 Ceduna Close (SSD)
WANTIRNA SOUTH - 5 Charles Court
WARBURTON - 60 Old Warburton Rd - CONCEPT
WARRAGUL - 12 Treforest Court (DPU)
WERRIBEE - 3 Rubicon Place
WERRIBEE - 9 Olivetree Close
WHITTLESEA - 8 Kennedia Street (DPU)
WILLIAMSTOWN - 53 Rifle Range Drive
WODONGA - 32 Nicole Crescent
WOORI YALLOCK - 1019 Healesville-koo Wee Rup Road
WYNDHAM VALE - 10 Eliza Grove (SSD)
YARRAMBAT - 112 Eisemans Road (DPU)
YARRAVILLE - 5a Hawkhurst Street (HOME OFFICE)
YINNAR SOUTH - 55 Considine Drive`;

function parseProject(line) {
  // Remove " - CANCELLED" if present
  line = line.replace(/\s*-\s*CANCELLED$/, "");
  
  // Skip lines that are just headers or empty
  if (!line.trim() || line.includes("Folder Structure") || line.includes("Additional Housing Solutions")) {
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
  
  // Remove anything in brackets at the end (but handle incomplete brackets)
  street = street.replace(/\s*\([^)]*\)?\s*$/, "");
  // Also remove trailing incomplete brackets like "("
  street = street.replace(/\s*\(\s*$/, "");
  
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
