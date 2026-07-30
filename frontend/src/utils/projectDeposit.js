/**
 * Single definition of “full 5% deposit” vs paid amount (matches Admin / New Project flows).
 * 5% = Math.floor(projectCost / 20), not Math.round(cost * 0.05).
 */

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
  return {
    pre_engagement_paid: paid > 0 ? formatMoneyInput(paid) : null,
    pre_engagement_required: required > 0 ? formatMoneyInput(required) : null,
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
