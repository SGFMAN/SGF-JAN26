/** Settings → Email Settings → General (`settings.email_general_json`). */

const T = (v) => (v == null ? "" : String(v).trim());

const EMPTY_HOTLIST = {
  soldFromEmail: "",
  soldToEmail: "",
  qldSoldFromEmail: "",
  qldSoldToEmail: "",
};

const EMPTY_WINDOWS = {
  vicFromEmail: "",
  vicToEmail1: "",
  vicToEmail2: "",
  vicToEmail3: "",
  qldFromEmail: "",
  qldToEmail1: "",
  qldToEmail2: "",
  qldToEmail3: "",
};

const EMPTY_DEPOSIT_BALANCE_BRANCH = {
  clientFromEmail: "",
  teamFromEmail: "",
  teamToEmail: "",
};

const NEW_PROJECT_CLIENT_TO_TOKEN = "{Contact1}";

function uniqueTrimmedEmails(list) {
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

/** Legacy `teamEmailTo`: string[] or comma/newline-separated string. */
export function coerceNewProjectTeamEmailToArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x ?? "").trim());
  const s = String(raw).trim();
  if (!s) return [];
  return uniqueTrimmedEmails(s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean));
}

/** Saved addresses only (no blank draft rows). */
export function newProjectTeamEmailToForPersist(raw) {
  return coerceNewProjectTeamEmailToArray(raw).filter((e) => e.length > 0);
}

/** Strip empty team To rows before writing `email_general_json`. */
export function emailGeneralJsonForPersist(eg) {
  if (!eg || typeof eg !== "object" || Array.isArray(eg)) return eg;
  const np = eg.newProject;
  if (!np || typeof np !== "object" || Array.isArray(np)) return eg;
  const stripBranch = (b) => {
    if (!b || typeof b !== "object" || Array.isArray(b)) return b;
    return { ...b, teamEmailTo: newProjectTeamEmailToForPersist(b.teamEmailTo) };
  };
  return {
    ...eg,
    newProject: {
      ...np,
      vic: stripBranch(np.vic && typeof np.vic === "object" ? np.vic : {}),
      qld: stripBranch(np.qld && typeof np.qld === "object" ? np.qld : {}),
    },
  };
}

/** Normalize one VIC or QLD New Project branch (same rules as legacy stream rows). */
export function normalizeNewProjectBranchFromRaw(npRaw) {
  const base = {
    clientEmailFrom: "",
    clientEmailFromSalesManager: "",
    clientEmailFromOther: "",
    clientEmailTo: "",
    teamEmailFrom: "",
    teamEmailFromSalesManager: "",
    teamEmailFromOther: "",
    teamEmailTo: [],
  };
  const np = {
    ...base,
    ...(npRaw && typeof npRaw === "object" && !Array.isArray(npRaw) ? npRaw : {}),
  };
  const trim = (v) => (v == null ? "" : String(v).trim());
  if (!trim(np.clientEmailFrom) && np.emailToClientFullDeposit != null) {
    np.clientEmailFrom = String(np.emailToClientFullDeposit || "").trim();
  }
  if (!trim(np.clientEmailTo) && np.emailToClientPartialDeposit != null) {
    np.clientEmailTo = String(np.emailToClientPartialDeposit || "").trim();
  }
  const teamToEmpty =
    np.teamEmailTo == null ||
    (Array.isArray(np.teamEmailTo) && np.teamEmailTo.length === 0) ||
    (typeof np.teamEmailTo === "string" && !String(np.teamEmailTo).trim());
  if (teamToEmpty && np.emailToTeam != null) {
    np.teamEmailTo = String(np.emailToTeam || "").trim();
  }
  const c = String(np.clientEmailTo ?? "").trim();
  return {
    clientEmailFrom: trim(np.clientEmailFrom),
    clientEmailFromSalesManager: trim(np.clientEmailFromSalesManager),
    clientEmailFromOther: trim(np.clientEmailFromOther),
    clientEmailTo: c ? NEW_PROJECT_CLIENT_TO_TOKEN : "",
    teamEmailFrom: trim(np.teamEmailFrom),
    teamEmailFromSalesManager: trim(np.teamEmailFromSalesManager),
    teamEmailFromOther: trim(np.teamEmailFromOther),
    teamEmailTo: coerceNewProjectTeamEmailToArray(np.teamEmailTo),
  };
}

function emptyNewProjectBranch() {
  return normalizeNewProjectBranchFromRaw({});
}

function emptyDepositBalanceBranch() {
  return normalizeDepositBalanceBranch({});
}

export function normalizeDepositBalanceBranch(raw) {
  const trim = (v) => (v == null ? "" : String(v).trim());
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    clientFromEmail: trim(b.clientFromEmail),
    teamFromEmail: trim(b.teamFromEmail),
    teamToEmail: trim(b.teamToEmail),
  };
}

/** Deposit Balance email fields for this project (VIC vs QLD from project state). */
export function getGeneralDepositBalanceBranch(settings, project) {
  const eg = parseEmailGeneralJson(settings?.email_general_json);
  const key = generalEmailStateCode(project) === "QLD" ? "qld" : "vic";
  return normalizeDepositBalanceBranch(eg.depositBalance?.[key]);
}

