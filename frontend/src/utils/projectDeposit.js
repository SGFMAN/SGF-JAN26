/**
 * Single definition of “full 5% deposit” vs paid amount (matches Admin / New Project flows).
 * 5% = Math.floor(projectCost / 20), not Math.round(cost * 0.05).
 */

/** Stable deposit-type keys from New Project → Project Cost modal. */
export const DEPOSIT_TYPE = {
  PRE_ENGAGEMENT: "pre_engagement",
  HOLDING: "holding",
  OTHER: "other",
};

export function parseMoneyToInt(value) {
  if (value == null || value === "") return 0;
  return parseInt(String(value).replace(/[^0-9]/g, ""), 10) || 0;
}

/** Prefer deposit_paid; fall back to legacy deposit column. */
export function getDepositPaidValue(projectOrDeposit, maybeCostIgnored) {
  if (projectOrDeposit != null && typeof projectOrDeposit === "object") {
    const paid = projectOrDeposit.deposit_paid;
    if (paid != null && paid !== "") return paid;
    return projectOrDeposit.deposit ?? "";
  }
  return projectOrDeposit ?? "";
}

/** Format integer dollars as $1,234 for inputs. */
export function formatMoneyInput(value) {
  const numeric = parseMoneyToInt(value);
  if (numeric <= 0) return "";
  return `$${numeric.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** Full 5% deposit in dollars (integer), same as Admin `calculateFullDeposit` numeric part. */
export function fullFivePercentDeposit(projectCostValue) {
  const cost = parseMoneyToInt(projectCostValue);
  if (cost <= 0) return 0;
  return Math.floor(cost / 20);
}

/** Required deposit: deposit_required if set, otherwise 5% of project cost. */
export function resolveDepositRequired(depositRequiredValue, projectCostValue) {
  const required = parseMoneyToInt(depositRequiredValue);
  if (required > 0) return required;
  return fullFivePercentDeposit(projectCostValue);
}

/** True when paid deposit meets or exceeds the required (or 5%) amount. */
export function isFullFivePercentDepositPaid(depositValue, projectCostValue, depositRequiredValue) {
  const full = resolveDepositRequired(depositRequiredValue, projectCostValue);
  const paid = parseMoneyToInt(depositValue);
  return full > 0 && paid >= full;
}

/** Pre-engagement required dollars on the project (0 if unset). */
export function getPreEngagementRequiredAmount(project) {
  return parseMoneyToInt(project?.pre_engagement_required);
}

/** Best-effort “amount paid toward deposit / pre-engagement” for overview status. */
export function getAnyDepositAmountPaid(project) {
  if (!project || typeof project !== "object") return 0;
  const pePaid = parseMoneyToInt(project.pre_engagement_paid);
  const legacyPaid = parseMoneyToInt(getDepositPaidValue(project));
  return Math.max(pePaid, legacyPaid);
}

/**
 * Overview / design-phase deposit complete:
 * - If pre_engagement_required is set → paid >= that amount
 * - Else → legacy full 5% of project cost paid
 */
export function isOverviewDepositComplete(project) {
  if (!project || typeof project !== "object") return false;
  const peRequired = getPreEngagementRequiredAmount(project);
  const paid = getAnyDepositAmountPaid(project);
  if (peRequired > 0) {
    return paid >= peRequired;
  }
  const fullFive = fullFivePercentDeposit(project.project_cost);
  return fullFive > 0 && paid >= fullFive;
}

/** `Full Deposit` | `Partial Deposit` | `No Deposit` */
export function getOverviewDepositStatusLabel(project) {
  if (isOverviewDepositComplete(project)) return "Full Deposit";
  if (getAnyDepositAmountPaid(project) > 0) return "Partial Deposit";
  return "No Deposit";
}

/** `complete` (green) | `partial` (orange) | `none` (red) */
export function getOverviewDepositStatusLevel(project) {
  if (isOverviewDepositComplete(project)) return "complete";
  if (getAnyDepositAmountPaid(project) > 0) return "partial";
  return "none";
}

/** Required dollars for deposit complete (pre-engagement required, else 5% of cost). */
export function getOverviewDepositRequiredAmount(project) {
  const peRequired = getPreEngagementRequiredAmount(project);
  if (peRequired > 0) return peRequired;
  return fullFivePercentDeposit(project?.project_cost);
}

/** Amount still owed toward deposit complete (never negative). */
export function getOverviewDepositOwedAmount(project) {
  const required = getOverviewDepositRequiredAmount(project);
  if (required <= 0) return 0;
  return Math.max(0, required - getAnyDepositAmountPaid(project));
}

/** Main-menu Deposit Paid filter categories (excludes the special “Deposit Owed” match-all). */
export function getDepositPaidFilterCategory(project) {
  if (isOverviewDepositComplete(project)) return "Full Deposit";
  if (getAnyDepositAmountPaid(project) > 0) return "Partial Deposit";
  return "No Deposit Paid";
}

/** Match Deposit Paid filter value, including “Deposit Owed” (owed > 0). */
export function projectMatchesDepositPaidFilter(project, selectedValue) {
  if (!selectedValue) return true;
  if (selectedValue === "Deposit Owed") {
    return getOverviewDepositOwedAmount(project) > 0;
  }
  return getDepositPaidFilterCategory(project) === selectedValue;
}

/**
 * Payment fields for brand-new jobs from the new-project modal.
 * Amount chosen (pre-engagement / holding / other) → pre_engagement_paid.
 * Required amount always comes from payment settings (pre_engagement_amount).
 * Does not set legacy deposit / deposit_paid.
 */
export function newJobPreEngagementPaymentFields(formData) {
  const paidRaw = formData?.deposit ?? "";
  const requiredRaw = formData?.preEngagementRequired ?? "";
  const paid = parseMoneyToInt(paidRaw);
  const required = parseMoneyToInt(requiredRaw);
  const depositType = normalizeDepositType(
    formData?.depositType ?? formData?.deposit_type ?? formData?.newJobDepositType
  );
  return {
    pre_engagement_paid: paid > 0 ? formatMoneyInput(paid) : null,
    pre_engagement_required: required > 0 ? formatMoneyInput(required) : null,
    deposit_type: depositType || null,
  };
}

/** Amount paid at job start for email tokens (pre-engagement paid, else legacy deposit). */
export function getNewJobAmountPaid(project) {
  if (!project || typeof project !== "object") return "";
  if (project.pre_engagement_paid != null && project.pre_engagement_paid !== "") {
    return project.pre_engagement_paid;
  }
  return project.deposit ?? "";
}

/** Normalize Project Cost modal deposit type (and legacy label variants). */
export function normalizeDepositType(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (
    value === DEPOSIT_TYPE.PRE_ENGAGEMENT ||
    value === DEPOSIT_TYPE.HOLDING ||
    value === DEPOSIT_TYPE.OTHER
  ) {
    return value;
  }
  const lower = value.toLowerCase();
  if (lower.includes("pre-engagement") || lower.includes("pre engagement") || lower === "pre_engagement") {
    return DEPOSIT_TYPE.PRE_ENGAGEMENT;
  }
  if (lower.includes("holding")) {
    return DEPOSIT_TYPE.HOLDING;
  }
  if (lower === "other" || lower.includes("other deposit")) {
    return DEPOSIT_TYPE.OTHER;
  }
  return "";
}

/** Resolve deposit type from project / email wizard fields. */
export function getProjectDepositType(project) {
  if (!project || typeof project !== "object") return "";
  return normalizeDepositType(
    project.deposit_type ?? project.depositType ?? project.newJobDepositType
  );
}

/** `{DepositPaid}` — formatted amount only (e.g. `$2,500` or `$0`). */
export function formatDepositPaidToken(project) {
  const amountPaidRaw = getNewJobAmountPaid(project);
  const depositNum = parseMoneyToInt(amountPaidRaw);
  if (depositNum > 0) {
    return `$${depositNum.toLocaleString()}`;
  }
  return "$0";
}

/**
 * `{DepositBalance}` — settings pre_engagement_amount minus amount paid.
 * Never negative (overpay → `$0`).
 */
export function formatDepositBalanceToken(project, settings) {
  const required = parseMoneyToInt(settings?.pre_engagement_amount);
  const paid = parseMoneyToInt(getNewJobAmountPaid(project));
  const balance = Math.max(0, required - paid);
  if (balance > 0) return `$${balance.toLocaleString()}`;
  return "$0";
}

/** Replace `{DepositBalance}` using settings (fetches `/api/settings` if needed). */
export async function replaceDepositBalanceToken(text, project, settings, apiBaseUrl = "") {
  if (!text || !String(text).includes("{DepositBalance}")) return text;
  let s = settings;
  if (!s) {
    try {
      const base = apiBaseUrl == null ? "" : String(apiBaseUrl);
      const res = await fetch(`${base}/api/settings`);
      s = res.ok ? await res.json() : {};
    } catch {
      s = {};
    }
  }
  return String(text).replace(/{DepositBalance}/g, formatDepositBalanceToken(project, s));
}

/**
 * `{DepositStatus}` from new-project deposit type dropdown.
 * DepositPaid remains the raw amount; this is the sentence used in emails.
 */
export function formatDepositStatusToken(project) {
  const depositPaid = formatDepositPaidToken(project);
  const depositNum = parseMoneyToInt(getNewJobAmountPaid(project));
  if (depositNum <= 0) return "$0 only";

  const type = getProjectDepositType(project);
  if (type === DEPOSIT_TYPE.PRE_ENGAGEMENT) {
    return `Full pre-engagement amount of ${depositPaid} paid`;
  }
  if (type === DEPOSIT_TYPE.HOLDING) {
    return `Holding deposit amount of ${depositPaid} paid.  No further works to be done until balance of payment is made.`;
  }
  if (type === DEPOSIT_TYPE.OTHER) {
    return `Deposit amount of ${depositPaid} paid.  No further works to be done until balance of payment is made.`;
  }

  // Legacy jobs without deposit_type: previous 5% comparison
  const projectCostNum = parseMoneyToInt(project?.project_cost);
  if (projectCostNum > 0) {
    const fullDepositAmount = Math.floor(projectCostNum / 20);
    return depositNum === fullDepositAmount ? "Full Deposit Paid" : `${depositPaid} only`;
  }
  return `${depositPaid} only`;
}
