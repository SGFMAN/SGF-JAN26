/**
 * Planning Manager column → project DB field mapping (0-based cols).
 * Sent columns use *_sent_at or existing JF *_requested_at.
 * Received columns use *_received_at.
 */

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
};

export const PLANNING_MANAGER_WRITABLE_DATE_FIELDS = Object.values(PLANNING_MANAGER_COL_FIELD)
  .filter((m) => m.field && !m.readOnly)
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
