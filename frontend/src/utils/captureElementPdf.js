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
 * Renders a DOM element to a multi-page landscape A4 PDF and returns base64 (no data: prefix).
 */
export async function captureElementToPdfBase64(element) {
  if (!element) {
    throw new Error("Nothing to capture for PDF.");
  }

  const canvas = await captureElementToCanvas(element);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgData = canvas.toDataURL("image/png");
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  const dataUri = pdf.output("datauristring");
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
