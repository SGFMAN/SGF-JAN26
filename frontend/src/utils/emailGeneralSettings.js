/** Settings → Email Settings → General (`settings.email_general_json`). */

const T = (v) => (v == null ? "" : String(v).trim());

const EMPTY_HOTLIST = {
  soldFromEmail: "",
  soldToEmail: "",
  qldSoldFromEmail: "",
  qldSoldToEmail: "",
};

/** VIC / QLD from project `state` only (not stream). Used for all General email settings. */
export function generalEmailStateCode(project) {
  const s = String(project?.state ?? "").trim().toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return "";
}

export function parseEmailGeneralJson(raw) {
  const base = { hotList: { ...EMPTY_HOTLIST } };
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
  const vicFrom = T(hl.soldFromEmail);
  const vicTo = T(hl.soldToEmail);
  const qldFrom = T(hl.qldSoldFromEmail);
  const qldTo = T(hl.qldSoldToEmail);
  return {
    ...o,
    hotList: {
      soldFromEmail: vicFrom,
      soldToEmail: vicTo,
      qldSoldFromEmail: qldFrom,
      qldSoldToEmail: qldTo,
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
