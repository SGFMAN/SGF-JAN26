const path = require("path");
const fs = require("fs").promises;
const PDFDocument = require("pdfkit");
const { PDFDocument: PdfLibDocument } = require("pdf-lib");

const PROPOSAL_DIR = path.join(__dirname, "..", "frontend", "PROPOSAL");
const OUTPUT_FILENAME = "TEST PROPOSAL.pdf";

const STATIC_PDF_FILES = [
  "1- FRONT.pdf",
  "7 - STANDRD INCLUSIONS.pdf",
  "8 - STANDARD INCLUSIONS 2.pdf",
  "9 - AFFORDABLE PICS.pdf",
  "10 - FINANCE.pdf",
];

function formatQuotePrice(price) {
  if (price == null || price === "") return "—";
  const s = String(price).trim();
  if (s === "—" || s === "-") return "—";
  const cleaned = s.replace(/[$,\s]/g, "");
  if (cleaned === "" || Number.isNaN(Number(cleaned))) return s;
  return `$${Number(cleaned).toLocaleString("en-AU")}`;
}

function parseQuoteAmount(price) {
  if (price == null || price === "") return null;
  const cleaned = String(price).replace(/[$,\s]/g, "").trim();
  if (cleaned === "" || Number.isNaN(Number(cleaned))) return null;
  return Number(cleaned);
}

function addImagePageFit(mergedPdf, embeddedImage) {
  const page = mergedPdf.addPage();
  const pw = page.getWidth();
  const ph = page.getHeight();
  const margin = 36;
  const maxW = pw - 2 * margin;
  const maxH = ph - 2 * margin;
  const iw = embeddedImage.width;
  const ih = embeddedImage.height;
  const scale = Math.min(maxW / iw, maxH / ih, 1);
  const dw = iw * scale;
  const dh = ih * scale;
  const x = (pw - dw) / 2;
  const y = (ph - dh) / 2;
  page.drawImage(embeddedImage, { x, y, width: dw, height: dh });
}

async function appendPdfFile(mergedPdf, filePath) {
  const buf = await fs.readFile(filePath);
  const src = await PdfLibDocument.load(buf, { ignoreEncryption: true });
  const copied = await mergedPdf.copyPages(src, src.getPageIndices());
  copied.forEach((page) => mergedPdf.addPage(page));
}

async function appendPdfBuffer(mergedPdf, pdfBuffer) {
  const src = await PdfLibDocument.load(pdfBuffer, { ignoreEncryption: true });
  const copied = await mergedPdf.copyPages(src, src.getPageIndices());
  copied.forEach((page) => mergedPdf.addPage(page));
}

async function embedImageBuffer(mergedPdf, imageBuffer) {
  try {
    return await mergedPdf.embedPng(imageBuffer);
  } catch {
    return mergedPdf.embedJpg(imageBuffer);
  }
}

function buildQuoteItemsPdfBuffer({ items = [], addressLabel = "" }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.margins.right;
    const contentW = doc.page.width - left - right;
    let y = doc.page.margins.top;

    doc.font("Helvetica-Bold").fontSize(20).fillColor("#323233");
    doc.text("Quote", left, y, { width: contentW, align: "center" });
    y += 34;

    if (addressLabel && String(addressLabel).trim()) {
      doc.font("Helvetica").fontSize(11).fillColor("#555555");
      doc.text(String(addressLabel).trim(), left, y, { width: contentW, align: "center" });
      y += 22;
    }

    const labelX = left;
    const priceW = 110;
    const priceX = left + contentW - priceW;
    const labelW = contentW - priceW - 16;

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#323233");
    doc.text("Item", labelX, y, { width: labelW });
    doc.text("Price", priceX, y, { width: priceW, align: "right" });
    y += 18;
    doc.moveTo(left, y).lineTo(left + contentW, y).strokeColor("#cccccc").stroke();
    y += 12;

    let total = 0;
    let hasTotal = false;
    const rows = Array.isArray(items) ? items : [];

    doc.font("Helvetica").fontSize(10).fillColor("#323233");
    if (!rows.length) {
      doc.text("No quote items.", labelX, y, { width: contentW });
    } else {
      for (const item of rows) {
        const label = String(item?.label || "—").trim() || "—";
        const priceText = formatQuotePrice(item?.price);
        const amount = parseQuoteAmount(item?.price);
        if (amount != null) {
          total += amount;
          hasTotal = true;
        }

        const labelH = doc.heightOfString(label, { width: labelW });
        const rowH = Math.max(labelH, 14) + 8;
        if (y + rowH > doc.page.height - doc.page.margins.bottom - 48) {
          doc.addPage();
          y = doc.page.margins.top;
        }

        doc.text(label, labelX, y, { width: labelW });
        doc.text(priceText, priceX, y, { width: priceW, align: "right" });
        y += rowH;
      }
    }

    if (hasTotal) {
      y += 8;
      doc.moveTo(left, y).lineTo(left + contentW, y).strokeColor("#cccccc").stroke();
      y += 12;
      doc.font("Helvetica-Bold").fontSize(11);
      doc.text("Total", labelX, y, { width: labelW });
      doc.text(`$${total.toLocaleString("en-AU")}`, priceX, y, { width: priceW, align: "right" });
    }

    doc.end();
  });
}

async function generateMapsProposalPdf({
  visual3dBuffer,
  mapBuffer,
  quoteItems = [],
  addressLabel = "",
}) {
  await fs.mkdir(PROPOSAL_DIR, { recursive: true });

  for (const name of STATIC_PDF_FILES) {
    try {
      await fs.access(path.join(PROPOSAL_DIR, name));
    } catch {
      const err = new Error(`Missing proposal file: ${name}`);
      err.code = "MISSING_FILE";
      throw err;
    }
  }

  const mergedPdf = await PdfLibDocument.create();

  await appendPdfFile(mergedPdf, path.join(PROPOSAL_DIR, STATIC_PDF_FILES[0]));

  if (visual3dBuffer?.length) {
    const img = await embedImageBuffer(mergedPdf, visual3dBuffer);
    addImagePageFit(mergedPdf, img);
  }

  const quotePdfBuffer = await buildQuoteItemsPdfBuffer({ items: quoteItems, addressLabel });
  await appendPdfBuffer(mergedPdf, quotePdfBuffer);

  if (mapBuffer?.length) {
    const img = await embedImageBuffer(mergedPdf, mapBuffer);
    addImagePageFit(mergedPdf, img);
  }

  for (let i = 1; i < STATIC_PDF_FILES.length; i += 1) {
    await appendPdfFile(mergedPdf, path.join(PROPOSAL_DIR, STATIC_PDF_FILES[i]));
  }

  if (mergedPdf.getPageCount() === 0) {
    throw new Error("Proposal PDF has no pages");
  }

  const outputPath = path.join(PROPOSAL_DIR, OUTPUT_FILENAME);
  await fs.writeFile(outputPath, await mergedPdf.save());
  return outputPath;
}

module.exports = {
  PROPOSAL_DIR,
  OUTPUT_FILENAME,
  generateMapsProposalPdf,
};
