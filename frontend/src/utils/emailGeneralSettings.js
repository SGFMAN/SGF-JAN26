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

/** Normalize a Client Email — To selection to `{Contact1|2|3}` or "". */
export function normalizeNewProjectClientToToken(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const key = s.toLowerCase();
  if (key === "{contact1}" || key === "contact1") return "{Contact1}";
  if (key === "{contact2}" || key === "contact2") return "{Contact2}";
  if (key === "{contact3}" || key === "contact3") return "{Contact3}";
  // Legacy: previous truthy To values were Contact1-only
  return NEW_PROJECT_CLIENT_TO_TOKEN;
}

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
    clientEmailTo2: "",
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
  // Single Client/Team From: prefer explicit From, else migrate from old Sales Manager / Other buckets
  const clientFrom =
    trim(np.clientEmailFrom) ||
    trim(np.clientEmailFromSalesManager) ||
    trim(np.clientEmailFromOther);
  const teamFrom =
    trim(np.teamEmailFrom) ||
    trim(np.teamEmailFromSalesManager) ||
    trim(np.teamEmailFromOther);
  return {
    clientEmailFrom: clientFrom,
    clientEmailFromSalesManager: trim(np.clientEmailFromSalesManager),
    clientEmailFromOther: trim(np.clientEmailFromOther),
    clientEmailTo: normalizeNewProjectClientToToken(np.clientEmailTo),
    // Second To is an SMTP From-list address (literal email), not a contact token
    clientEmailTo2: trim(np.clientEmailTo2),
    teamEmailFrom: teamFrom,
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

export function normalizeDrawingsUploadBranch(raw) {
  const trim = (v) => (v == null ? "" : String(v).trim());
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    fromEmail: trim(b.fromEmail),
    toDesignEmail: trim(b.toDesignEmail),
    toDesignEmail2: trim(b.toDesignEmail2),
    toCrmEmail: trim(b.toCrmEmail),
    toCrmEmail2: trim(b.toCrmEmail2),
    toConstructionEmail: trim(b.toConstructionEmail),
    toConstructionEmail2: trim(b.toConstructionEmail2),
    toConstructionEmail3: trim(b.toConstructionEmail3),
    toConstructionEmail4: trim(b.toConstructionEmail4),
  };
}

function emptyDrawingsUploadBranch() {
  return normalizeDrawingsUploadBranch({});
}

/**
 * Map legacy per-stream `drawings` keys into a General Drawings Upload branch.
 * @param {Record<string, unknown> | null | undefined} drawings
 * @param {"vic" | "qld"} region
 */
export function drawingsUploadBranchFromStreamDrawings(drawings, region) {
  const d = drawings && typeof drawings === "object" && !Array.isArray(drawings) ? drawings : {};
  const trim = (v) => (v == null ? "" : String(v).trim());
  if (region === "qld") {
    return normalizeDrawingsUploadBranch({
      fromEmail: trim(d.qldDesignToSalespersonFromEmail) || trim(d.designToSalespersonFromEmail),
      toDesignEmail: trim(d.qldDesignToSalespersonToEmail) || trim(d.designToSalespersonToEmail),
      toDesignEmail2: trim(d.qldDesignToSalespersonToEmail2) || trim(d.designToSalespersonToEmail2),
      toCrmEmail: trim(d.qldDesignToSalespersonCrmToEmail) || trim(d.designToSalespersonCrmToEmail),
      toConstructionEmail:
        trim(d.qldDesignToSalespersonConstructionToEmail) ||
        trim(d.designToSalespersonConstructionToEmail),
      toConstructionEmail2:
        trim(d.qldDesignToSalespersonConstructionToEmail2) ||
        trim(d.designToSalespersonConstructionToEmail2),
      toConstructionEmail3:
        trim(d.qldDesignToSalespersonConstructionToEmail3) ||
        trim(d.designToSalespersonConstructionToEmail3),
      toConstructionEmail4:
        trim(d.qldDesignToSalespersonConstructionToEmail4) ||
        trim(d.designToSalespersonConstructionToEmail4),
    });
  }
  return normalizeDrawingsUploadBranch({
    fromEmail: trim(d.designToSalespersonFromEmail),
    toDesignEmail: trim(d.designToSalespersonToEmail),
    toDesignEmail2: trim(d.designToSalespersonToEmail2),
    toCrmEmail: trim(d.designToSalespersonCrmToEmail),
    toConstructionEmail: trim(d.designToSalespersonConstructionToEmail),
    toConstructionEmail2: trim(d.designToSalespersonConstructionToEmail2),
    toConstructionEmail3: trim(d.designToSalespersonConstructionToEmail3),
    toConstructionEmail4: trim(d.designToSalespersonConstructionToEmail4),
  });
}

