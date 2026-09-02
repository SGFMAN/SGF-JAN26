/**
 * Import Planning Manager cells from C:\SGF\project data.xlsx into VIC 2025 projects.
 * Matches by suburb/street (fuzzy). Does not change name/street/suburb.
 *
 * Usage: node backend/scripts/import-vic-2025-project-data-xlsx.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const path = require("path");
const { Pool } = require("pg");
const XLSX = require("xlsx");

const { DRAFTSPERSON_UNASSIGNED } = require("../draftspersonConstants");
const INPUT = path.join("C:\\SGF", "project data.xlsx");
const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const COL_FIELD = {
  2: "planning_land_channel_zones_overlays_sent_at",
  3: "planning_land_channel_zones_overlays_received_at",
  4: "planning_land_data_title_covenants_sent_at",
  5: "planning_land_data_title_covenants_received_at",
  6: "planning_jf_ebyda_stormwater_requested_at",
  7: "planning_jf_ebyda_stormwater_received_at",
  8: "planning_jf_byda_sewer_main_requested_at",
  9: "planning_jf_byda_sewer_main_received_at",
  10: "planning_jf_internal_sewer_plan_requested_at",
  11: "planning_jf_internal_sewer_plan_received_at",
  12: "planning_jf_sewer_main_size_depth_offset_requested_at",
  13: "planning_jf_sewer_main_size_depth_offset_received_at",
  14: "planning_jf_legal_point_discharge_requested_at",
  15: "planning_jf_legal_point_discharge_received_at",
  16: "planning_jf_property_info_report_requested_at",
  17: "planning_jf_property_info_report_received_at",
  18: "year",
  19: "drawings_concept_approved_date",
  20: "drawings_working_approved_date",
  21: "planning_jca_land_survey_sent_at",
  22: "planning_jca_land_survey_received_at",
  23: "planning_soil_test_melbourne_sent_at",
  24: "planning_soil_test_melbourne_received_at",
  25: "planning_footing_certification_requested_at",
  26: "planning_footing_certification_received_at",
  27: "planning_site_visit_plans_updated_at",
  28: "planning_mgr_tp_requested",
  29: "planning_mgr_tp_received",
  30: "planning_mgr_tp_needed",
  31: "planning_land_flooding_regulation",
  32: "planning_land_flooding_fpa_requested_at",
  33: "planning_land_flooding_fpa_received_at",
  34: "planning_land_flooding_cc_requested_at",
  35: "planning_land_flooding_cc_received_at",
  36: "planning_bal_requested_at",
  37: "planning_bal_received_at",
  38: "planning_energy_report_requested_at",
  39: "planning_energy_report_received_at",
  40: "planning_energy_specs_added_to_plans_at",
  41: "planning_windows_requested_at",
  42: "planning_windows_received_at",
  43: "planning_sewer_septic_authority",
  44: "planning_sewer_septic_application_requested_at",
  45: "planning_sewer_septic_application_received_at",
  46: "planning_warranty_insurance_at",
  47: "planning_building_permit_requested_at",
  48: "planning_building_permit_received_at",
  49: "planning_asset_protection_sent_at",
  50: "planning_asset_protection_received_at",
};

const DATE_FIELDS = new Set([
  "year",
  "drawings_concept_approved_date",
  "drawings_working_approved_date",
  "planning_land_channel_zones_overlays_sent_at",
  "planning_land_channel_zones_overlays_received_at",
  "planning_land_data_title_covenants_sent_at",
  "planning_land_data_title_covenants_received_at",
  "planning_jf_ebyda_stormwater_requested_at",
  "planning_jf_ebyda_stormwater_received_at",
  "planning_jf_byda_sewer_main_requested_at",
  "planning_jf_byda_sewer_main_received_at",
  "planning_jf_internal_sewer_plan_requested_at",
  "planning_jf_internal_sewer_plan_received_at",
  "planning_jf_sewer_main_size_depth_offset_requested_at",
  "planning_jf_sewer_main_size_depth_offset_received_at",
  "planning_jf_legal_point_discharge_requested_at",
  "planning_jf_legal_point_discharge_received_at",
  "planning_jf_property_info_report_requested_at",
  "planning_jf_property_info_report_received_at",
  "planning_jca_land_survey_sent_at",
  "planning_jca_land_survey_received_at",
  "planning_soil_test_melbourne_sent_at",
  "planning_soil_test_melbourne_received_at",
  "planning_footing_certification_requested_at",
  "planning_footing_certification_received_at",
  "planning_site_visit_plans_updated_at",
  "planning_energy_report_requested_at",
  "planning_energy_report_received_at",
  "planning_energy_specs_added_to_plans_at",
  "planning_windows_requested_at",
  "planning_windows_received_at",
  "planning_sewer_septic_application_requested_at",
  "planning_sewer_septic_application_received_at",
  "planning_warranty_insurance_at",
  "planning_building_permit_requested_at",
  "planning_building_permit_received_at",
  "planning_asset_protection_sent_at",
  "planning_asset_protection_received_at",
  "planning_land_flooding_fpa_requested_at",
  "planning_land_flooding_fpa_received_at",
  "planning_land_flooding_cc_requested_at",
  "planning_land_flooding_cc_received_at",
  "planning_bal_requested_at",
  "planning_bal_received_at",
]);

const NOTE_OR_SELECT = new Set([
  "planning_mgr_tp_requested",
  "planning_mgr_tp_received",
  "planning_mgr_tp_needed",
  "planning_land_flooding_regulation",
  "planning_sewer_septic_authority",
]);

const FLOODING_CANON = {
  "n/a": "N/A",
  required: "Required",
  "reg 154": "REG 154",
  "reg 153": "REG 153",
  reg153: "REG 153",
  reg154: "REG 154",
};

const AUTHORITY_CANON = [
  "Barwon Water",
  "Central Highlands Water",
  "Coliban Water",
  "East Gippsland Water",
  "Gippsland Water",
  "Goulburn Valley Water",
  "Grampians Wimmera Mallee Water (GWMWater)",
  "Greater Western Water",
  "Lower Murray Water",
  "North East Water",
  "South East Water",
  "South Gippsland Water",
  "Wannon Water",
  "Westernport Water",
  "Yarra Valley Water",
];

function norm(s) {
  return String(s || "")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function expandPlace(s) {
  return norm(s)
    .replace(/\bNTH\b/g, "NORTH")
    .replace(/\bSTH\b/g, "SOUTH")
    .replace(/\bMT\b/g, "MOUNT");
}

function expandStreet(s) {
  return expandPlace(s)
    .replace(/\bCR\b/g, "CRESCENT")
    .replace(/\bCRES\b/g, "CRESCENT")
    .replace(/\bAVE\b/g, "AVENUE")
    .replace(/\bAV\b/g, "AVENUE")
    .replace(/\bST\b/g, "STREET")
    .replace(/\bRD\b/g, "ROAD")
    .replace(/\bDR\b/g, "DRIVE")
    .replace(/\bCT\b/g, "COURT")
    .replace(/\bPL\b/g, "PLACE")
    .replace(/\bTCE\b/g, "TERRACE")
    .replace(/\bLN\b/g, "LANE")
    .replace(/\bCL\b/g, "CLOSE")
    .replace(/\bPDE\b/g, "PARADE")
    .replace(/\bHWY\b/g, "HIGHWAY")
    .replace(/\bBLVD\b/g, "BOULEVARD");
}

function streetCore(s) {
  return expandStreet(s)
    .replace(/,.*$/, "")
    .replace(/[^A-Z0-9]/g, "");
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function parseExcelAddress(label) {
  let s = String(label || "").trim();
  s = s.replace(/\s*\((ON HOLD|CANCELLED)\)\s*/gi, " ").trim();
  while (true) {
    const m = s.match(/\s*\(([^)]+)\)\s*$/);
    if (!m) break;
    s = s.slice(0, s.length - m[0].length).trim();
  }
  // "FRANKSTON NORTH 17 Mahogany Avenue" (missing dash)
  if (!s.includes(" - ")) {
    const m = s.match(/^([A-Z][A-Z\s]+?)\s+(\d.*)$/i);
    if (m) return { suburb: expandPlace(m[1]), street: expandStreet(m[2]), raw: label };
    return { suburb: expandPlace(s), street: "", raw: label };
  }
  const dash = s.indexOf(" - ");
  return {
    suburb: expandPlace(s.slice(0, dash)),
    street: expandStreet(s.slice(dash + 3)),
    raw: String(label || "").trim(),
  };
}

