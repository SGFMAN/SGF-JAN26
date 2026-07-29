/**
 * Export Planning Manager field inventory to Excel.
 * Run: node backend/scripts/export-planning-manager-fields-xlsx.js
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const outDir = "C:/BD/Excell/fields";
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const outPath = path.join(outDir, `Planning_Manager_Fields_${stamp}.xlsx`);

function colLetter(index) {
  let n = index;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

const COL_COUNT = 78;

/** Same mapping as frontend/src/utils/planningManagerColumnFields.js */
const PLANNING_MANAGER_COL_FIELD = {
  2: { field: "planning_land_channel_zones_overlays_sent_at", readOnly: false },
  3: { field: "planning_land_channel_zones_overlays_received_at", readOnly: false },
  4: { field: "planning_land_data_title_covenants_sent_at", readOnly: false },
  5: { field: "planning_land_data_title_covenants_received_at", readOnly: false },
  6: { field: "planning_jf_ebyda_stormwater_requested_at", readOnly: false },
  7: { field: "planning_jf_ebyda_stormwater_received_at", readOnly: false },
  8: { field: "planning_jf_byda_sewer_main_requested_at", readOnly: false },
  9: { field: "planning_jf_byda_sewer_main_received_at", readOnly: false },
  10: { field: "planning_jf_internal_sewer_plan_requested_at", readOnly: false },
  11: { field: "planning_jf_internal_sewer_plan_received_at", readOnly: false },
  12: { field: "planning_jf_sewer_main_size_depth_offset_requested_at", readOnly: false },
  13: { field: "planning_jf_sewer_main_size_depth_offset_received_at", readOnly: false },
  14: { field: "planning_jf_legal_point_discharge_requested_at", readOnly: false },
  15: { field: "planning_jf_legal_point_discharge_received_at", readOnly: false },
  16: { field: "planning_jf_property_info_report_requested_at", readOnly: false },
  17: { field: "planning_jf_property_info_report_received_at", readOnly: false },
  18: { field: "year", readOnly: true },
};

const SHEET_TITLE_BLOCKS = [
  { startCol: 0, colSpan: 1, label: "Project Address" },
  { startCol: 1, colSpan: 1, label: "DRAFTSPERSON" },
  { startCol: 2, colSpan: 2, label: "Land Channel - Zones & Overlays" },
  { startCol: 4, colSpan: 2, label: "Land Data - Title & Covenants" },
  { startCol: 6, colSpan: 2, label: "DBYD - Stormwater" },
  { startCol: 8, colSpan: 2, label: "DBYD - Sewer" },
  { startCol: 10, colSpan: 2, label: "Sewer Plan - Water Authority" },
  { startCol: 12, colSpan: 2, label: "Sewer - Size, Depth, Offset" },
  { startCol: 14, colSpan: 2, label: "LPOD" },
  { startCol: 16, colSpan: 2, label: "Property Info - Council" },
  { startCol: 18, colSpan: 1, label: "Job File Created" },
  { startCol: 19, colSpan: 1, label: "Concept" },
  { startCol: 20, colSpan: 1, label: "Working Drawings" },
  { startCol: 21, colSpan: 2, label: "JCA Land Survey" },
  { startCol: 23, colSpan: 2, label: "Soil Test Melbourne" },
  { startCol: 25, colSpan: 2, label: "Footing Certification", row2: ["Sent", "Received"] },
  { startCol: 27, colSpan: 1, label: "Site Visit - Plans Updated" },
  { startCol: 28, colSpan: 2, label: "Town Planning", row2: ["Requested", "Received"] },
  { startCol: 30, colSpan: 1, label: "Town Planning Needed" },
  { startCol: 31, colSpan: 1, label: "Flooding" },
  { startCol: 32, colSpan: 2, label: "Subject to 153,154 - Melb Water", row2: ["Sent", "Received"] },
  { startCol: 34, colSpan: 2, label: "Subject to 153,154 - Council", row2: ["Sent", "Received"] },
  { startCol: 36, colSpan: 2, label: "BAL Required", row2: ["Requested", "Received"] },
  { startCol: 38, colSpan: 2, label: "Energy Rating", row2: ["Sent", "Received"] },
  { startCol: 40, colSpan: 1, label: "Energy Specs Added to Plans" },
  { startCol: 41, colSpan: 2, label: "Windows", row2: ["Requested", "Received"] },
  { startCol: 43, colSpan: 3, label: "Sewer/Septic Application", row2: ["Authority", "Requested", "Received"] },
  { startCol: 46, colSpan: 1, label: "Warranty Insurance" },
  { startCol: 47, colSpan: 2, label: "Building Permit", row2: ["Requested", "Received"] },
  { startCol: 49, colSpan: 2, label: "Asset Protection", row2: ["Sent", "Received"] },
  { startCol: 51, colSpan: COL_COUNT - 51, label: "(unused / reserved)" },
];

