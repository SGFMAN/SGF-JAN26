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
