/**
 * View-time payment Amounts for deposit / construction stages (not stored on the project).
 * Percentages come from Settings → Payments (with defaults if unset).
 * When settings.deduct_pre_engagement is on, percents apply to
 * (project cost − pre_engagement_required); otherwise to full project cost.
 * Pre-engagement Amount itself is a stored project field (pre_engagement_required).
 */

import { formatMoneyInput, parseMoneyToInt } from "./projectDeposit";

export const DEFAULT_PAYMENT_STAGE_PERCENTS = {
  deposit: 5,
  base: 10,
  frame: 15,
  lock_up: 35,
  fix: 25,
  final: 10,
};

export const PAYMENT_PERCENT_SETTING_KEYS = {
  deposit: "deposit_percent",
  base: "base_percent",
  frame: "frame_percent",
  lock_up: "lock_up_percent",
  fix: "fix_percent",
  final: "final_percent",
};

export const PAYMENT_PERCENT_STAGES = [
  { key: "deposit", label: "Deposit", settingKey: "deposit_percent" },
  { key: "base", label: "Base", settingKey: "base_percent" },
  { key: "frame", label: "Frame", settingKey: "frame_percent" },
  { key: "lock_up", label: "Lock Up", settingKey: "lock_up_percent" },
  { key: "fix", label: "Fix", settingKey: "fix_percent" },
  { key: "final", label: "Final", settingKey: "final_percent" },
];

export function parsePercentValue(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const n = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

/** Resolve stage percents from settings row (or partial), falling back to defaults. */
export function resolveStagePercents(settings) {
  const out = {};
  for (const stage of PAYMENT_PERCENT_STAGES) {
    const fallback = DEFAULT_PAYMENT_STAGE_PERCENTS[stage.key];
    out[stage.key] = parsePercentValue(settings?.[stage.settingKey], fallback);
  }
  return out;
}

export function sumStagePercents(percentsOrSettings) {
  const percents =
    percentsOrSettings && typeof percentsOrSettings.deposit === "number"
      ? percentsOrSettings
      : resolveStagePercents(percentsOrSettings);
  return PAYMENT_PERCENT_STAGES.reduce((sum, stage) => sum + (Number(percents[stage.key]) || 0), 0);
}

export function percentOfProjectCost(projectCostValue, percent) {
  const cost = parseMoneyToInt(projectCostValue);
  if (cost <= 0 || !(percent > 0)) return 0;
  return Math.round((cost * percent) / 100);
}

/** Returns formatted "$1,234" or "" when zero / unknown. */
export function formatCalculatedAmount(dollars) {
  if (!(dollars > 0)) return "";
  return formatMoneyInput(dollars);
}

/** True when Settings toggle is on (default on when unset). */
export function shouldDeductPreEngagement(settings) {
  const raw = settings?.deduct_pre_engagement;
  if (raw == null || raw === "") return true;
  return raw === true || raw === "true" || raw === "1" || raw === "Y" || raw === "y";
}

/** Cost base used for % stages. Optionally subtracts pre-engagement (floor at 0). */
export function paymentPercentBaseCost(
  projectCostValue,
  preEngagementRequiredValue,
  deductPreEngagement = true
) {
  const cost = parseMoneyToInt(projectCostValue);
  if (!deductPreEngagement) return Math.max(0, cost);
  const preEngagement = parseMoneyToInt(preEngagementRequiredValue);
  return Math.max(0, cost - preEngagement);
}

export function calculatePaymentAmounts(projectCostValue, settings, preEngagementRequiredValue) {
  const percents = resolveStagePercents(settings);
  const baseCost = paymentPercentBaseCost(
    projectCostValue,
    preEngagementRequiredValue,
    shouldDeductPreEngagement(settings)
  );
  return {
    deposit: percentOfProjectCost(baseCost, percents.deposit),
    base: percentOfProjectCost(baseCost, percents.base),
    frame: percentOfProjectCost(baseCost, percents.frame),
    lock_up: percentOfProjectCost(baseCost, percents.lock_up),
    fix: percentOfProjectCost(baseCost, percents.fix),
    final: percentOfProjectCost(baseCost, percents.final),
  };
}
