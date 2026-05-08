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

/** VIC / QLD from project `state` only (not stream). Used for all General email settings. */
export function generalEmailStateCode(project) {
  const s = String(project?.state ?? "").trim().toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return "";
}

export function parseEmailGeneralJson(raw) {
  const base = { hotList: { ...EMPTY_HOTLIST }, windows: { ...EMPTY_WINDOWS } };
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
