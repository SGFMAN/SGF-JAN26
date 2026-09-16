/**
 * Deposit-paid status uses Admin payment rows only (Amount, Paid, Owed).
 * If Pre-engagement Amount > 0, that row governs.
 * If Pre-engagement Amount is 0 (old jobs), the Deposit row governs.
 */

import { getAdminDepositAmount } from "./paymentStageAmounts.js";

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

/**
 * Admin row that governs “deposit paid”:
 * Pre-engagement Amount > 0 → Pre-engagement Amount / Paid / Owed.
 * Pre-engagement Amount is 0 → Deposit Amount / Paid / Owed.
 */
export function getGoverningDepositPayment(project, settings) {
  if (!project || typeof project !== "object") {
    return { amount: 0, paid: 0, owed: 0, source: "deposit" };
  }
  const peAmount = getPreEngagementRequiredAmount(project);
  if (peAmount > 0) {
    const paid = parseMoneyToInt(project.pre_engagement_paid);
    return {
      amount: peAmount,
      paid,
      owed: Math.max(0, peAmount - paid),
      source: "pre_engagement",
    };
  }
  const amount = getAdminDepositAmount(project, settings);
  const paid = parseMoneyToInt(getDepositPaidValue(project));
  return {
    amount,
    paid,
    owed: Math.max(0, amount - paid),
    source: "deposit",
  };
}

/** Amount paid on the governing Admin row (pre-engagement or deposit). */
export function getAnyDepositAmountPaid(project, settings) {
  return getGoverningDepositPayment(project, settings).paid;
}

/** Rounding / leftover dollars still treated as paid. */
export const DEPOSIT_PAID_TOLERANCE_DOLLARS = 5;

/** True when the governing Admin row is paid, allowing up to $5 still owed. */
export function isOverviewDepositComplete(project, settings) {
  const { amount, owed } = getGoverningDepositPayment(project, settings);
  return amount > 0 && owed <= DEPOSIT_PAID_TOLERANCE_DOLLARS;
}

/** `Full Deposit` | `Partial Deposit` | `No Deposit` */
export function getOverviewDepositStatusLabel(project, settings) {
  if (isOverviewDepositComplete(project, settings)) return "Full Deposit";
  if (getAnyDepositAmountPaid(project, settings) > 0) return "Partial Deposit";
  return "No Deposit";
}

/** `complete` (green) | `partial` (orange) | `none` (red) */
export function getOverviewDepositStatusLevel(project, settings) {
  if (isOverviewDepositComplete(project, settings)) return "complete";
  if (getAnyDepositAmountPaid(project, settings) > 0) return "partial";
  return "none";
}

/** Required dollars on the governing Admin row. */
export function getOverviewDepositRequiredAmount(project, settings) {
  return getGoverningDepositPayment(project, settings).amount;
}

/** Amount still owed on the governing Admin row (never negative). */
export function getOverviewDepositOwedAmount(project, settings) {
  return getGoverningDepositPayment(project, settings).owed;
}

/** Main-menu Deposit Paid filter categories (excludes the special “Deposit Owed” match-all). */
export function getDepositPaidFilterCategory(project, settings) {
  if (isOverviewDepositComplete(project, settings)) return "Full Deposit";
  if (getAnyDepositAmountPaid(project, settings) > 0) return "Partial Deposit";
  return "No Deposit Paid";
}

/** Match Deposit Paid filter value, including “Deposit Owed” (still owing more than $5). */
export function projectMatchesDepositPaidFilter(project, selectedValue, settings) {
  if (!selectedValue) return true;
  if (selectedValue === "Deposit Owed") {
    return getOverviewDepositOwedAmount(project, settings) > DEPOSIT_PAID_TOLERANCE_DOLLARS;
  }
  return getDepositPaidFilterCategory(project, settings) === selectedValue;
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