function buildColumnMeta() {
  const titleByCol = Array.from({ length: COL_COUNT }, () => "");
  const subByCol = Array.from({ length: COL_COUNT }, () => "");
  for (const block of SHEET_TITLE_BLOCKS) {
    for (let i = 0; i < block.colSpan; i += 1) {
      const idx = block.startCol + i;
      if (idx >= COL_COUNT) break;
      titleByCol[idx] = block.label;
    }
    const row2 =
      block.row2 ?? (block.colSpan === 2 ? ["Sent", "Received"] : null);
    if (row2) {
      for (let i = 0; i < block.colSpan && i < row2.length; i += 1) {
        subByCol[block.startCol + i] = row2[i];
      }
    }
  }
  return { titleByCol, subByCol };
}

const { titleByCol, subByCol } = buildColumnMeta();

/** Project / related fields used by Planning Manager (not only sheet columns). */
const projectFields = [
  {
    field_name: "id",
    data_type: "INTEGER",
    what_it_does: "Project primary key; used for ordering, sheet cells key, API updates, linked-pair identity",
    storage: "projects.id",
    used_for: "Row identity, layout projectOrders, cells JSON key, PUT draftsperson/date",
    editable_on_page: "No",
    notes: "Linked copy rows collapse onto source id",
  },
  {
    field_name: "access_token",
    data_type: "TEXT",
    what_it_does: "Opaque URL token for opening the project Overview on double-click",
    storage: "projects.access_token",
    used_for: "Navigation to project overview",
    editable_on_page: "No",
    notes: "",
  },
  {
    field_name: "suburb",
    data_type: "TEXT",
    what_it_does: "Part of column A address label (SUBURB - Street)",
    storage: "projects.suburb",
    used_for: "Display label (col A)",
    editable_on_page: "No",
    notes: "Shown uppercase",
  },
  {
    field_name: "street",
    data_type: "TEXT",
    what_it_does: "Part of column A address label",
    storage: "projects.street",
    used_for: "Display label (col A)",
    editable_on_page: "No",
    notes: "",
  },
  {
    field_name: "name",
    data_type: "TEXT",
    what_it_does: "Fallback label when suburb/street missing; also sent on draftsperson PUT",
    storage: "projects.name",
    used_for: "Display fallback; API payload",
    editable_on_page: "No",
    notes: "",
  },
  {
    field_name: "classification",
    data_type: "TEXT",
    what_it_does: "Maps to abbreviation in col A (SSD, REN, etc.); Home Office / Studio excluded from sheet",
    storage: "projects.classification",
    used_for: "Label abbrevs; filter",
    editable_on_page: "No",
    notes: "Linked jobs combine both abbrevs e.g. (SSD)(REN)",
  },
  {
    field_name: "status",
    data_type: "TEXT",
    what_it_does: "Hotlist excluded; Cancelled shown in red with (CANCELLED) suffix",
    storage: "projects.status",
    used_for: "Filter + label styling",
    editable_on_page: "No",
    notes: "",
  },
  {
    field_name: "on_hold",
    data_type: "BOOLEAN/TEXT",
    what_it_does: "On-hold projects shown in red with (ON HOLD) suffix",
    storage: "projects.on_hold",
    used_for: "Label styling",
    editable_on_page: "No",
    notes: "Checked via isOnHoldFlag",
  },
  {
    field_name: "state",
    data_type: "TEXT",
    what_it_does: "Drives bottom tabs with year (VIC 2025, QLD 2026, …)",
    storage: "projects.state",
    used_for: "Tab grouping / search scope",
    editable_on_page: "No",
    notes: "Normalized to VIC/QLD",
  },
  {
    field_name: "year",
    data_type: "TEXT",
    what_it_does: "Start date / year: tab grouping, default sort, Job File Created column (S)",
    storage: "projects.year",
    used_for: "Tabs, sort, col S display",
    editable_on_page: "No (read-only on sheet)",
    notes: "Displayed as dd-Mmm when ISO date",
  },
  {
    field_name: "updated_at",
    data_type: "TIMESTAMPTZ",
    what_it_does: "Fallback for start-date sort when year missing",
    storage: "projects.updated_at",
    used_for: "Default row ordering",
    editable_on_page: "No",
    notes: "",
  },
  {
    field_name: "draftsperson",
    data_type: "TEXT",
    what_it_does: "Assigned draftsperson name shown in column B",
    storage: "projects.draftsperson",
    used_for: "Col B display + dropdown edit",
    editable_on_page: "Yes",
    notes: "PUT /api/projects/:id; Unassigned sentinel supported",
  },
  {
    field_name: "duplicate_source_project_id",
    data_type: "INTEGER",
    what_it_does: "Links renovation copy to source; Planning Manager collapses pair into one row",
    storage: "projects.duplicate_source_project_id",
    used_for: "Linked-job collapse + combined abbrevs",
    editable_on_page: "No",
    notes: "Source row kept; partner attached as _planningLinkPartner in UI only",
  },
];

