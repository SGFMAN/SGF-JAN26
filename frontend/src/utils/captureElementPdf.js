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

function addCanvasToPdfPage(pdf, canvas, pageWidth, pageHeight, isFirstPage) {
  const imgData = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  if (!isFirstPage) {
    pdf.addPage();
  }

  if (imgHeight <= pageHeight) {
    pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, imgHeight);
    return;
  }

  const scaledWidth = (canvas.width * pageHeight) / canvas.height;
  pdf.addImage(imgData, "JPEG", 0, 0, scaledWidth, pageHeight);
}

/**
 * Renders a DOM element to a multi-page A4 PDF (paginated vertically) and returns a Blob.
 * Slices the capture into page-sized canvas chunks so content is not clipped at page edges.
 */
export async function captureElementToPaginatedPdfBlob(element, options = {}) {
  if (!element) {
    throw new Error("Nothing to capture for PDF.");
  }

  const orientation = options.orientation === "portrait" ? "portrait" : "landscape";
  const marginMm = Number.isFinite(options.marginMm) ? options.marginMm : 10;
  const canvas = await captureElementToCanvas(element);
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = Math.max(pageWidth - marginMm * 2, 1);
  const usableHeight = Math.max(pageHeight - marginMm * 2, 1);

  // Full image size if drawn at page content width
  const fullImgHeightMm = (canvas.height * usableWidth) / canvas.width;
  // How many source pixels fit in one page of usable height
  const pageSlicePx = Math.max(1, Math.floor((usableHeight / fullImgHeightMm) * canvas.height));

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

    if (pageIndex > 0) {
      pdf.addPage();
    }
    pdf.addImage(imgData, "JPEG", marginMm, marginMm, usableWidth, sliceHeightMm);

    sourceY += slicePx;
    pageIndex += 1;
  }

  return pdf.output("blob");
}

/**
 * Renders a DOM element to a multi-page landscape A4 PDF and returns base64 (no data: prefix).
 */
export async function captureElementToPdfBase64(element) {
  const blob = await captureElementToPaginatedPdfBlob(element, { orientation: "landscape" });
  const dataUri = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read PDF blob."));
    reader.readAsDataURL(blob);
  });
  return dataUri.includes(",") ? dataUri.split(",")[1] : dataUri;
}

/**
 * Each element becomes exactly one landscape A4 page in the PDF.
 */
export async function captureElementsToPdfBlob(elements) {
  const list = (elements || []).filter(Boolean);
  if (list.length === 0) {
    throw new Error("Nothing to capture for PDF.");
  }

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < list.length; i++) {
    const canvas = await captureElementToCanvas(list[i]);
    addCanvasToPdfPage(pdf, canvas, pageWidth, pageHeight, i === 0);
  }

  return pdf.output("blob");
}
