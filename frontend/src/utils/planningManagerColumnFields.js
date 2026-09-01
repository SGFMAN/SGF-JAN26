/**
 * Planning Manager column → project DB field mapping (0-based cols).
 * Sent columns use *_sent_at or existing JF *_requested_at.
 * Received columns use *_received_at.
 *
 * kind:
 *   (default) date stamp via double-click
 *   note     — dropdown Date / Note / Clear
 *   select   — dropdown of fixed options
 *   naDate   — dropdown N/A / Date
 */

export const FLOODING_REGULATION_OPTIONS = ["N/A", "Required", "REG 153", "REG 154"];

export const SEWER_SEPTIC_AUTHORITY_OPTIONS = [
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

export const PLANNING_MANAGER_COL_FIELD = {
  // Land Channel - Zones & Overlays (C–D)
  2: { field: "planning_land_channel_zones_overlays_sent_at" },
  3: { field: "planning_land_channel_zones_overlays_received_at" },
  // Land Data - Title & Covenants (E–F)
  4: { field: "planning_land_data_title_covenants_sent_at" },
  5: { field: "planning_land_data_title_covenants_received_at" },
  // DBYD - Stormwater (G–H) — existing JF requested/received
  6: { field: "planning_jf_ebyda_stormwater_requested_at" },
  7: { field: "planning_jf_ebyda_stormwater_received_at" },
  // DBYD - Sewer (I–J)
  8: { field: "planning_jf_byda_sewer_main_requested_at" },
  9: { field: "planning_jf_byda_sewer_main_received_at" },
  // Sewer Plan - Water Authority (K–L)
  10: { field: "planning_jf_internal_sewer_plan_requested_at" },
  11: { field: "planning_jf_internal_sewer_plan_received_at" },
  // Sewer - Size, Depth, Offset (M–N)
  12: { field: "planning_jf_sewer_main_size_depth_offset_requested_at" },
  13: { field: "planning_jf_sewer_main_size_depth_offset_received_at" },
  // LPOD (O–P)
  14: { field: "planning_jf_legal_point_discharge_requested_at" },
  15: { field: "planning_jf_legal_point_discharge_received_at" },
  // Property Info - Council (Q–R)
  16: { field: "planning_jf_property_info_report_requested_at" },
  17: { field: "planning_jf_property_info_report_received_at" },
  // Job File Created (S) — project start date (`year`)
  18: { field: "year", readOnly: true },
  // Concept / Working Drawings approvals (T–U) — set only via Drawings approve buttons
  19: { field: "drawings_concept_approved_date", readOnly: true },
  20: { field: "drawings_working_approved_date", readOnly: true },
  // JCA Land Survey (V–W)
  21: { field: "planning_jca_land_survey_sent_at" },
  22: { field: "planning_jca_land_survey_received_at" },
  // Soil Test Melbourne (X–Y)
  23: { field: "planning_soil_test_melbourne_sent_at" },
  24: { field: "planning_soil_test_melbourne_received_at" },
  // Footing Certification (Z–AA) — existing JF requested/received
  25: { field: "planning_footing_certification_requested_at" },
  26: { field: "planning_footing_certification_received_at" },
  // Site Visit - Plans Updated (AB)
  27: { field: "planning_site_visit_plans_updated_at" },
  // Town Planning columns (AC–AE) — dropdown: Date / Note / Clear
  28: { field: "planning_mgr_tp_requested", kind: "note" },
  29: { field: "planning_mgr_tp_received", kind: "note" },
  30: { field: "planning_mgr_tp_needed", kind: "note" },
  // Flooding (AF) + Melb Water / Council Sent–Received (AG–AJ)
  31: {
    field: "planning_land_flooding_regulation",
    kind: "select",
    options: FLOODING_REGULATION_OPTIONS,
  },
  32: { field: "planning_land_flooding_fpa_requested_at", kind: "naDate" },
  33: { field: "planning_land_flooding_fpa_received_at", kind: "naDate" },
  34: { field: "planning_land_flooding_cc_requested_at", kind: "naDate" },
  35: { field: "planning_land_flooding_cc_received_at", kind: "naDate" },
  // BAL Required (AK–AL)
  36: { field: "planning_bal_requested_at", kind: "naDate" },
  37: { field: "planning_bal_received_at", kind: "naDate" },
  // Energy Rating (AM–AN)
  38: { field: "planning_energy_report_requested_at" },
  39: { field: "planning_energy_report_received_at" },
  // Energy Specs Added to Plans (AO)
  40: { field: "planning_energy_specs_added_to_plans_at" },
  // Windows (AP–AQ)
  41: { field: "planning_windows_requested_at" },
  42: { field: "planning_windows_received_at" },
  // Sewer/Septic Application (AR–AT)
  43: {
    field: "planning_sewer_septic_authority",
    kind: "select",
    options: SEWER_SEPTIC_AUTHORITY_OPTIONS,
    allowNote: false,
  },
  44: { field: "planning_sewer_septic_application_requested_at" },
  45: { field: "planning_sewer_septic_application_received_at" },
  // Warranty Insurance (AU)
  46: { field: "planning_warranty_insurance_at" },
  // Building Permit (AV–AW) — existing Planning dates
  47: { field: "planning_building_permit_requested_at" },
  48: { field: "planning_building_permit_received_at" },
  // Asset Protection (AX–AY)
  49: { field: "planning_asset_protection_sent_at" },
  50: { field: "planning_asset_protection_received_at" },
};

const DROPDOWN_KINDS = new Set(["note", "select", "naDate"]);

export function isPlanningManagerDropdownCol(mapping) {
  return Boolean(mapping?.kind && DROPDOWN_KINDS.has(mapping.kind));
}

/**
 * TEMP: right-click calendar for correcting historical dates.
 * True for double-click date columns and dropdowns that include Date.
 */
export function planningManagerCellAllowsManualDate(mapping) {
  if (mapping?.readOnly) return false;
  if (!mapping) return true; // unmapped blob cells — double-click date stamp
  if (mapping.kind === "select") return false; // no Date option
  if (mapping.kind === "note" || mapping.kind === "naDate") return true;
  return Boolean(mapping.field);
}

/** Writable data cells (not address/draftsperson, not read-only mapped fields). */
export function planningManagerCellAllowsFreeEdit(colIndex, mapping) {
  if (colIndex < 2) return false;
  if (mapping?.readOnly) return false;
  return true;
}

export const PLANNING_MANAGER_NOTE_FIELDS = Object.values(PLANNING_MANAGER_COL_FIELD)
  .filter((m) => m.kind === "note" && m.field)
  .map((m) => m.field);

export const PLANNING_MANAGER_SELECT_FIELDS = Object.values(PLANNING_MANAGER_COL_FIELD)
  .filter((m) => m.field && (m.kind === "note" || m.kind === "select" || m.kind === "naDate"))
  .map((m) => m.field);

export const PLANNING_MANAGER_WRITABLE_DATE_FIELDS = Object.values(PLANNING_MANAGER_COL_FIELD)
  .filter((m) => m.field && !m.readOnly && !DROPDOWN_KINDS.has(m.kind))
  .map((m) => m.field);

const SHEET_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Display dd-Mmm from ISO date / timestamp / year-only. */
export function formatPlanningManagerSheetDate(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const day = parseInt(s.slice(8, 10), 10);
    const month = parseInt(s.slice(5, 7), 10) - 1;
    if (!Number.isFinite(day) || month < 0 || month > 11) return "";
    return `${String(day).padStart(2, "0")}-${SHEET_MONTHS[month]}`;
  }
  if (/^\d{4}$/.test(s)) return s;
  // Already dd-Mmm from older blob cells
  if (/^\d{1,2}-[A-Za-z]{3}$/.test(s)) {
    const [d, m] = s.split("-");
    return `${String(d).padStart(2, "0")}-${m[0].toUpperCase()}${m.slice(1, 3).toLowerCase()}`;
  }
  return s;
}

/** Today as YYYY-MM-DD for DB storage. */
export function planningManagerTodayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getPlanningManagerColMapping(colIndex) {
  return PLANNING_MANAGER_COL_FIELD[colIndex] || null;
}

/** Menu items for a dropdown-mapped Planning Manager cell. */
export function getPlanningManagerDropdownOptions(mapping) {
  if (!mapping?.kind) return [];
  if (mapping.kind === "note") {
    return [
      { label: "Date", value: "__date__" },
      { label: "Note", value: "__note__" },
      { label: "Clear", value: "__clear__" },
    ];
  }
  if (mapping.kind === "naDate") {
    return [
      { label: "N/A", value: "N/A" },
      { label: "Date", value: "__date__" },
      { label: "Note", value: "__note__" },
    ];
  }
  if (mapping.kind === "select" && Array.isArray(mapping.options)) {
    const items = mapping.options.map((opt) => ({ label: opt, value: opt }));
    if (mapping.allowNote !== false) {
      items.push({ label: "Note", value: "__note__" });
    } else {
      items.push({ label: "Clear", value: "__clear__" });
    }
    return items;
  }
  return [];
}