// Add mapped planning date fields from PLANNING_MANAGER_COL_FIELD
for (const [colStr, meta] of Object.entries(PLANNING_MANAGER_COL_FIELD)) {
  const col = Number(colStr);
  const letter = colLetter(col);
  const title = titleByCol[col];
  const sub = subByCol[col];
  const already = projectFields.some((f) => f.field_name === meta.field);
  if (already) {
    // year already listed — enrich notes
    const existing = projectFields.find((f) => f.field_name === meta.field);
    existing.notes = `${existing.notes ? existing.notes + "; " : ""}Also sheet col ${letter} (${title}${sub ? " / " + sub : ""})`;
    continue;
  }
  projectFields.push({
    field_name: meta.field,
    data_type: "TEXT (ISO date YYYY-MM-DD)",
    what_it_does: `Sheet column ${letter}: ${title}${sub ? " — " + sub : ""}. Toggle today / clear on click.`,
    storage: `projects.${meta.field}`,
    used_for: `Col ${letter} Sent/Received (or Requested) date`,
    editable_on_page: meta.readOnly ? "No" : "Yes",
    notes: meta.readOnly
      ? "Read-only mapping"
      : "PUT /api/projects/:id/planning-manager-date",
  });
}

projectFields.sort((a, b) => a.field_name.localeCompare(b.field_name));

