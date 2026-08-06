import * as XLSX from "xlsx";

function sanitizeExcelFileName(name) {
  const raw = String(name || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ");
  const withoutExt = raw.replace(/\.(xlsx|pdf)$/i, "").trim();
  return withoutExt || "Projects-Overview";
}

function ensureXlsxExtension(name) {
  const base = sanitizeExcelFileName(name);
  return `${base}.xlsx`;
}

function ensurePdfExtension(name) {
  const base = sanitizeExcelFileName(name);
  return `${base}.pdf`;
}

function stateSheetRows(summary) {
  const rows = [["Stage", "Project", "On Hold", "Value"]];
  for (const stage of summary?.stages || []) {
    if (!stage.projects?.length) {
      rows.push([stage.label, "(none)", "", 0]);
      continue;
    }
    for (const p of stage.projects) {
      rows.push([stage.label, p.label, p.onHold ? "Yes" : "", p.value || 0]);
    }
  }
  rows.push([]);
  rows.push([
    "TOTAL",
    `${summary?.total ?? 0} jobs${summary?.onHoldTotal ? ` (${summary.onHoldTotal} on hold)` : ""}`,
    "",
    summary?.valueTotal ?? 0,
  ]);
  return rows;
}

/** Build an .xlsx ArrayBuffer with VIC and QLD sheets from overview list data. */
export function buildProjectsOverviewWorkbookArrayBuffer(overview) {
  const wb = XLSX.utils.book_new();

  for (const state of ["VIC", "QLD"]) {
    const rows = stateSheetRows(overview?.[state]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 22 }, { wch: 42 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, state);
  }

  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

function downloadBlobFallback(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Save workbook bytes. Prefer File System Access API (pick folder + name),
 * otherwise trigger a normal browser download.
 * @returns {"saved"|"cancelled"|"downloaded"}
 */
export async function saveProjectsOverviewExcelFile(arrayBuffer, suggestedFileName) {
  const filename = ensureXlsxExtension(suggestedFileName);
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "Excel workbook",
            accept: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (err) {
      if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) {
        return "cancelled";
      }
      console.warn("showSaveFilePicker failed, falling back to download:", err);
    }
  }

  downloadBlobFallback(blob, filename);
  return "downloaded";
}

/**
 * Save a PDF blob. Prefer File System Access API, otherwise download.
 * @returns {"saved"|"cancelled"|"downloaded"}
 */
export async function saveProjectsOverviewPdfFile(pdfBlob, suggestedFileName) {
  const filename = ensurePdfExtension(suggestedFileName);
  const blob =
    pdfBlob instanceof Blob
      ? pdfBlob
      : new Blob([pdfBlob], { type: "application/pdf" });

  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "PDF document",
            accept: {
              "application/pdf": [".pdf"],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (err) {
      if (err && (err.name === "AbortError" || err.name === "NotAllowedError")) {
        return "cancelled";
      }
      console.warn("showSaveFilePicker failed, falling back to download:", err);
    }
  }

  downloadBlobFallback(blob, filename);
  return "downloaded";
}

export { sanitizeExcelFileName, ensureXlsxExtension, ensurePdfExtension };
