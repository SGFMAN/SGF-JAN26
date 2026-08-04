/**
 * Canonical value stored in `projects.draftsperson` when no person is assigned.
 * Keep in sync with `frontend/src/utils/draftspersonSentinel.js`.
 */
const DRAFTSPERSON_UNASSIGNED = "Select draftsperson...";

const UNASSIGNED_ALIASES = new Set([
  "",
  DRAFTSPERSON_UNASSIGNED.toLowerCase(),
  "select draftsperson",
  "select draftsperson...",
  "unassigned",
  "unasigned",
  "none",
]);

/** True when a real person is assigned (not sentinel / blank / legacy placeholders). */
function isDraftspersonAssigned(raw) {
  const s = (raw ?? "").toString().trim().toLowerCase();
  if (!s) return false;
  return !UNASSIGNED_ALIASES.has(s);
}

module.exports.DRAFTSPERSON_UNASSIGNED = DRAFTSPERSON_UNASSIGNED;
module.exports.isDraftspersonAssigned = isDraftspersonAssigned;
