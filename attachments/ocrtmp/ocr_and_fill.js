const path = require("path");
const Tesseract = require("tesseract.js");
const XLSX = require("xlsx");
const sharp = require("sharp");

const imagePath = "C:/Users/Design/.cursor/projects/c-SGF/assets/c__Users_Design_AppData_Roaming_Cursor_User_workspaceStorage_9e3d30cb8f0e4b669f91f590361073ae_images_image-1d3f0a0f-ca91-45fb-8d53-fa5dd4058c03.png";
const outputPath = "C:/SGF/Project_List_Populated.xlsx";
const processedImagePath = "C:/SGF/attachments/ocrtmp/preprocessed.png";

function parseRows(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows = [];
  let current = null;

  for (const line of lines) {
    if (/^\d+\s+/.test(line)) {
      if (current) rows.push(current);
      current = { idLine: line, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) rows.push(current);

  return rows.map((r) => {
    const joined = [r.idLine, ...r.body].join(" | ");
    const pieces = joined.split(/\s*\|\s*/).filter(Boolean);
    const address = pieces[0] || "";
    const clientName = pieces[1] || "";
    const amountTokens = joined.match(/\$[\d,]+(?:\.\d{2})?/g) || [];
    const projectDateMatch =
      joined.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/) ||
      joined.match(/\b[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}\b/);

    return {
      address,
      clientName,
      depositAmount: amountTokens[0] || "",
      contractAmount: amountTokens[1] || "",
      projectDate: projectDateMatch ? projectDateMatch[0] : "",
      raw: joined,
    };
  });
}

async function main() {
  await sharp(imagePath)
    .resize({ width: 1200, kernel: "lanczos3" })
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(170)
    .toFile(processedImagePath);

  const result = await Tesseract.recognize(processedImagePath, "eng", {
    logger: () => {},
  });

  const text = result.data.text || "";
  console.log(`OCR text length: ${text.length}`);
  const parsed = parseRows(text).filter((r) => r.address || r.clientName);

  const wb = XLSX.utils.book_new();
  const rows = [
    [
      "Address (supplied)",
      "Client Name",
      "Deposit Amount",
      "Contract Amount",
      "Project Date",
    ],
    ...parsed.map((r) => [
      r.address,
      r.clientName,
      r.depositAmount,
      r.contractAmount,
      r.projectDate,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Projects");
  XLSX.writeFile(wb, outputPath);

  console.log(`Wrote ${parsed.length} rows to ${outputPath}`);
  console.log("Sample parsed rows:");
  parsed.slice(0, 10).forEach((r, i) => {
    console.log(`${i + 1}. ${r.raw}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