function iso(y, m, d) {
  if (!y || !m || !d) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDateToken(raw, defaultYear) {
  const s = String(raw || "").trim();
  if (!s) return { kind: "empty" };
  if (/^(n\/a|na)$/i.test(s)) return { kind: "text", value: "N/A" };

  let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    const v = iso(y, mo, d);
    return v ? { kind: "date", value: v } : { kind: "text", value: s };
  }

  m = s.match(/^(\d{1,2})[.\-]+([A-Za-z]{3})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = MONTHS[m[2].toUpperCase()];
    const v = iso(defaultYear, mo, d);
    return v ? { kind: "date", value: v, month: mo } : { kind: "text", value: s };
  }

  m = s.match(/^([A-Za-z]{3})[.\-]+(\d{1,2})$/);
  if (m && MONTHS[m[1].toUpperCase()] && parseInt(m[2], 10) <= 31) {
    const mo = MONTHS[m[1].toUpperCase()];
    const d = parseInt(m[2], 10);
    const v = iso(defaultYear, mo, d);
    return v ? { kind: "date", value: v, month: mo } : { kind: "text", value: s };
  }

  m = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const v = iso(defaultYear, mo, d);
      return v ? { kind: "date", value: v, month: mo } : { kind: "text", value: s };
    }
  }

  return { kind: "text", value: s };
}