function isDrawingsUploadBranchEmpty(b) {
  if (!b || typeof b !== "object") return true;
  const n = normalizeDrawingsUploadBranch(b);
  return !(
    n.fromEmail ||
    n.toDesignEmail ||
    n.toDesignEmail2 ||
    n.toCrmEmail ||
    n.toCrmEmail2 ||
    n.toConstructionEmail ||
    n.toConstructionEmail2 ||
    n.toConstructionEmail3 ||
    n.toConstructionEmail4
  );
}

/** True when both VIC and QLD Drawings Upload branches are empty (migration not done / fresh). */
export function isGeneralDrawingsUploadConfigEmpty(parsedGeneral) {
  const root = parsedGeneral?.drawingsUpload;
  if (!root || typeof root !== "object") return true;
  return isDrawingsUploadBranchEmpty(root.vic) && isDrawingsUploadBranchEmpty(root.qld);
}

/** Deposit Balance email fields for this project (VIC vs QLD from project state). */
export function getGeneralDepositBalanceBranch(settings, project) {
  const eg = parseEmailGeneralJson(settings?.email_general_json);
  const key = generalEmailStateCode(project) === "QLD" ? "qld" : "vic";
  return normalizeDepositBalanceBranch(eg.depositBalance?.[key]);
}

/**
 * Drawings Upload fields for this project.
 * VIC/QLD from project state only — no default to VIC when state is missing.
 */
export function getGeneralDrawingsUploadBranch(settings, project) {
  const eg = parseEmailGeneralJson(settings?.email_general_json);
  const code = generalEmailStateCode(project);
  if (code !== "VIC" && code !== "QLD") {
    return normalizeDrawingsUploadBranch({});
  }
  const key = code === "QLD" ? "qld" : "vic";
  return normalizeDrawingsUploadBranch(eg.drawingsUpload?.[key]);
}

/** Simple From/To branch (Design Notes, Sales Notes, Concept Approved). */
export function normalizeDrawingsFromToBranch(raw) {
  const trim = (v) => (v == null ? "" : String(v).trim());
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    fromEmail: trim(b.fromEmail),
    toEmail: trim(b.toEmail),
  };
}

function emptyDrawingsFromToBranch() {
  return normalizeDrawingsFromToBranch({});
}

export function normalizeDrawingsWdsApprovedBranch(raw) {
  const trim = (v) => (v == null ? "" : String(v).trim());
  const b = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    fromEmail: trim(b.fromEmail),
    toEmail: trim(b.toEmail),
    toEmail2: trim(b.toEmail2),
  };
}

function emptyDrawingsWdsApprovedBranch() {
  return normalizeDrawingsWdsApprovedBranch({});
}

function isDrawingsFromToBranchEmpty(b) {
  const n = normalizeDrawingsFromToBranch(b);
  return !n.fromEmail && !n.toEmail;
}

function isDrawingsWdsApprovedBranchEmpty(b) {
  const n = normalizeDrawingsWdsApprovedBranch(b);
  return !n.fromEmail && !n.toEmail && !n.toEmail2;
}

function isVicQldRootEmpty(root, isBranchEmpty) {
  if (!root || typeof root !== "object") return true;
  return isBranchEmpty(root.vic) && isBranchEmpty(root.qld);
}

export function isGeneralDesignNotesConfigEmpty(parsedGeneral) {
  return isVicQldRootEmpty(parsedGeneral?.designNotes, isDrawingsFromToBranchEmpty);
}

export function isGeneralSalesNotesConfigEmpty(parsedGeneral) {
  return isVicQldRootEmpty(parsedGeneral?.salesNotes, isDrawingsFromToBranchEmpty);
}

export function isGeneralConceptApprovedConfigEmpty(parsedGeneral) {
  return isVicQldRootEmpty(parsedGeneral?.conceptApproved, isDrawingsFromToBranchEmpty);
}

export function isGeneralWdsApprovedConfigEmpty(parsedGeneral) {
  return isVicQldRootEmpty(parsedGeneral?.wdsApproved, isDrawingsWdsApprovedBranchEmpty);
}

