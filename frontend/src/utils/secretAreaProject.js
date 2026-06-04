/** Project that unlocks the secret area from Planning → Trade Certificates. */
export const SECRET_AREA_PROJECT_ALIASES = [
  "18 Kipling Avenue, Mooroolbark, VIC",
  "MOOROOLBARK - 18 Kipling Avenue",
];

/** @deprecated Use SECRET_AREA_PROJECT_ALIASES — kept for any external references */
export const SECRET_AREA_PROJECT_NAME = SECRET_AREA_PROJECT_ALIASES[0];
export const SECRET_AREA_SESSION_KEY = "sgf_secret_area_unlocked";

function normalizeProjectName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function getProjectDisplayName(project) {
  if (!project) return "";
  const parts = [project.street, project.suburb, project.state]
    .map((s) => (s == null ? "" : String(s).trim()))
    .filter(Boolean);
  if (parts.length) return parts.join(", ");
  return String(project.name || "").trim();
}

export function isSecretAreaProject(project) {
  const targets = SECRET_AREA_PROJECT_ALIASES.map((a) => normalizeProjectName(a));
  const candidates = [getProjectDisplayName(project), project?.name];
  if (candidates.some((c) => targets.includes(normalizeProjectName(c)))) {
    return true;
  }
  const blob = normalizeProjectName(candidates.filter(Boolean).join(" "));
  return blob.includes("18") && blob.includes("KIPLING") && blob.includes("MOOROOLBARK");
}

export function unlockSecretAreaSession() {
  try {
    sessionStorage.setItem(SECRET_AREA_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isSecretAreaSessionUnlocked() {
  try {
    return sessionStorage.getItem(SECRET_AREA_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function lockSecretAreaSession() {
  try {
    sessionStorage.removeItem(SECRET_AREA_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
