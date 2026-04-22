/**
 * Canonical value stored in `projects.draftsperson` when no person is assigned.
 * Keep in sync with `backend/draftspersonConstants.js`.
 */
export const DRAFTSPERSON_UNASSIGNED = "Select draftsperson...";

const SENTINEL_LOWER = DRAFTSPERSON_UNASSIGNED.toLowerCase();

/** Values treated as “no draftsperson” (pre-migration text or UI placeholders). */
const UNASSIGNED_ALIASES = new Set([
  "",
  SENTINEL_LOWER,
  "select draftsperson",
  "select draftsperson...",
  "unassigned",
  "unasigned",
  "none",
]);

/** Normalize for UI state: never null/undefined — use sentinel for empty. */
export function normalizeDraftspersonField(raw) {
  if (raw == null) return DRAFTSPERSON_UNASSIGNED;
  const s = String(raw).trim();
  if (s === "" || UNASSIGNED_ALIASES.has(s.toLowerCase())) return DRAFTSPERSON_UNASSIGNED;
  return s;
}

/** True when a real person is assigned (not the sentinel / blank / legacy placeholders). */
export function isDraftspersonAssigned(raw) {
  const s = (raw ?? "").toString().trim().toLowerCase();
  if (!s) return false;
  return !UNASSIGNED_ALIASES.has(s);
}