function pickStreamDrawingField(d, region, vicKey, qldKey) {
  const trim = (v) => (v == null ? "" : String(v).trim());
  if (region === "qld") return trim(d[qldKey]) || trim(d[vicKey]);
  return trim(d[vicKey]);
}

export function designNotesBranchFromStreamDrawings(drawings, region) {
  const d = drawings && typeof drawings === "object" && !Array.isArray(drawings) ? drawings : {};
  return normalizeDrawingsFromToBranch({
    fromEmail: pickStreamDrawingField(d, region, "designNotesFromEmail", "qldDesignNotesFromEmail"),
    toEmail: pickStreamDrawingField(d, region, "designNotesToEmail", "qldDesignNotesToEmail"),
  });
}

/** Sales Notes; when empty, seed From/To from Design Notes reversed (same as stream settings). */
export function salesNotesBranchFromStreamDrawings(drawings, region) {
  const d = drawings && typeof drawings === "object" && !Array.isArray(drawings) ? drawings : {};
  const design = designNotesBranchFromStreamDrawings(d, region);
  const from =
    pickStreamDrawingField(d, region, "salesNotesFromEmail", "qldSalesNotesFromEmail") || design.toEmail;
  const to =
    pickStreamDrawingField(d, region, "salesNotesToEmail", "qldSalesNotesToEmail") || design.fromEmail;
  return normalizeDrawingsFromToBranch({ fromEmail: from, toEmail: to });
}

export function conceptApprovedBranchFromStreamDrawings(drawings, region) {
  const d = drawings && typeof drawings === "object" && !Array.isArray(drawings) ? drawings : {};
  return normalizeDrawingsFromToBranch({
    fromEmail: pickStreamDrawingField(
      d,
      region,
      "conceptApprovedFromEmail",
      "qldConceptApprovedFromEmail"
    ),
    toEmail: pickStreamDrawingField(d, region, "conceptApprovedToEmail", "qldConceptApprovedToEmail"),
  });
}

export function wdsApprovedBranchFromStreamDrawings(drawings, region) {
  const d = drawings && typeof drawings === "object" && !Array.isArray(drawings) ? drawings : {};
  return normalizeDrawingsWdsApprovedBranch({
    fromEmail: pickStreamDrawingField(d, region, "wdsApprovedFromEmail", "qldWdsApprovedFromEmail"),
    toEmail: pickStreamDrawingField(d, region, "wdsApprovedToEmail", "qldWdsApprovedToEmail"),
    toEmail2: pickStreamDrawingField(d, region, "wdsApprovedToEmail2", "qldWdsApprovedToEmail2"),
  });
}

function generalDrawingsStateKey(project) {
  return generalEmailStateCode(project) === "QLD" ? "qld" : "vic";
}

export function getGeneralDesignNotesBranch(settings, project) {
  const eg = parseEmailGeneralJson(settings?.email_general_json);
  return normalizeDrawingsFromToBranch(eg.designNotes?.[generalDrawingsStateKey(project)]);
}

export function getGeneralSalesNotesBranch(settings, project) {
  const eg = parseEmailGeneralJson(settings?.email_general_json);
  const key = generalDrawingsStateKey(project);
  const sales = normalizeDrawingsFromToBranch(eg.salesNotes?.[key]);
  // Runtime seed matching Stream Settings when Sales fields are blank.
  if (sales.fromEmail && sales.toEmail) return sales;
  const design = normalizeDrawingsFromToBranch(eg.designNotes?.[key]);
  return normalizeDrawingsFromToBranch({
    fromEmail: sales.fromEmail || design.toEmail,
    toEmail: sales.toEmail || design.fromEmail,
  });
}

export function getGeneralConceptApprovedBranch(settings, project) {
  const eg = parseEmailGeneralJson(settings?.email_general_json);
  return normalizeDrawingsFromToBranch(eg.conceptApproved?.[generalDrawingsStateKey(project)]);
}

export function getGeneralWdsApprovedBranch(settings, project) {
  const eg = parseEmailGeneralJson(settings?.email_general_json);
  return normalizeDrawingsWdsApprovedBranch(eg.wdsApproved?.[generalDrawingsStateKey(project)]);
}

/**
 * One-shot migrate of remaining Drawings email sections from SGF - VIC / SGF - QLD stream rows.
 * Returns `{ next, changed }` where next is a full parsed general json object.
 */
