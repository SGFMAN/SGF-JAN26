/** New Project email routing: From/To come from Email Settings → General → New Project (VIC/QLD by project state). */

import { expandProjectContactTokensInToAddresses } from "./drawingNotifyFrom";
import { generalEmailStateCode, getGeneralNewProjectBranch } from "./emailGeneralSettings";

export const NEW_JOB_DEPOSIT_TYPE = {
  FIVE_PERCENT: "5% Deposit",
  PRE_ENGAGEMENT: "$8,500 Pre-Engagement",
  HOLDING: "$2,000 Holding Deposit",
  OTHER: "Other",
};

const NJ_VIC_INTRO_FULL_5 = "NEW JOB - Client Full Deposit - VIC INTRO - 5%";
const NJ_VIC_INTRO_FULL = "NEW JOB - Client Full Deposit - VIC INTRO";
const NJ_PART = "NEW JOB - Client Part Deposit";
const NJ_QLD_INTRO_FULL_5 = "NEW JOB - Client Full Deposit - QLD INTRO - 5%";
const NJ_QLD_INTRO_FULL = "NEW JOB - Client Full Deposit - QLD INTRO";

function userHasPositionName(user, positionName) {
  if (!user?.positions || !Array.isArray(user.positions)) return false;
  const want = String(positionName ?? "").trim().toLowerCase();
  return user.positions.some((p) => String(p?.name ?? "").trim().toLowerCase() === want);
}

/** True if the user has the regional Sales Manager position for the given VIC / QLD state code. */
export function userIsRegionalSalesManager(user, stateCode) {
  if (!user) return false;
  const st = String(stateCode ?? "").trim().toUpperCase();
  if (st === "QLD") return userHasPositionName(user, "QLD Sales Manager");
  if (st === "VIC") return userHasPositionName(user, "VIC Sales Manager");
  return false;
}

function parseMoneyToInt(value) {
  if (value == null || value === "") return 0;
  return parseInt(String(value).replace(/[^0-9]/g, ""), 10) || 0;
}

function normalizeNewJobDepositType(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (s === NEW_JOB_DEPOSIT_TYPE.FIVE_PERCENT || s === "Full 5%" || s === "5% Deposit") {
    return NEW_JOB_DEPOSIT_TYPE.FIVE_PERCENT;
  }
  if (s === NEW_JOB_DEPOSIT_TYPE.PRE_ENGAGEMENT || s === "$8,500 Pre-Engagement") {
    return NEW_JOB_DEPOSIT_TYPE.PRE_ENGAGEMENT;
  }
  if (s === NEW_JOB_DEPOSIT_TYPE.HOLDING || s === "$2,000 Holding Deposit") {
    return NEW_JOB_DEPOSIT_TYPE.HOLDING;
  }
  if (s === NEW_JOB_DEPOSIT_TYPE.OTHER || s === "Other") {
    return NEW_JOB_DEPOSIT_TYPE.OTHER;
  }
  return s;
}

/** Infer deposit type from stored deposit + project cost when wizard type is unavailable. */
export function inferNewJobDepositTypeFromProject(project) {
  const depositNum = parseMoneyToInt(project?.deposit ?? project?.deposit_paid);
  const costNum = parseMoneyToInt(project?.project_cost);
  if (depositNum === 8500) return NEW_JOB_DEPOSIT_TYPE.PRE_ENGAGEMENT;
  if (depositNum === 2000) return NEW_JOB_DEPOSIT_TYPE.HOLDING;
  if (costNum > 0) {
    const fivePercent = Math.floor(costNum / 20);
    if (depositNum === fivePercent && fivePercent > 0) {
      return NEW_JOB_DEPOSIT_TYPE.FIVE_PERCENT;
    }
  }
  return NEW_JOB_DEPOSIT_TYPE.OTHER;
}

export function resolveNewJobDepositType(project, depositType) {
  const fromArg = normalizeNewJobDepositType(depositType);
  if (fromArg) return fromArg;
  const fromProject = normalizeNewJobDepositType(
    project?.newJobDepositType ?? project?.depositType
  );
  if (fromProject) return fromProject;
  return inferNewJobDepositTypeFromProject(project);
}

/**
 * New job → client email template from project state + deposit type only
 * (salesperson role is ignored for template choice).
 */
export function pickNewJobClientTemplateName(project, depositType) {
  const st = generalEmailStateCode(project);
  const type = resolveNewJobDepositType(project, depositType);

  // Holding + Other: same template for all states
  if (
    type === NEW_JOB_DEPOSIT_TYPE.HOLDING ||
    type === NEW_JOB_DEPOSIT_TYPE.OTHER ||
    (type !== NEW_JOB_DEPOSIT_TYPE.FIVE_PERCENT &&
      type !== NEW_JOB_DEPOSIT_TYPE.PRE_ENGAGEMENT)
  ) {
    return NJ_PART;
  }

  if (st === "QLD") {
    if (type === NEW_JOB_DEPOSIT_TYPE.FIVE_PERCENT) return NJ_QLD_INTRO_FULL_5;
    return NJ_QLD_INTRO_FULL; // Pre-Engagement
  }

  // VIC (and any other/unknown state)
  if (type === NEW_JOB_DEPOSIT_TYPE.FIVE_PERCENT) return NJ_VIC_INTRO_FULL_5;
  return NJ_VIC_INTRO_FULL; // Pre-Engagement
}

