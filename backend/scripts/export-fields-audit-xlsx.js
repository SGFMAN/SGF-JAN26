const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const audit = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "temp-fields-audit.json"), "utf8")
);
const outDir = "C:/BD/Excell/fields";
fs.mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 10);
const outPath = path.join(outDir, `SGF_Field_Audit_${stamp}.xlsx`);

function yn(v) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (v == null || v === "") return "";
  return String(v);
}

const headers = [
  "Field Name",
  "Data Type",
  "What It Does",
  "Table / Entity",
  "Default Value",
  "Nullable",
  "Primary Key",
  "Foreign Key",
  "Used In Frontend",
  "Used In API",
  "Notes",
];

function rowFromField(f) {
  return [
    f.field_name ?? "",
    f.data_type ?? "",
    f.description ?? "",
    f.table_or_entity ?? "",
    f.default_value == null ? "" : String(f.default_value),
    yn(f.nullable),
    yn(f.primary_key),
    f.foreign_key ?? "",
    yn(f.used_in_frontend),
    f.used_in_api == null || f.used_in_api === "" ? "" : String(f.used_in_api),
    f.notes ?? "",
  ];
}

const colWidths = [
  { wch: 42 },
  { wch: 18 },
  { wch: 70 },
  { wch: 42 },
  { wch: 18 },
  { wch: 10 },
  { wch: 12 },
  { wch: 28 },
  { wch: 16 },
  { wch: 40 },
  { wch: 50 },
];

const wb = XLSX.utils.book_new();

const wsAll = XLSX.utils.aoa_to_sheet([headers, ...audit.fields.map(rowFromField)]);
wsAll["!cols"] = colWidths;
XLSX.utils.book_append_sheet(wb, wsAll, "All Fields");

const byEntity = {};
for (const f of audit.fields) {
  const e = f.table_or_entity || "(unknown)";
  byEntity[e] = (byEntity[e] || 0) + 1;
}

const summaryAoa = [
  ["SGF Field Audit"],
  ["Generated At", audit.generated_at || new Date().toISOString()],
  ["Source", audit.source || ""],
  ["Total Fields", audit.fields.length],
  [],
  ["Table / Entity", "Field Count"],
  ...Object.keys(byEntity)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => [k, byEntity[k]]),
];
const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
wsSummary["!cols"] = [{ wch: 48 }, { wch: 14 }];
XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

const topEntities = [
  ...new Set(audit.fields.map((f) => String(f.table_or_entity || "").split(".")[0])),
].sort();

for (const entity of topEntities) {
  const entityFields = audit.fields.filter(
    (f) =>
      f.table_or_entity === entity ||
      String(f.table_or_entity || "").startsWith(`${entity}.`)
  );
  if (entityFields.length === 0) continue;

  const ws = XLSX.utils.aoa_to_sheet([headers, ...entityFields.map(rowFromField)]);
  ws["!cols"] = colWidths;

  let sheetName = entity.replace(/[\\/?*[\]:]/g, "_");
  if (sheetName.length > 31) sheetName = sheetName.slice(0, 31);

  let finalName = sheetName;
  let i = 2;
  while (wb.SheetNames.includes(finalName)) {
    const suffix = `_${i}`;
    finalName = sheetName.slice(0, 31 - suffix.length) + suffix;
    i += 1;
  }
  XLSX.utils.book_append_sheet(wb, ws, finalName);
}

XLSX.writeFile(wb, outPath);
console.log(
  JSON.stringify(
    {
      outPath,
      totalFields: audit.fields.length,
      sheets: wb.SheetNames.length,
      sheetNames: wb.SheetNames,
    },
    null,
    2
  )
);