export function migrateRemainingGeneralDrawingsFromStream(parsedGeneral, rawStreamMap) {
  const eg = parsedGeneral && typeof parsedGeneral === "object" ? parsedGeneral : parseEmailGeneralJson(null);
  const map = rawStreamMap && typeof rawStreamMap === "object" ? rawStreamMap : {};
  const vicD = map["SGF - VIC"]?.drawings;
  const qldD = map["SGF - QLD"]?.drawings;
  let next = { ...eg };
  let changed = false;

  if (isGeneralDesignNotesConfigEmpty(next)) {
    const migrated = {
      vic: designNotesBranchFromStreamDrawings(vicD, "vic"),
      qld: designNotesBranchFromStreamDrawings(qldD, "qld"),
    };
    if (!isGeneralDesignNotesConfigEmpty({ designNotes: migrated })) {
      next = { ...next, designNotes: migrated };
      changed = true;
    }
  }
  if (isGeneralSalesNotesConfigEmpty(next)) {
    const migrated = {
      vic: salesNotesBranchFromStreamDrawings(vicD, "vic"),
      qld: salesNotesBranchFromStreamDrawings(qldD, "qld"),
    };
    if (!isGeneralSalesNotesConfigEmpty({ salesNotes: migrated })) {
      next = { ...next, salesNotes: migrated };
      changed = true;
    }
  }
  if (isGeneralConceptApprovedConfigEmpty(next)) {
    const migrated = {
      vic: conceptApprovedBranchFromStreamDrawings(vicD, "vic"),
      qld: conceptApprovedBranchFromStreamDrawings(qldD, "qld"),
    };
    if (!isGeneralConceptApprovedConfigEmpty({ conceptApproved: migrated })) {
      next = { ...next, conceptApproved: migrated };
      changed = true;
    }
  }
  if (isGeneralWdsApprovedConfigEmpty(next)) {
    const migrated = {
      vic: wdsApprovedBranchFromStreamDrawings(vicD, "vic"),
      qld: wdsApprovedBranchFromStreamDrawings(qldD, "qld"),
    };
    if (!isGeneralWdsApprovedConfigEmpty({ wdsApproved: migrated })) {
      next = { ...next, wdsApproved: migrated };
      changed = true;
    }
  }
  return { next, changed };
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
      !t(b.clientEmailTo2) &&
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
    drawingsUpload: { vic: emptyDrawingsUploadBranch(), qld: emptyDrawingsUploadBranch() },
    designNotes: { vic: emptyDrawingsFromToBranch(), qld: emptyDrawingsFromToBranch() },
    salesNotes: { vic: emptyDrawingsFromToBranch(), qld: emptyDrawingsFromToBranch() },
    conceptApproved: { vic: emptyDrawingsFromToBranch(), qld: emptyDrawingsFromToBranch() },
    wdsApproved: { vic: emptyDrawingsWdsApprovedBranch(), qld: emptyDrawingsWdsApprovedBranch() },
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
  const duRoot =
    o.drawingsUpload && typeof o.drawingsUpload === "object" && !Array.isArray(o.drawingsUpload)
      ? o.drawingsUpload
      : {};
  const dnRoot =
    o.designNotes && typeof o.designNotes === "object" && !Array.isArray(o.designNotes) ? o.designNotes : {};
  const snRoot =
    o.salesNotes && typeof o.salesNotes === "object" && !Array.isArray(o.salesNotes) ? o.salesNotes : {};
  const caRoot =
    o.conceptApproved && typeof o.conceptApproved === "object" && !Array.isArray(o.conceptApproved)
      ? o.conceptApproved
      : {};
  const waRoot =
    o.wdsApproved && typeof o.wdsApproved === "object" && !Array.isArray(o.wdsApproved) ? o.wdsApproved : {};
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
    drawingsUpload: {
      vic: normalizeDrawingsUploadBranch(duRoot.vic),
      qld: normalizeDrawingsUploadBranch(duRoot.qld),
    },
    designNotes: {
      vic: normalizeDrawingsFromToBranch(dnRoot.vic),
      qld: normalizeDrawingsFromToBranch(dnRoot.qld),
    },
    salesNotes: {
      vic: normalizeDrawingsFromToBranch(snRoot.vic),
      qld: normalizeDrawingsFromToBranch(snRoot.qld),
    },
    conceptApproved: {
      vic: normalizeDrawingsFromToBranch(caRoot.vic),
      qld: normalizeDrawingsFromToBranch(caRoot.qld),
    },
    wdsApproved: {
      vic: normalizeDrawingsWdsApprovedBranch(waRoot.vic),
      qld: normalizeDrawingsWdsApprovedBranch(waRoot.qld),
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