/** Match `salespersonName` to a user in an already-fetched `/api/users` list. */
export function findSalespersonUserInList(users, salespersonName) {
  const sp = String(salespersonName ?? "").trim();
  if (!sp || !Array.isArray(users)) return null;
  return (
    users.find((u) => String(u.name ?? "").trim() === sp) ||
    users.find((u) => String(u.name ?? "").trim().toLowerCase() === sp.toLowerCase()) ||
    null
  );
}

/** Match `project.salesperson` to a Users API record (exact name, then case-insensitive). */
export async function findSalespersonUserFromApi(salespersonName, apiBaseUrl = "") {
  const base = apiBaseUrl == null ? "" : String(apiBaseUrl);
  const sp = String(salespersonName ?? "").trim();
  if (!sp) return null;
  try {
    const res = await fetch(`${base}/api/users`);
    if (!res.ok) return null;
    const users = await res.json();
    return findSalespersonUserInList(users, sp);
  } catch {
    return null;
  }
}

function uniqueTrimmed(list) {
  const seen = new Set();
  const out = [];
  for (const e of list || []) {
    const t = String(e ?? "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function coerceTeamEmailToList(np) {
  const raw = np?.teamEmailTo;
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return uniqueTrimmed(raw.map((x) => String(x ?? "").trim()));
  }
  const s = String(raw).trim();
  if (!s) return [];
  return uniqueTrimmed(s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean));
}

/** @returns {{ streamKey: null, newProject: object }} — `streamKey` kept for older call sites. */
export function getStreamNewProjectRow(settings, project) {
  const np = getGeneralNewProjectBranch(settings, project);
  return { streamKey: null, newProject: np };
}

/**
 * Regional role for Sales Manager vs Other: matches `getGeneralNewProjectBranch` (QLD column iff state is QLD;
 * otherwise vic column → VIC regional roles).
 */
function newProjectRegionalRoleStateCode(project) {
  return generalEmailStateCode(project) === "QLD" ? "QLD" : "VIC";
}

/**
 * New Project team internal From: Sales Manager vs Other buckets (per VIC/QLD branch), with legacy `teamEmailFrom` fallback.
 * Pass `salespersonUser` from `/api/users` when available so manager vs other is resolved correctly.
 */
export function resolveNewProjectTeamFrom(settings, project, salespersonUser) {
  const np = getGeneralNewProjectBranch(settings, project);
  const base = np.teamEmailFrom != null ? String(np.teamEmailFrom).trim() : "";
  const mgr =
    np.teamEmailFromSalesManager != null ? String(np.teamEmailFromSalesManager).trim() : "";
  const oth = np.teamEmailFromOther != null ? String(np.teamEmailFromOther).trim() : "";
  const roleState = newProjectRegionalRoleStateCode(project);

  if (salespersonUser) {
    const chosen = userIsRegionalSalesManager(salespersonUser, roleState) ? mgr : oth;
    if (chosen) return chosen;
    return base;
  }

  // No matched user: still use configured buckets (Other then Sales Manager) before legacy From.
  if (oth) return oth;
  if (mgr) return mgr;
  return base;
}

/** Team internal “To” list from General New Project only. */
export function resolveNewProjectTeamToEmailsFromStream(settings, project) {
  const np = getGeneralNewProjectBranch(settings, project);
  return coerceTeamEmailToList(np);
}

/**
 * New Project client From: Sales Manager vs Other buckets (per VIC/QLD branch), with legacy `clientEmailFrom` fallback.
 * Pass `salespersonUser` from `/api/users` when available so manager vs other is resolved correctly.
 */
export function resolveNewProjectClientFrom(settings, project, salespersonUser) {
  const np = getGeneralNewProjectBranch(settings, project);
  const base = np.clientEmailFrom != null ? String(np.clientEmailFrom).trim() : "";
  const mgr =
    np.clientEmailFromSalesManager != null ? String(np.clientEmailFromSalesManager).trim() : "";
  const oth = np.clientEmailFromOther != null ? String(np.clientEmailFromOther).trim() : "";
  const roleState = newProjectRegionalRoleStateCode(project);

  if (salespersonUser) {
    const chosen = userIsRegionalSalesManager(salespersonUser, roleState) ? mgr : oth;
    if (chosen) return chosen;
    return base;
  }
  return base;
}

/** Client “To” from General (`{Contact1}` etc.) or []. */
export function resolveNewProjectClientToEmails(settings, project) {
  const np = getGeneralNewProjectBranch(settings, project);
  const token = np.clientEmailTo != null ? String(np.clientEmailTo).trim() : "";
  if (!token) return [];
  return expandProjectContactTokensInToAddresses([token], project);
}

/** Placeholder project for Stream Settings email preview (no API). */
export function buildSampleProjectForStreamPreview(streamKey) {
  const qld = typeof streamKey === "string" && / - QLD$/i.test(streamKey);
  return {
    stream: streamKey,
    state: qld ? "QLD" : "VIC",
    name: "45 Example Street, Previewville",
    street: "45 Example Street",
    suburb: "Previewville",
    client_name: "Alex Preview",
    client1_name: "Alex Preview",
    client1_email: "client.preview@example.com",
    client1_active: "true",
    email: "client.preview@example.com",
    salesperson: "Sample Salesperson",
    draftsperson: "Sample Draftsperson",
    project_cost: 500000,
    deposit: Math.floor(500000 / 20),
  };
}

export function buildSampleProjectPartialDeposit(streamKey) {
  return { ...buildSampleProjectForStreamPreview(streamKey), deposit: 1000 };
}
