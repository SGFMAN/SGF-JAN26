/**
 * Import Planning Manager cells from C:\SGF\project data.xlsx into VIC 2026 projects.
 *
 * For each matched project, each Planning Manager field is filled from the Excel
 * cell that belongs to that field. Excel-only columns are not written anywhere.
 *
 * Excel-only (skipped):
 *   col 28 LCL Locator Site Inspection-Sent
 *   col 29 LCL Locator Site Inspection-Received
 *
 * Town Planning in Excel is Needed / Received / Requested (cols 30–32),
 * not the app order Requested / Received / Needed. Mapped by cell content.
 *
 * Usage: node backend/scripts/import-vic-2026-project-data-xlsx.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const path = require("path");
const { Pool } = require("pg");
const XLSX = require("xlsx");

const { DRAFTSPERSON_UNASSIGNED } = require("../draftspersonConstants");
const INPUT = path.join("C:\\SGF", "project data.xlsx");
const TARGET_YEAR = 2026;
const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const APP_FIELDS = [
  { field: "draftsperson", excel: 1, label: "DRAFTSPERSON" },
  { field: "planning_land_channel_zones_overlays_sent_at", excel: 2, label: "Land Channel - Sent" },
  { field: "planning_land_channel_zones_overlays_received_at", excel: 3, label: "Land Channel - Received" },
  { field: "planning_land_data_title_covenants_sent_at", excel: 4, label: "Land Data - Sent" },
  { field: "planning_land_data_title_covenants_received_at", excel: 5, label: "Land Data - Received" },
  { field: "planning_jf_ebyda_stormwater_requested_at", excel: 6, label: "DBYD Stormwater - Sent" },
  { field: "planning_jf_ebyda_stormwater_received_at", excel: 7, label: "DBYD Stormwater - Received" },
  { field: "planning_jf_byda_sewer_main_requested_at", excel: 8, label: "DBYD Sewer - Sent" },
  { field: "planning_jf_byda_sewer_main_received_at", excel: 9, label: "DBYD Sewer - Received" },
  { field: "planning_jf_internal_sewer_plan_requested_at", excel: 10, label: "Sewer Plan - Sent" },
  { field: "planning_jf_internal_sewer_plan_received_at", excel: 11, label: "Sewer Plan - Received" },
  { field: "planning_jf_sewer_main_size_depth_offset_requested_at", excel: 12, label: "Sewer Size/Depth/Offset - Sent" },
  { field: "planning_jf_sewer_main_size_depth_offset_received_at", excel: 13, label: "Sewer Size/Depth/Offset - Received" },
  { field: "planning_jf_legal_point_discharge_requested_at", excel: 14, label: "LPOD - Sent" },
  { field: "planning_jf_legal_point_discharge_received_at", excel: 15, label: "LPOD - Received" },
  { field: "planning_jf_property_info_report_requested_at", excel: 16, label: "Property Info - Sent" },
  { field: "planning_jf_property_info_report_received_at", excel: 17, label: "Property Info - Received" },
  { field: "year", excel: 18, label: "Job File Created" },
  { field: "drawings_concept_approved_date", excel: 19, label: "Concept" },
  { field: "drawings_working_approved_date", excel: 20, label: "Working Drawings" },
  { field: "planning_jca_land_survey_sent_at", excel: 21, label: "JCA Land Survey - Sent" },
  { field: "planning_jca_land_survey_received_at", excel: 22, label: "JCA Land Survey - Received" },
  { field: "planning_soil_test_melbourne_sent_at", excel: 23, label: "Soil Test Melbourne - Sent" },
  { field: "planning_soil_test_melbourne_received_at", excel: 24, label: "Soil Test Melbourne - Received" },
  { field: "planning_footing_certification_requested_at", excel: 25, label: "Footing Certification - Sent" },
  { field: "planning_footing_certification_received_at", excel: 26, label: "Footing Certification - Received" },
  { field: "planning_site_visit_plans_updated_at", excel: 27, label: "Site Visit - Plans Updated" },
  // Excel 28–29 = LCL Locator Site Inspection Sent/Received — not in the app.
  // Excel 30–32 are Town Planning but not in app order: Needed, Received, Requested.
  { field: "planning_mgr_tp_needed", excel: 30, label: "Town Planning Needed" },
  { field: "planning_mgr_tp_received", excel: 31, label: "Town Planning - Received" },
  { field: "planning_mgr_tp_requested", excel: 32, label: "Town Planning - Requested" },
  { field: "planning_land_flooding_regulation", excel: 33, label: "Flooding" },
  { field: "planning_land_flooding_fpa_requested_at", excel: 34, label: "Melb Water 153/154 - Sent" },
  { field: "planning_land_flooding_fpa_received_at", excel: 35, label: "Melb Water 153/154 - Received" },
  { field: "planning_land_flooding_cc_requested_at", excel: 36, label: "Council 153/154 - Sent" },
  { field: "planning_land_flooding_cc_received_at", excel: 37, label: "Council 153/154 - Received" },
  { field: "planning_bal_requested_at", excel: 38, label: "BAL Required - Requested" },
  { field: "planning_bal_received_at", excel: 39, label: "BAL Required - Received" },
  { field: "planning_energy_report_requested_at", excel: 40, label: "Energy Rating - Sent" },
  { field: "planning_energy_report_received_at", excel: 41, label: "Energy Rating - Received" },
  { field: "planning_energy_specs_added_to_plans_at", excel: 42, label: "Energy Specs Added to Plans" },
  { field: "planning_windows_requested_at", excel: 43, label: "Windows - Requested" },
  { field: "planning_windows_received_at", excel: 44, label: "Windows - Received" },
  { field: "planning_sewer_septic_authority", excel: 45, label: "Sewer/Septic - Authority" },
  { field: "planning_sewer_septic_application_requested_at", excel: 46, label: "Sewer/Septic - Requested" },
  { field: "planning_sewer_septic_application_received_at", excel: 47, label: "Sewer/Septic - Received" },
  { field: "planning_warranty_insurance_at", excel: 48, label: "Warranty Insurance" },
  { field: "planning_building_permit_requested_at", excel: 49, label: "Building Permit - Requested" },
  { field: "planning_building_permit_received_at", excel: 50, label: "Building Permit - Received" },
  { field: "planning_asset_protection_sent_at", excel: 51, label: "Asset Protection - Sent" },
  { field: "planning_asset_protection_received_at", excel: 52, label: "Asset Protection - Received" },
];

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

function streetParts(s) {
  const expanded = expandStreet(s);
  const m = expanded.match(/^(\d+[A-Z]?)(?:\s*[-/]\s*(\d+[A-Z]?))?\s+(.*)$/);
  if (!m) return { nums: [], name: streetCore(expanded) };
  return {
    nums: [m[1], m[2]].filter(Boolean),
    name: streetCore(m[3]),
  };
}

function numbersOverlap(a, b) {
  if (!a.nums.length || !b.nums.length || !a.name || a.name !== b.name) return false;
  const expand = (p) => {
    const set = new Set();
    const n0 = parseInt(p.nums[0], 10);
    const n1 = p.nums[1] ? parseInt(p.nums[1], 10) : NaN;
    if (p.nums.length === 2 && Number.isFinite(n0) && Number.isFinite(n1) && Math.abs(n1 - n0) <= 20) {
      const lo = Math.min(n0, n1);
      const hi = Math.max(n0, n1);
      for (let i = lo; i <= hi; i++) set.add(String(i));
    } else {
      for (const n of p.nums) {
        const num = parseInt(n, 10);
        if (Number.isFinite(num)) set.add(String(num));
      }
    }
    return set;
  };
  const A = expand(a);
  const B = expand(b);
  for (const n of A) if (B.has(n)) return true;
  return false;
}

function hintClasses(hints) {
  const t = (hints || []).join(" ").toUpperCase();
  const out = [];
  if (/\bSSD\b|SMALL SECOND/.test(t)) out.push("ssd");
  if (/\bDPU\b|DEPENDANT/.test(t)) out.push("dpu");
  if (/\bRENO/.test(t)) out.push("reno");
  if (/\bDUAL\s*OCC/.test(t)) out.push("dual");
  if (/\bDWELLING\b/.test(t)) out.push("dwelling");
  return out;
}

function projectClass(p) {
  const c = String(p.classification || "").toLowerCase();
  if (c.includes("small second")) return "ssd";
  if (c.includes("dependant") || c.includes("dpu")) return "dpu";
  if (c.includes("renovation")) return "reno";
  if (c.includes("dual")) return "dual";
  if (c.includes("dwelling") || c.includes("home office")) return "dwelling";
  return "";
}

function resolveTies(excel, ties) {
  if (!ties || ties.length < 2) return null;
  const hints = hintClasses(excel.hints);
  const scored = ties.map((p) => {
    const pc = projectClass(p);
    let s = 0;
    if (hints.includes("ssd") && pc === "ssd") s += 10;
    if (hints.includes("dpu") && pc === "dpu") s += 10;
    if (hints.includes("dual") && pc === "dual") s += 10;
    if (hints.includes("dwelling") && pc === "dwelling") s += 8;
    if (hints.includes("reno") && pc === "reno") s += 5;
    if (hints.includes("ssd") && !pc) s -= 2;
    return { p, s };
  });
  scored.sort((a, b) => b.s - a.s);
  if (scored[0].s > 0 && scored[0].s > scored[1].s) return scored[0].p;
  return null;
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

function trimStreetTail(street) {
  const types =
    "STREET|ROAD|AVENUE|COURT|CLOSE|DRIVE|PLACE|PARADE|LANE|CRESCENT|BOULEVARD|HIGHWAY|TERRACE|WAY|GROVE|RISE|CIRCUIT|TRACK|TRAIL|WALK|SQUARE|MEWS|ROW|QUAY|ESPLANADE|FREEWAY";
  const expanded = expandStreet(street);
  const m = expanded.match(new RegExp(`^(.+\\b(?:${types}))\\b`));
  return m ? m[1].trim() : expanded;
}

function parseExcelAddress(label) {
  let s = String(label || "").trim();
  const hints = [];
  s = s
    .replace(/\s*\(([^)]+)\)/g, (_, inner) => {
      hints.push(String(inner || "").trim());
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/\s+\d+\s*K\s+DEPOSIT\b.*$/i, "").trim();
  s = s.replace(/\s*[-–]\s*CANCELLED\b.*$/i, "").trim();
  s = s.replace(/\s+CANCELLED\b.*$/i, "").trim();
  s = s.replace(/\s+ON HOLD\b.*$/i, "").trim();
  const dash = s.match(/^(.+?)\s*-\s*(.+)$/);
  if (dash) {
    return {
      suburb: expandPlace(dash[1]),
      street: trimStreetTail(dash[2]),
      raw: String(label || "").trim(),
      hints,
    };
  }
  const m = s.match(/^([A-Z][A-Z\s]+?)\s+(\d.*)$/i);
  if (m) return { suburb: expandPlace(m[1]), street: trimStreetTail(m[2]), raw: label, hints };
  return { suburb: expandPlace(s), street: "", raw: label, hints };
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
  const eParts = streetParts(eStreet);
  const pParts = streetParts(pStreet);
  if (numbersOverlap(eParts, pParts)) return 88;
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
  if (ties.length > 1) {
    const resolved = resolveTies(excel, ties);
    if (resolved) return { project: resolved, score: bestScore, ties: [] };
    return { project: null, score: bestScore, ties };
  }
  return { project: best, score: bestScore, ties: [] };
}

function valuesForRow(cells, existingYear) {
  const job = parseDateToken(cells[18], TARGET_YEAR);
  let defaultYear = TARGET_YEAR;
  if (job.kind === "date") defaultYear = parseInt(job.value.slice(0, 4), 10) || TARGET_YEAR;

  const out = {};
  let lastMonth = job.kind === "date" ? parseInt(job.value.slice(5, 7), 10) : 1;

  const draft = String(cells[1] || "").trim();
  out.draftsperson = draft || DRAFTSPERSON_UNASSIGNED;

  for (const { field, excel: col } of APP_FIELDS) {
    if (field === "draftsperson") continue;
    const raw = String(cells[col] ?? "").trim();
    if (!raw) {
      if (field === "year") {
        const keep = String(existingYear || "").trim();
        out[field] = keep || String(TARGET_YEAR);
        continue;
      }
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
  const firstCell = String(rows[0]?.[0] || "").trim().toLowerCase();
  const dataStart = firstCell === "project address" ? 2 : 0;
  for (let i = dataStart; i < rows.length; i++) {
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
  const vicYear = all.rows.filter((p) => {
    const y = String(p.year || "").trim();
    return !y || y.startsWith(String(TARGET_YEAR));
  });

  const used = new Set();
  const matched = [];
  const unmatchedExcel = [];
  const ambiguous = [];
  const skipped = [];

  for (const ex of excelRows) {
    const pick = pickBest(ex, vicYear, used);
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

  const stillUnmatched = [];
  for (const u of unmatchedExcel) {
    const pick = pickBest(u.excel, all.rows, used);
    if (pick.ties.length > 1) {
      ambiguous.push({ excel: u.excel, ties: pick.ties, score: pick.score });
      continue;
    }
    if (!pick.project) {
      stillUnmatched.push(u);
      continue;
    }
    const jobRaw = String(u.excel.cells[18] ?? "").trim();
    const otherYear = String(pick.project.year || "").trim();
    if (!jobRaw && otherYear && !otherYear.startsWith(String(TARGET_YEAR))) {
      skipped.push({
        excel: u.excel,
        project: pick.project,
        reason: `on VIC ${TARGET_YEAR} sheet but job is year=${otherYear} and Excel job-file date is empty (would un-tab it)`,
      });
      continue;
    }
    used.add(pick.project.id);
    matched.push({
      excel: u.excel,
      project: pick.project,
      score: pick.score,
      crossYear: true,
    });
  }

  console.log(`Excel rows: ${excelRows.length}`);
  console.log(`VIC ${TARGET_YEAR} projects: ${vicYear.length}`);
  console.log(`Matched: ${matched.length}`);
  console.log(`Excel unmatched: ${stillUnmatched.length}`);
  console.log(`Ambiguous: ${ambiguous.length}`);
  console.log(`Skipped: ${skipped.length}`);
  const unused = all.rows.filter((p) => {
    const y = String(p.year || "").trim();
    return y.startsWith(String(TARGET_YEAR)) && !used.has(p.id);
  });
  console.log(`DB not in Excel: ${unused.length}`);
  if (unused.length) {
    console.log(`\nVIC ${TARGET_YEAR} DB projects not in Excel (left untouched):`);
    for (const p of unused) {
      console.log(`  id ${p.id} ${p.suburb} | ${p.street} | year=${p.year} | ${p.classification || ""}`);
    }
  }

  const fuzzy = matched.filter((m) => m.score < 100 || m.crossYear);
  if (fuzzy.length) {
    console.log("\nFUZZY / CROSS-YEAR MATCHES:");
    for (const m of fuzzy) {
      const extra = m.crossYear ? ` [from year=${m.project.year}]` : "";
      console.log(
        `  R${m.excel.row} ${m.excel.raw} → id ${m.project.id} ${m.project.suburb} | ${m.project.street} score ${m.score}${extra}`
      );
    }
  }

  if (ambiguous.length) {
    console.log("\nAMBIGUOUS (not imported):");
    for (const a of ambiguous) {
      console.log(`  R${a.excel.row} ${a.excel.raw}`);
      for (const t of a.ties) {
        console.log(`    -> ${t.id} ${t.suburb} | ${t.street} | ${t.classification || ""}`);
      }
    }
  }
  if (skipped.length) {
    console.log("\nSKIPPED (not imported):");
    for (const s of skipped) {
      console.log(
        `  R${s.excel.row} ${s.excel.raw} → id ${s.project.id} ${s.project.suburb} | ${s.project.street} (${s.reason})`
      );
    }
  }
  if (stillUnmatched.length) {
    console.log("\nEXCEL UNMATCHED (not imported):");
    for (const u of stillUnmatched) {
      console.log(`  R${u.excel.row} ${u.excel.raw} (best score ${u.score})`);
    }
  }

  if (ambiguous.length || stillUnmatched.length) {
    await pool.end();
    console.log("\nStopped before writing so these matches can be checked.");
    process.exit(2);
  }

  const fields = APP_FIELDS.map((f) => f.field);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const m of matched) {
      const vals = valuesForRow(m.excel.cells, m.project.year);
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
    console.log(`\nUpdated ${matched.length} VIC ${TARGET_YEAR} project(s). Names/addresses unchanged.`);
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
