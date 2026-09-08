import {
  isDraftspersonAssigned,
  normalizeDraftspersonField,
} from "./draftspersonSentinel.js";

function positionName(position) {
  return String(position?.name || "").trim().toLowerCase();
}

function userPositions(user) {
  return Array.isArray(user?.positions) ? user.positions : [];
}

/** Users who can appear in Draftsperson dropdowns. */
export function userHasDraftspersonPosition(user) {
  return userPositions(user).some((position) => {
    const name = positionName(position);
    return (
      name === "architectural draftsperson" ||
      name === "architectural graduate" ||
      name.includes("architectural draftsperson") ||
      name.includes("architectural graduate")
    );
  });
}

export function filterDraftspersonUsers(users) {
  return (Array.isArray(users) ? users : []).filter(userHasDraftspersonPosition);
}

function firstName(full) {
  return String(full || "")
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) grid[i][0] = i;
  for (let j = 0; j < cols; j += 1) grid[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,
        grid[i][j - 1] + 1,
        grid[i - 1][j - 1] + cost
      );
    }
  }
  return grid[a.length][b.length];
}

/**
 * Map a stored project draftsperson (full name, first name, or close typo)
 * onto a user from the dropdown list.
 */
export function findDraftspersonUser(raw, users) {
  const stored = normalizeDraftspersonField(raw);
  if (!isDraftspersonAssigned(stored)) return null;
  const list = Array.isArray(users) ? users : [];
  const lower = stored.toLowerCase();

  const exact = list.find((user) => String(user?.name || "").trim().toLowerCase() === lower);
  if (exact) return exact;

  const firstHits = list.filter((user) => firstName(user?.name) === lower);
  if (firstHits.length === 1) return firstHits[0];

  const fuzzy = list.filter((user) => {
    const fn = firstName(user?.name);
    if (!fn || Math.abs(fn.length - lower.length) > 1) return false;
    return levenshtein(fn, lower) <= 1;
  });
  if (fuzzy.length === 1) return fuzzy[0];
  return null;
}

/** Value that matches a `<select>` option (`users.name`). */
export function canonicalDraftspersonName(raw, users) {
  const stored = normalizeDraftspersonField(raw);
  const user = findDraftspersonUser(stored, users);
  return user?.name ? String(user.name) : stored;
}

/** Assigned name that is not in the dropdown list, so it can still display. */
export function unmatchedDraftspersonOption(raw, users) {
  const stored = normalizeDraftspersonField(raw);
  if (!isDraftspersonAssigned(stored)) return null;
  if (findDraftspersonUser(stored, users)) return null;
  return stored;
}
