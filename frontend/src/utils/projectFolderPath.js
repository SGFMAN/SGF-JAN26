const API_URL = "";

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
    const suburb = (project.suburb || "").toUpperCase().replace(/[/\\]/g, "_");
    const street = (project.street || "").replace(/[/\\]/g, "_");
    if (!suburb || !street) return "";

    return `${rootDir}\\${projectYear}\\${state}\\${suburb} - ${street}`;
  } catch {
    return "";
  }
}