function canonFlooding(s) {
  const k = String(s || "").trim();
  if (!k) return null;
  return FLOODING_CANON[k.toLowerCase()] || k;
}

function canonAuthority(s) {
  const k = String(s || "").trim();
  if (!k) return null;
  const compact = k.toUpperCase().replace(/[^A-Z]/g, "");
  if (compact === "GWMW" || compact === "GWMWWATER" || compact.startsWith("GWMW")) {
    if (/septic/i.test(k)) return k;
    return "Grampians Wimmera Mallee Water (GWMWater)";
  }
  if (/septic/i.test(k) && !/^[A-Za-z ]+$/.test(k)) return k;
  for (const opt of AUTHORITY_CANON) {
    const oc = opt.toUpperCase().replace(/[^A-Z]/g, "");
    const kc = k.toUpperCase().replace(/[^A-Z]/g, "");
    if (oc === kc) return opt;
    if (kc === oc.replace("WATER", "") + "WATER") return opt;
    if (kc === "CENTRALHIGHLANDS" && oc.startsWith("CENTRALHIGHLANDS")) return opt;
  }
  return k;
}

function scoreMatch(excel, project) {
  const pSub = expandPlace(project.suburb);
  const pStreet = expandStreet(project.street);
  const eSub = excel.suburb;
  const eStreet = excel.street;
  if (!eSub || !pSub || eSub !== pSub) {
    // suburb must match (after NTH/NORTH etc)
    return 0;
  }
  if (eStreet && pStreet && eStreet === pStreet) return 100;
  const eCore = streetCore(eStreet);
  const pCore = streetCore(pStreet);
  if (eCore && pCore && eCore === pCore) return 95;
  if (eCore && pCore && (pCore.startsWith(eCore) || eCore.startsWith(pCore))) return 90;
  if (eCore && pCore) {
    const dist = levenshtein(eCore, pCore);
    if (dist <= 2 && Math.min(eCore.length, pCore.length) >= 8) return 80 - dist;
    if (dist <= 1 && Math.min(eCore.length, pCore.length) >= 5) return 75;
  }
  return 0;
}

function pickBest(excel, projects, used) {
  let best = null;
  let bestScore = 0;
  const ties = [];
  for (const p of projects) {
    if (used.has(p.id)) continue;
    const sc = scoreMatch(excel, p);
    if (sc > bestScore) {
      bestScore = sc;
      best = p;
      ties.length = 0;
      ties.push(p);
    } else if (sc === bestScore && sc > 0) {
      ties.push(p);
    }
  }
  if (!best || bestScore < 70) return { project: null, score: bestScore, ties: [] };
  if (ties.length > 1) return { project: null, score: bestScore, ties };
  return { project: best, score: bestScore, ties: [] };
}