/** True when both VIC and QLD branches have no configured addresses (migration not done / fresh). */
export function isGeneralNewProjectConfigEmpty(parsedGeneral) {
  const np = parsedGeneral?.newProject;
  if (!np || typeof np !== "object") return true;
  const isEmpty = (b) => {
    if (!b || typeof b !== "object") return true;
    const t = (v) => (v == null ? "" : String(v).trim());
    const to = coerceNewProjectTeamEmailToArray(b.teamEmailTo);
    return (
      !t(b.clientEmailFrom) &&
      !t(b.clientEmailFromSalesManager) &&
      !t(b.clientEmailFromOther) &&
      !t(b.clientEmailTo) &&
      !t(b.teamEmailFrom) &&
      !t(b.teamEmailFromSalesManager) &&
      !t(b.teamEmailFromOther) &&
      to.length === 0
    );
  };
  return isEmpty(np.vic) && isEmpty(np.qld);
}

/** New Project email fields for this project (VIC vs QLD branch from General, not stream). */
export function getGeneralNewProjectBranch(settings, project) {
  const eg = parseEmailGeneralJson(settings?.email_general_json);
  const code = generalEmailStateCode(project);
  const key = code === "QLD" ? "qld" : "vic";
  const raw = eg.newProject?.[key];
  return normalizeNewProjectBranchFromRaw(raw && typeof raw === "object" ? raw : {});
}

/** VIC / QLD from project `state` only (not stream). Used for all General email settings. */
export function generalEmailStateCode(project) {
  const s = String(project?.state ?? "").trim().toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return "";
}

export function parseEmailGeneralJson(raw) {
  const base = {
    hotList: { ...EMPTY_HOTLIST },
    windows: { ...EMPTY_WINDOWS },
    newProject: { vic: emptyNewProjectBranch(), qld: emptyNewProjectBranch() },
    depositBalance: { vic: emptyDepositBalanceBranch(), qld: emptyDepositBalanceBranch() },
  };
  if (raw == null || raw === "") return base;
  let o = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return base;
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return base;
  const hl = o.hotList && typeof o.hotList === "object" && !Array.isArray(o.hotList) ? o.hotList : {};
  const wd = o.windows && typeof o.windows === "object" && !Array.isArray(o.windows) ? o.windows : {};
  const npRoot = o.newProject && typeof o.newProject === "object" && !Array.isArray(o.newProject) ? o.newProject : {};
  const dbRoot =
    o.depositBalance && typeof o.depositBalance === "object" && !Array.isArray(o.depositBalance)
      ? o.depositBalance
      : {};
  const vicFrom = T(hl.soldFromEmail);
  const vicTo = T(hl.soldToEmail);
  const qldFrom = T(hl.qldSoldFromEmail);
  const qldTo = T(hl.qldSoldToEmail);
  const vicWindowsFrom = T(wd.vicFromEmail);
  const vicWindowsTo1 = T(wd.vicToEmail1);
  const vicWindowsTo2 = T(wd.vicToEmail2);
  const vicWindowsTo3 = T(wd.vicToEmail3);
  const qldWindowsFrom = T(wd.qldFromEmail);
  const qldWindowsTo1 = T(wd.qldToEmail1);
  const qldWindowsTo2 = T(wd.qldToEmail2);
  const qldWindowsTo3 = T(wd.qldToEmail3);
  return {
    ...o,
    hotList: {
      soldFromEmail: vicFrom,
      soldToEmail: vicTo,
      qldSoldFromEmail: qldFrom,
      qldSoldToEmail: qldTo,
    },
    windows: {
      vicFromEmail: vicWindowsFrom,
      vicToEmail1: vicWindowsTo1,
      vicToEmail2: vicWindowsTo2,
      vicToEmail3: vicWindowsTo3,
      qldFromEmail: qldWindowsFrom,
      qldToEmail1: qldWindowsTo1,
      qldToEmail2: qldWindowsTo2,
      qldToEmail3: qldWindowsTo3,
    },
    newProject: {
      vic: normalizeNewProjectBranchFromRaw(npRoot.vic),
      qld: normalizeNewProjectBranchFromRaw(npRoot.qld),
    },
    depositBalance: {
      vic: normalizeDepositBalanceBranch(dbRoot.vic),
      qld: normalizeDepositBalanceBranch(dbRoot.qld),
    },
  };
}

export function resolveHotlistSoldFromEmail(settings, project) {
  const hl = parseEmailGeneralJson(settings?.email_general_json).hotList;
  const code = generalEmailStateCode(project);
  if (code === "QLD") return hl.qldSoldFromEmail || "";
  if (code === "VIC") return hl.soldFromEmail || "";
  return "";
}

export function resolveHotlistSoldToEmail(settings, project) {
  const hl = parseEmailGeneralJson(settings?.email_general_json).hotList;
  const code = generalEmailStateCode(project);
  if (code === "QLD") return hl.qldSoldToEmail || "";
  if (code === "VIC") return hl.soldToEmail || "";
  return "";
}

/** Active Client Info contacts (client1–3 ticked) with non-empty email. */
export function resolveActiveClientContactToEmails(project) {
  if (!project || typeof project !== "object") return [];
  const seen = new Set();
  const out = [];
  const add = (active, email) => {
    if (String(active || "").toLowerCase() !== "true") return;
    const e = email == null ? "" : String(email).trim();
    if (!e) return;
    const k = e.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(e);
  };
  add(project.client1_active, project.client1_email);
  add(project.client2_active, project.client2_email);
  add(project.client3_active, project.client3_email);
  return out;
}

export function resolveDepositBalanceClientFrom(settings, project) {
  return getGeneralDepositBalanceBranch(settings, project).clientFromEmail || "";
}

export function resolveDepositBalanceTeamFrom(settings, project) {
  return getGeneralDepositBalanceBranch(settings, project).teamFromEmail || "";
}

export function resolveDepositBalanceTeamTo(settings, project) {
  return getGeneralDepositBalanceBranch(settings, project).teamToEmail || "";
}
