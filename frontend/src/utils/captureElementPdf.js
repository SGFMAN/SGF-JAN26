import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

async function captureElementToCanvas(element) {
  const prevOverflow = element.style.overflow;
  const prevHeight = element.style.height;
  const prevMinHeight = element.style.minHeight;

  element.style.overflow = "visible";
  element.style.height = "auto";
  element.style.minHeight = "0";

  try {
    return await html2canvas(element, {
      scale: 1.35,
      useCORS: true,
      logging: false,
      backgroundColor: "#a1a1a3",
    });
  } finally {
    element.style.overflow = prevOverflow;
    element.style.height = prevHeight;
    element.style.minHeight = prevMinHeight;
  }
}

const JPEG_QUALITY = 0.82;

/**
 * Place a captured canvas onto the PDF at full usable width.
 * If taller than one page, continue on following pages (no width squash).
 */
function addCanvasFullWidthPaginated(pdf, canvas, usableWidth, usableHeight, marginMm, isFirstPage) {
  const fullHeightMm = (canvas.height * usableWidth) / canvas.width;
  const pageSlicePx = Math.max(1, Math.floor((usableHeight / fullHeightMm) * canvas.height));

  let sourceY = 0;
  let pageIndex = 0;

  while (sourceY < canvas.height) {
    const slicePx = Math.min(pageSlicePx, canvas.height - sourceY);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = Math.max(1, Math.ceil(slicePx));
    const ctx = pageCanvas.getContext("2d");
    ctx.fillStyle = "#a1a1a3";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      slicePx,
      0,
      0,
      canvas.width,
      slicePx
    );

    const sliceHeightMm = (slicePx * usableWidth) / canvas.width;
    const imgData = pageCanvas.toDataURL("image/jpeg", JPEG_QUALITY);

    if (!(isFirstPage && pageIndex === 0)) {
      pdf.addPage();
    }
    pdf.addImage(imgData, "JPEG", marginMm, marginMm, usableWidth, sliceHeightMm);

    sourceY += slicePx;
    pageIndex += 1;
  }
}

/**
 * Each element is drawn at full page width (never squashed horizontally).
 * Content taller than one page continues on the next page(s).
 */
export async function captureElementsToPdfBlob(elements, options = {}) {
  const list = (elements || []).filter(Boolean);
  if (list.length === 0) {
    throw new Error("Nothing to capture for PDF.");
  }

  const orientation = options.orientation === "portrait" ? "portrait" : "landscape";
  const marginMm = Number.isFinite(options.marginMm) ? options.marginMm : 0;
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = Math.max(pageWidth - marginMm * 2, 1);
  const usableHeight = Math.max(pageHeight - marginMm * 2, 1);

  for (let i = 0; i < list.length; i++) {
    const canvas = await captureElementToCanvas(list[i]);
    addCanvasFullWidthPaginated(pdf, canvas, usableWidth, usableHeight, marginMm, i === 0);
  }

  return pdf.output("blob");
}