/** Sheet columns inventory */
const sheetColumns = [];
for (let col = 0; col < COL_COUNT; col += 1) {
  const letter = colLetter(col);
  const title = titleByCol[col] || "";
  const sub = subByCol[col] || "";
  let storage = "";
  let fieldName = "";
  let dataType = "";
  let what = "";
  let editable = "";
  let notes = "";

  if (col === 0) {
    fieldName = "(composed label)";
    dataType = "Display text";
    storage = "Derived from suburb, street, classification, status, on_hold (+ linked partner)";
    what = "Project address line with classification abbrev(s)";
    editable = "No";
    notes = "Double-click opens Overview";
  } else if (col === 1) {
    fieldName = "draftsperson";
    dataType = "TEXT";
    storage = "projects.draftsperson";
    what = "Draftsperson name (uppercase)";
    editable = "Yes (dropdown)";
    notes = "Users with Architectural Draftsperson / Draftsperson position";
  } else if (PLANNING_MANAGER_COL_FIELD[col]) {
    const m = PLANNING_MANAGER_COL_FIELD[col];
    fieldName = m.field;
    dataType = "TEXT (date)";
    storage = `projects.${m.field}`;
    what = m.readOnly
      ? "Shows project start date (year field)"
      : "Click sets today; click again clears";
    editable = m.readOnly ? "No" : "Yes";
    notes = m.readOnly ? "Read-only" : "Saved via planning-manager-date API";
  } else if (title === "(unused / reserved)" || title === "") {
    fieldName = "";
    dataType = "TEXT (cell blob)";
    storage = "settings.planning_manager_cells_json[projectId][colIndex]";
    what = "Reserved / unused column — still can store cell values if clicked";
    editable = "Yes (blob)";
    notes = "AZ–BZ span";
  } else {
    fieldName = "";
    dataType = "TEXT (cell blob, typically dd-Mmm)";
    storage = "settings.planning_manager_cells_json[projectId][colIndex]";
    what = "Legacy sheet cell — not yet mapped to a projects.* column";
    editable = "Yes (click sets today display date)";
    notes = "Persisted in shared cells JSON, not project row";
  }

  sheetColumns.push({
    column_letter: letter,
    column_index: col,
    title_row: title,
    subheading_row: sub,
    field_name: fieldName,
    data_type: dataType,
    what_it_does: what,
    storage,
    editable_on_page: editable,
    notes,
  });
}

const layoutFields = [
  {
    field_name: "colWidths",
    data_type: "number[78]",
    what_it_does: "Per-column widths for the sheet",
    storage: "settings.planning_manager_layout_json.colWidths",
    editable_on_page: "Yes (drag resize)",
    notes: "",
  },
  {
    field_name: "rowHeights",
    data_type: "number[]",
    what_it_does: "Per-row heights when user has customized rows",
    storage: "settings.planning_manager_layout_json.rowHeights",
    editable_on_page: "Yes (drag resize)",
    notes: "Only saved when rowsCustomized",
  },
  {
    field_name: "rowsCustomized",
    data_type: "boolean",
    what_it_does: "Whether custom row heights should be applied",
    storage: "settings.planning_manager_layout_json.rowsCustomized",
    editable_on_page: "Implicit",
    notes: "",
  },
  {
    field_name: "projectOrders",
    data_type: "object { [tabKey]: number[] }",
    what_it_does: "Custom project id order per tab (e.g. VIC 2025)",
    storage: "settings.planning_manager_layout_json.projectOrders",
    editable_on_page: "Yes (Move to row)",
    notes: "Uses collapsed linked-job primary ids",
  },
  {
    field_name: "projectOrder",
    data_type: "number[] (legacy)",
    what_it_does: "Legacy single-list order; migrated into projectOrders['VIC 2025']",
    storage: "settings.planning_manager_layout_json.projectOrder",
    editable_on_page: "No (legacy)",
    notes: "Still read on load for migration",
  },
  {
    field_name: "activeTab",
    data_type: "string",
    what_it_does: "Last selected bottom tab (state + year)",
    storage: "settings.planning_manager_layout_json.activeTab",
    editable_on_page: "Yes (tab click)",
    notes: "Example: VIC 2025",
  },
  {
    field_name: "customizedTabs",
    data_type: "string[]",
    what_it_does: "Tabs that use custom projectOrders instead of start-date sort",
    storage: "settings.planning_manager_layout_json.customizedTabs",
    editable_on_page: "Implicit on reorder",
    notes: "VIC 2025 always uses custom order when present",
  },
];

