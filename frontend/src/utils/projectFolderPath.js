const API_URL = "";

const UNICODE_ADDRESS_DASHES = /[\u2013\u2014\u2212]/g;
const WIN_FILENAME_ILLEGAL_CHARS = /[<>:"/\\|?*]/g;

/** En dash / em dash / Unicode minus → ASCII hyphen (must match backend job folder naming). */
export function normalizeAddressHyphensForFilesystem(s) {
  if (s == null || s === "") return "";
  return String(s).replace(UNICODE_ADDRESS_DASHES, "-");
}

/** Leaf folder segment: `SUBURB - street` with ASCII hyphen between parts + Windows-safe sanitise. */
export function buildJobFolderNameSegment(suburb, street) {
  const sub = normalizeAddressHyphensForFilesystem(suburb || "").toUpperCase();
  const st = normalizeAddressHyphensForFilesystem(street || "");
  return `${sub} - ${st}`.replace(WIN_FILENAME_ILLEGAL_CHARS, "_");
}

/** YYYY from project `year` (date string or year-only). */
export function folderYearFromProjectYear(y) {
  if (y == null || y === "") return new Date().getFullYear().toString();
  const s = String(y).trim();
  if (s.includes("-")) return s.split("-")[0];
  if (/^\d{4}$/.test(s)) return s;
  return new Date().getFullYear().toString();
}

/**
 * Absolute job folder path (same layout as new-project folder step), using the project's
 * stored year so it matches folders already on disk.
 */
export async function computeProjectFolderPathFromRecord(project) {
  if (!project) return "";
  try {
    const settingsResponse = await fetch(`${API_URL}/api/settings`);
    if (!settingsResponse.ok) return "";
    const settings = await settingsResponse.json();
    const state = (project.state || "").toUpperCase();
    let rootDir = "";
    if (state === "VIC") {
      rootDir = settings.root_directory || "";
    } else if (state === "QLD") {
      rootDir = settings.root_directory_qld || settings.root_directory || "";
    } else {
      rootDir = settings.root_directory || "";
    }
    if (!rootDir || !state) return "";

    const projectYear = folderYearFromProjectYear(project.year);
    const projectFolderName = buildJobFolderNameSegment(project.suburb, project.street);
    const suburbPart = normalizeAddressHyphensForFilesystem(project.suburb || "").toUpperCase();
    const streetPart = normalizeAddressHyphensForFilesystem(project.street || "");
    if (!suburbPart.trim() || !streetPart.trim()) return "";

    return `${rootDir}\\${projectYear}\\${state}\\${projectFolderName}`;
  } catch {
    return "";
  }
}
