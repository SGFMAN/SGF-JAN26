/**
 * Reads projects from PostgreSQL and writes Project_List_Populated.xlsx
 * with Address (supplied), Client Name, Deposit Amount, Contract Amount, Project Date.
 *
 * Requires DATABASE_URL (see backend .env). Optional: PGSSL=true for cloud DBs.
 */
require("dotenv").config();
const path = require("path");
const { Pool } = require("pg");
const XLSX = require("xlsx");

const OUTPUT = path.join(__dirname, "..", "Project_List_Populated.xlsx");

const ADDRESSES = `30 Macedon St HOPPERS CROSSING VIC 3029 Australia
250 Hall Rd YANNATHAN VIC 3981 Australia
12 Mullock Rd DIGGERS REST VIC 3427 Australia
242 Ormond Rd NARRE WARREN SOUTH VIC 3805 Australia
5 Campbell St LAVERTON VIC 3028 Australia
82 Cambridge Rd KILSYTH VIC 3137 Australia
34 Brooksby Cct HARKNESS VIC 3337 Australia
69 Bona Vista Rd BAYSWATER VIC 3153 Australia
2 Wallace Cres BEAUMARIS VIC 3193 Australia
8 Eugenia Ct BORONIA VIC 3155 Australia
4 Trina Ct KEYSBOROUGH VIC 3173 Australia
14 Roebourne Cres CAMPBELLFIELD VIC 3061 Australia
506 Gregory St SOLDIERS HILL VIC 3350 Australia
25 Highland Cres MOOROOLBARK VIC 3138 Australia
13 Larne Ave BAYSWATER VIC 3153 Australia
5 LOUIS RISE KILMORE EAST VIC 3764 Australia
11 Chris Ct KEYSBOROUGH VIC 3173 Australia
4 Shalimar Cres BORONIA VIC 3155 Australia
19 Hunt Dr SEAFORD VIC 3198 Australia
65 Hadley St SEAFORD VIC 3198 Australia
51 Laurina Cres FRANKSTON NORTH VIC 3200 Australia
6 Innkeeper Pl SYDENHAM VIC 3037 Australia
24 Olive Gr BORONIA VIC 3155 Australia
15 Poplar St FRANKSTON NORTH VIC 3200 Australia
15 Leisureland Dr LANGWARRIN VIC 3910 Australia
11 Warrington Cl NARRE WARREN VIC 3805 Australia
52 Clarendon St THORNBURY VIC 3071 Australia
16 Cyprus Ave NUNAWADING VIC 3131 Australia
27 Widdop Cres HAMPTON EAST VIC 3188 Australia
3 Cardiff St BORONIA VIC 3155 Australia
3 Kintore Cres BOX HILL VIC 3128 Australia
51 Donald St S ALTONA MEADOWS VIC 3028 Australia
8 Paruna Pl HOPPERS CROSSING VIC 3029 Australia
6 Camelot Dr SPRINGVALE SOUTH VIC 3172 Australia
55 Bennett St FOREST HILL VIC 3131 Australia
392 Boronia Rd BORONIA VIC 3155 Australia
17 Mahogany Ave FRANKSTON NORTH VIC 3200 Australia
11 Bedford St BOX HILL VIC 3128 Australia
14 Westerfield Dr NOTTING HILL VIC 3168 Australia
196 McGrath Rd WYNDHAM VALE VIC 3024 Australia
9 Leawarra Pde FRANKSTON VIC 3199 Australia
20 Trinian St VERMONT VIC 3133 Australia
83 Moore Ave MONTROSE VIC 3765 Australia
28 Inkerman St NEWINGTON VIC 3350 Australia
7 Lowe Cres SUNSHINE VIC 3020 Australia
35 Gardiner Rd SEVILLE VIC 3139 Australia
60 O'Connor Rd KNOXFIELD VIC 3180 Australia
6 Taranto Dr NOBLE PARK VIC 3174 Australia
6 Brimpton Gr WYNDHAM VALE VIC 3024 Australia
195 Dandelion Dr ROWVILLE VIC 3178 Australia
23 Stuart St THE BASIN VIC 3154 Australia
38 Park Hill Dr RINGWOOD NORTH VIC 3134 Australia
20 Robertson Cres BORONIA VIC 3155 Australia
175 Sheffield Rd KILSYTH VIC 3137 Australia
14 Station Ave EMERALD VIC 3782 Australia
394 Boronia Rd BORONIA VIC 3155 Australia
25 Squires Rd TEESDALE VIC 3328 Australia
41 Arthur St BURWOOD VIC 3125 Australia
6 Lansor St SPRINGVALE SOUTH VIC 3172 Australia
27 Tennyson St NORLANE VIC 3214 Australia
21 Wilkinson Ct ROXBURGH PARK VIC 3064 Australia
24 Kendall St RINGWOOD VIC 3134 Australia
919 Mountain Hwy BAYSWATER VIC 3153 Australia
7 Rotherwood Ave RINGWOOD EAST VIC 3135 Australia
3 NURSERY RISE WARRAGUL VIC 3820 Australia
U 2 22 Fellmongers Rd BREAKWATER VIC 3219 Australia
10 Deutscher St AVONDALE HEIGHTS VIC 3034 Australia
9 Beverley Pl KEYSBOROUGH VIC 3173 Australia
2 Sherwood St BIRCHIP VIC 3483 Australia
43 Peppertree Hill Rd LONGFORD VIC 3851 Australia
11 Berry Ct LILYDALE VIC 3140 Australia
14 Queenstown Rd BORONIA VIC 3155 Australia
4c Butterworth St CASTLEMAINE VIC 3450 Australia
97 Baden Powell Dr MOUNT ELIZA VIC 3930 Australia
31 Glenwood Dr SPRINGVALE SOUTH VIC 3172 Australia
107 Disney St CRIB POINT VIC 3919 Australia
4 Columbia Cl TULLAMARINE VIC 3043 Australia
56 Van Ness Ave MORNINGTON VIC 3931 Australia
93 Condon St KENNINGTON VIC 3550 Australia
18 Luntar Rd OAKLEIGH SOUTH VIC 3167 Australia
74 Taldra Dr FERNTREE GULLY VIC 3156 Australia`
  .trim()
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

