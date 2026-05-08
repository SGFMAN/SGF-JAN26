/**
 * Single definition of “full 5% deposit” vs paid amount (matches Admin / New Project flows).
 * 5% = Math.floor(projectCost / 20), not Math.round(cost * 0.05).
 */

export function parseMoneyToInt(value) {
  if (value == null || value === "") return 0;
  return parseInt(String(value).replace(/[^0-9]/g, ""), 10) || 0;
}

/** Full 5% deposit in dollars (integer), same as Admin `calculateFullDeposit` numeric part. */
export function fullFivePercentDeposit(projectCostValue) {
  const cost = parseMoneyToInt(projectCostValue);
  if (cost <= 0) return 0;
  return Math.floor(cost / 20);
}

/** True when paid deposit meets or exceeds the canonical full 5% amount. */
export function isFullFivePercentDepositPaid(depositValue, projectCostValue) {
  const full = fullFivePercentDeposit(projectCostValue);
  const paid = parseMoneyToInt(depositValue);
  return full > 0 && paid >= full;
}