function valuesForRow(cells) {
  const job = parseDateToken(cells[18], 2025);
  let defaultYear = 2025;
  if (job.kind === "date") defaultYear = parseInt(job.value.slice(0, 4), 10) || 2025;

  const out = {};
  let lastMonth = job.kind === "date" ? parseInt(job.value.slice(5, 7), 10) : 1;

  const draft = String(cells[1] || "").trim();
  out.draftsperson = draft || DRAFTSPERSON_UNASSIGNED;

  for (const [colStr, field] of Object.entries(COL_FIELD)) {
    const col = Number(colStr);
    const raw = String(cells[col] ?? "").trim();
    if (!raw) {
      out[field] = null;
      continue;
    }

    if (field === "planning_land_flooding_regulation") {
      out[field] = canonFlooding(raw);
      continue;
    }
    if (field === "planning_sewer_septic_authority") {
      out[field] = canonAuthority(raw);
      continue;
    }
    if (NOTE_OR_SELECT.has(field)) {
      const parsed = parseDateToken(raw, defaultYear);
      if (parsed.kind === "date") {
        if (parsed.month && parsed.month < lastMonth - 8) {
          const next = parseDateToken(raw, defaultYear + 1);
          out[field] = next.kind === "date" ? next.value : parsed.value;
          if (next.kind === "date") lastMonth = next.month || lastMonth;
        } else {
          out[field] = parsed.value;
          if (parsed.month) lastMonth = parsed.month;
        }
      } else {
        out[field] = parsed.value;
      }
      continue;
    }

    if (DATE_FIELDS.has(field)) {
      const parsed = parseDateToken(raw, defaultYear);
      if (parsed.kind === "date") {
        let val = parsed.value;
        if (parsed.month && parsed.month < lastMonth - 8) {
          const next = parseDateToken(raw, defaultYear + 1);
          if (next.kind === "date") {
            val = next.value;
            lastMonth = next.month || lastMonth;
          }
        } else if (parsed.month) {
          lastMonth = parsed.month;
        }
        out[field] = val;
      } else {
        out[field] = parsed.value;
      }
      continue;
    }

    out[field] = raw;
  }
  return out;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const wb = XLSX.readFile(INPUT, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: "",
    raw: false,
  });
  const excelRows = [];
  for (let i = 2; i < rows.length; i++) {
    const addr = String(rows[i][0] || "").trim();
    if (!addr) continue;
    excelRows.push({ row: i + 1, cells: rows[i], ...parseExcelAddress(addr) });
  }

  const all = await pool.query(`
    SELECT id, name, suburb, street, state, year, status, classification
    FROM projects
    WHERE UPPER(TRIM(COALESCE(state, ''))) IN ('VIC', 'VICTORIA')
    ORDER BY id
  `);
  const vic2025 = all.rows.filter((p) => String(p.year || "").trim().startsWith("2025"));

  const used = new Set();
  const matched = [];
  const unmatchedExcel = [];
  const ambiguous = [];

  for (const ex of excelRows) {
    const pick = pickBest(ex, vic2025, used);
    if (pick.ties.length > 1) {
      ambiguous.push({ excel: ex, ties: pick.ties, score: pick.score });
      continue;
    }
    if (!pick.project) {
      unmatchedExcel.push({ excel: ex, score: pick.score });
      continue;
    }
    used.add(pick.project.id);
    matched.push({ excel: ex, project: pick.project, score: pick.score });
  }

  console.log(`Excel rows: ${excelRows.length}`);
  console.log(`VIC 2025 projects: ${vic2025.length}`);
  console.log(`Matched: ${matched.length}`);
  console.log(`Excel unmatched: ${unmatchedExcel.length}`);
  console.log(`Ambiguous: ${ambiguous.length}`);
  console.log(`DB not in Excel: ${vic2025.length - used.size}`);

  if (ambiguous.length) {
    console.log("\nAMBIGUOUS (not imported):");
    for (const a of ambiguous) {
      console.log(`  R${a.excel.row} ${a.excel.raw}`);
      for (const t of a.ties) console.log(`    -> ${t.id} ${t.suburb} | ${t.street}`);
    }
  }
  if (unmatchedExcel.length) {
    console.log("\nEXCEL UNMATCHED (not imported):");
    for (const u of unmatchedExcel) {
      console.log(`  R${u.excel.row} ${u.excel.raw} (best score ${u.score})`);
    }
  }

  if (ambiguous.length || unmatchedExcel.length) {
    await pool.end();
    console.log("\nStopped before writing so these matches can be checked.");
    process.exit(2);
  }

  const fields = ["draftsperson", ...Object.values(COL_FIELD)];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const m of matched) {
      const vals = valuesForRow(m.excel.cells);
      const sets = [];
      const params = [];
      for (const field of fields) {
        params.push(vals[field] == null || vals[field] === "" ? null : String(vals[field]));
        sets.push(`${field} = $${params.length}`);
      }
      params.push(m.project.id);
      await client.query(
        `UPDATE projects SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`,
        params
      );
      console.log(
        `OK R${m.excel.row} → id ${m.project.id} (${m.project.suburb} | ${m.project.street}) score ${m.score}`
      );
    }
    await client.query("COMMIT");
    console.log(`\nUpdated ${matched.length} VIC 2025 project(s). Names/addresses unchanged.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