function stripStatePostcodeCountry(line) {
  return line
    .replace(/\s+Australia\s*$/i, "")
    .replace(/\s+VIC\s+\d{4}\s*$/i, "")
    .trim();
}

/** Expand common Australian address abbreviations for matching. */
function expandRoadWords(s) {
  let t = ` ${s.toUpperCase()} `;
  const reps = [
    [/\bST\.\s+/g, "STREET "],
    [/\bST\s+S\b/g, "STREET SOUTH "],
    [/\bST\s+N\b/g, "STREET NORTH "],
    [/\bST\s+E\b/g, "STREET EAST "],
    [/\bST\s+W\b/g, "STREET WEST "],
    [/\bST\b/g, "STREET"],
    [/\bRD\b/g, "ROAD"],
    [/\bAVE\b/g, "AVENUE"],
    [/\bCRES\b/g, "CRESCENT"],
    [/\bCR\b/g, "CRESCENT"],
    [/\bCT\b/g, "COURT"],
    [/\bDR\b/g, "DRIVE"],
    [/\bGR\b/g, "GROVE"],
    [/\bCCT\b/g, "CIRCUIT"],
    [/\bPDE\b/g, "PARADE"],
    [/\bPL\b/g, "PLACE"],
    [/\bHWY\b/g, "HIGHWAY"],
    [/\bTCE\b/g, "TERRACE"],
    [/\bRISE\b/g, "RISE"],
    [/\bCL\b/g, "CLOSE"],
  ];
  for (const [re, rep] of reps) {
    t = t.replace(re, rep);
  }
  return t.replace(/\s+/g, " ").trim();
}

function normKey(s) {
  return expandRoadWords(s).replace(/[^A-Z0-9]/g, "");
}

function unitVariants(streetPart) {
  const u = streetPart.toUpperCase();
  const out = new Set();
  out.add(streetPart);
  const m = u.match(/^U\s*(\d+)\s+(\d+)\s+(.+)$/);
  if (m) {
    out.add(`U${m[1]}/${m[2]} ${m[3]}`);
    out.add(`${m[1]}-${m[2]} ${m[3]}`);
    out.add(`${m[2]} ${m[3]}`);
  }
  return [...out];
}

function findProject(addressLine, projects) {
  const withoutRegion = stripStatePostcodeCountry(addressLine);
  const userKeys = new Set();
  for (const variant of unitVariants(withoutRegion)) {
    userKeys.add(normKey(variant));
  }

  let best = null;
  let bestScore = 0;

  for (const p of projects) {
    const street = (p.street || "").trim();
    const suburb = (p.suburb || "").trim();
    if (!street || !suburb) continue;

    const fullKey = normKey(`${street} ${suburb}`);
    const streetKey = normKey(street);
    const suburbKey = normKey(suburb);
    const nameKey = p.name ? normKey(String(p.name).replace(/,/g, " ")) : "";

    for (const ukey of userKeys) {
      let score = 0;
      if (fullKey.length >= 8 && (ukey.includes(fullKey) || fullKey.includes(ukey))) {
        score = Math.max(fullKey.length, ukey.length);
      } else if (
        streetKey.length >= 4 &&
        suburbKey.length >= 6 &&
        ukey.includes(streetKey) &&
        ukey.includes(suburbKey)
      ) {
        score = Math.min(streetKey.length + suburbKey.length, fullKey.length) - 1;
      } else if (nameKey.length >= 10 && (ukey.includes(nameKey) || nameKey.includes(ukey))) {
        score = Math.max(nameKey.length, ukey.length) - 2;
      }
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }

  return best;
}

function formatProjectDate(yearVal) {
  if (yearVal == null || yearVal === "") return "";
  if (yearVal instanceof Date) return yearVal.toISOString().slice(0, 10);
  const s = String(yearVal).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Add it to backend/.env and run again.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  const r = await pool.query(
    `SELECT id, name, street, suburb, state, client_name, deposit, project_cost, year
     FROM projects
     WHERE street IS NOT NULL AND trim(street) <> ''
       AND suburb IS NOT NULL AND trim(suburb) <> ''`
  );

  const projects = r.rows;
  console.log(`Loaded ${projects.length} projects with street+suburb from database.`);

  const rows = [
    ["Address (supplied)", "Client Name", "Deposit Amount", "Contract Amount", "Project Date"],
  ];
  const unmatched = [];

  for (const addr of ADDRESSES) {
    const p = findProject(addr, projects);
    if (!p) {
      unmatched.push(addr);
      rows.push([addr, "", "", "", ""]);
      continue;
    }
    rows.push([
      addr,
      p.client_name || "",
      p.deposit != null ? String(p.deposit) : "",
      p.project_cost != null ? String(p.project_cost) : "",
      formatProjectDate(p.year),
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 55 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, "Projects");
  XLSX.writeFile(wb, OUTPUT);

  console.log(`Wrote ${ADDRESSES.length} rows to ${OUTPUT}`);
  if (unmatched.length) {
    console.warn(`\nNo database match for ${unmatched.length} address(es):`);
    unmatched.forEach((a) => console.warn(`  - ${a}`));
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