const cellsFields = [
  {
    field_name: "planning_manager_cells_json",
    data_type: "JSON object",
    what_it_does: "Shared sparse cell values for unmapped sheet columns",
    storage: "settings.planning_manager_cells_json",
    editable_on_page: "Yes",
    notes: "Shape: { [projectId]: { [colIndex]: string|null } }",
  },
  {
    field_name: "<projectId>",
    data_type: "object",
    what_it_does: "All blob cells for one project",
    storage: "settings.planning_manager_cells_json.<projectId>",
    editable_on_page: "Yes",
    notes: "",
  },
  {
    field_name: "<colIndex>",
    data_type: "TEXT",
    what_it_does: "Value for one sheet column (often dd-Mmm date string)",
    storage: "settings.planning_manager_cells_json.<projectId>.<colIndex>",
    editable_on_page: "Yes",
    notes: "PUT /api/planning-manager-cells",
  },
];

const otherFields = [
  {
    field_name: "users.id / users.name / user positions",
    data_type: "various",
    what_it_does: "Load draftsperson dropdown options",
    storage: "users + positions / user_positions",
    editable_on_page: "No",
    notes: "Filter: Architectural Draftsperson or Draftsperson",
  },
  {
    field_name: "_planningLinkPartner",
    data_type: "UI-only object",
    what_it_does: "Attached linked copy project for combined (SSD)(REN) label",
    storage: "Not persisted (frontend only)",
    editable_on_page: "No",
    notes: "Built via collapseLinkedProjectsForPlanning",
  },
];

