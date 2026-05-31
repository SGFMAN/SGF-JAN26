export const SECRET_AREA_PROJECT_NAME = "12 Mumm St, Waurn Ponds, VIC";
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
  const target = normalizeProjectName(SECRET_AREA_PROJECT_NAME);
  const candidates = [getProjectDisplayName(project), project?.name];
  return candidates.some((c) => normalizeProjectName(c) === target);
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