function sheetFromObjects(headers, objects, colWidths) {
  const aoa = [headers, ...objects.map((o) => headers.map((h) => o[h] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = colWidths;
  return ws;
}

const wb = XLSX.utils.book_new();

// Summary
const mappedCount = Object.keys(PLANNING_MANAGER_COL_FIELD).length;
const blobColCount = sheetColumns.filter((c) =>
  String(c.storage).includes("planning_manager_cells_json")
).length;
const summary = [
  ["Planning Manager — Field Inventory"],
  ["Generated", new Date().toISOString()],
  ["Source pages", "frontend/src/pages/PlanningManager.jsx + planningManagerColumnFields.js + layout/cells APIs"],
  ["Total sheet columns", COL_COUNT],
  ["Columns mapped to projects.* fields", mappedCount + 2], // + address composed + draftsperson
  ["Columns using cells blob storage", blobColCount],
  ["Project DB fields referenced", projectFields.length],
  [],
  ["Sheet", "Contents"],
  ["All Fields Used", "Flat list of every project/layout/cells field the page uses"],
  ["Sheet Columns", "Every column A–BZ with title, storage, editability"],
  ["Project Fields", "projects.* fields only"],
  ["Layout JSON", "settings.planning_manager_layout_json keys"],
  ["Cells JSON", "settings.planning_manager_cells_json structure"],
];
const wsSummary = XLSX.utils.aoa_to_sheet(summary);
wsSummary["!cols"] = [{ wch: 40 }, { wch: 90 }];
XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

// All fields used (combined)
const allUsed = [
  ...projectFields.map((f) => ({
    "Field Name": f.field_name,
    "Data Type": f.data_type,
    "What It Does": f.what_it_does,
    Category: "Project",
    Storage: f.storage,
    "Editable On Page": f.editable_on_page,
    "Used For": f.used_for,
    Notes: f.notes,
  })),
  ...layoutFields.map((f) => ({
    "Field Name": f.field_name,
    "Data Type": f.data_type,
    "What It Does": f.what_it_does,
    Category: "Layout JSON",
    Storage: f.storage,
    "Editable On Page": f.editable_on_page,
    "Used For": "Sheet layout persistence",
    Notes: f.notes,
  })),
  ...cellsFields.map((f) => ({
    "Field Name": f.field_name,
    "Data Type": f.data_type,
    "What It Does": f.what_it_does,
    Category: "Cells JSON",
    Storage: f.storage,
    "Editable On Page": f.editable_on_page,
    "Used For": "Unmapped column values",
    Notes: f.notes,
  })),
  ...otherFields.map((f) => ({
    "Field Name": f.field_name,
    "Data Type": f.data_type,
    "What It Does": f.what_it_does,
    Category: "Other",
    Storage: f.storage,
    "Editable On Page": f.editable_on_page,
    "Used For": "",
    Notes: f.notes,
  })),
];

XLSX.utils.book_append_sheet(
  wb,
  sheetFromObjects(
    [
      "Field Name",
      "Data Type",
      "What It Does",
      "Category",
      "Storage",
      "Editable On Page",
      "Used For",
      "Notes",
    ],
    allUsed,
    [
      { wch: 48 },
      { wch: 28 },
      { wch: 70 },
      { wch: 14 },
      { wch: 55 },
      { wch: 18 },
      { wch: 40 },
      { wch: 45 },
    ]
  ),
  "All Fields Used"
);

XLSX.utils.book_append_sheet(
  wb,
  sheetFromObjects(
    [
      "Column Letter",
      "Column Index",
      "Title Row",
      "Subheading Row",
      "Field Name",
      "Data Type",
      "What It Does",
      "Storage",
      "Editable On Page",
      "Notes",
    ],
    sheetColumns.map((c) => ({
      "Column Letter": c.column_letter,
      "Column Index": c.column_index,
      "Title Row": c.title_row,
      "Subheading Row": c.subheading_row,
      "Field Name": c.field_name,
      "Data Type": c.data_type,
      "What It Does": c.what_it_does,
      Storage: c.storage,
      "Editable On Page": c.editable_on_page,
      Notes: c.notes,
    })),
    [
      { wch: 10 },
      { wch: 12 },
      { wch: 36 },
      { wch: 14 },
      { wch: 48 },
      { wch: 28 },
      { wch: 55 },
      { wch: 60 },
      { wch: 16 },
      { wch: 40 },
    ]
  ),
  "Sheet Columns"
);

XLSX.utils.book_append_sheet(
  wb,
  sheetFromObjects(
    [
      "Field Name",
      "Data Type",
      "What It Does",
      "Storage",
      "Used For",
      "Editable On Page",
      "Notes",
    ],
    projectFields.map((f) => ({
      "Field Name": f.field_name,
      "Data Type": f.data_type,
      "What It Does": f.what_it_does,
      Storage: f.storage,
      "Used For": f.used_for,
      "Editable On Page": f.editable_on_page,
      Notes: f.notes,
    })),
    [
      { wch: 48 },
      { wch: 28 },
      { wch: 70 },
      { wch: 50 },
      { wch: 40 },
      { wch: 18 },
      { wch: 45 },
    ]
  ),
  "Project Fields"
);

XLSX.utils.book_append_sheet(
  wb,
  sheetFromObjects(
    ["Field Name", "Data Type", "What It Does", "Storage", "Editable On Page", "Notes"],
    layoutFields.map((f) => ({
      "Field Name": f.field_name,
      "Data Type": f.data_type,
      "What It Does": f.what_it_does,
      Storage: f.storage,
      "Editable On Page": f.editable_on_page,
      Notes: f.notes,
    })),
    [{ wch: 20 }, { wch: 32 }, { wch: 60 }, { wch: 55 }, { wch: 18 }, { wch: 40 }]
  ),
  "Layout JSON"
);

XLSX.utils.book_append_sheet(
  wb,
  sheetFromObjects(
    ["Field Name", "Data Type", "What It Does", "Storage", "Editable On Page", "Notes"],
    cellsFields.map((f) => ({
      "Field Name": f.field_name,
      "Data Type": f.data_type,
      "What It Does": f.what_it_does,
      Storage: f.storage,
      "Editable On Page": f.editable_on_page,
      Notes: f.notes,
    })),
    [{ wch: 28 }, { wch: 20 }, { wch: 60 }, { wch: 55 }, { wch: 18 }, { wch: 45 }]
  ),
  "Cells JSON"
);

XLSX.writeFile(wb, outPath);
console.log(
  JSON.stringify(
    {
      outPath,
      projectFields: projectFields.length,
      sheetColumns: sheetColumns.length,
      allUsed: allUsed.length,
      sheets: wb.SheetNames,
    },
    null,
    2
  )
);
