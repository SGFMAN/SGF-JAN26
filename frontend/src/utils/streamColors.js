import { STREAM } from "./uiThemeTokens.js";
import { SALES_TOTALS_GREEN_STREAMS } from "./salesTotalsCompute.js";

/** @typedef {"vic" | "qld" | "green"} StreamColorGroup */

/** @type {Record<StreamColorGroup, { darker: string, lighter: string }>} */
export const STREAM_GROUP_COLORS = {
  vic: { darker: STREAM.vicBlue, lighter: STREAM.vicBlueLight },
  qld: { darker: STREAM.qldRed, lighter: STREAM.qldRedLight },
  green: { darker: STREAM.streamGreen, lighter: STREAM.streamGreenLight },
};

/** @returns {StreamColorGroup} */
export function getStreamColorGroup(stream) {
  const s = (stream || "").trim();
  if (s === "SGF - VIC") return "vic";
  if (s === "SGF - QLD") return "qld";
  return "green";
}

/** @returns {StreamColorGroup} */
export function getStreamColorGroupFromState(state) {
  const s = (state || "").trim().toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "vic";
  if (s === "QLD" || s === "QUEENSLAND") return "qld";
  return "green";
}

export function getStreamGroupColors(group) {
  return STREAM_GROUP_COLORS[group] || STREAM_GROUP_COLORS.green;
}

export function getStreamBadgeColor(stream) {
  return getStreamGroupColors(getStreamColorGroup(stream)).darker;
}

/** Resolve stream colour group for a project (stream field, then state fallback). */
export function getProjectStreamColorGroup(project) {
  if (!project) return "green";
  const stream = (project.stream || "").trim();
  if (stream) return getStreamColorGroup(stream);
  return getStreamColorGroupFromState(project.state);
}

export function getProjectStreamBadgeColor(project) {
  return getStreamGroupColors(getProjectStreamColorGroup(project)).darker;
}

/** Section headers, agreement-sent rows, and action buttons on the Hot List. */
export function getHotlistStreamAccent(group) {
  const colors = getStreamGroupColors(group);
  const darker = colors.darker;
  return {
    bar: darker,
    outline: `color-mix(in srgb, ${darker} 55%, black)`,
    agreementBg: darker,
    agreementHover: `color-mix(in srgb, ${darker} 82%, black)`,
  };
}

/** Agreement-sent row background from stream (falls back to Text - Dark). */
export function getHotlistAgreementRowBackground(item, { isGreenStream }) {
  const st = (item?.stream || "").trim();
  if (st === "SGF - VIC") return STREAM_GROUP_COLORS.vic.darker;
  if (st === "SGF - QLD") return STREAM_GROUP_COLORS.qld.darker;
  if (isGreenStream?.(item)) return STREAM_GROUP_COLORS.green.darker;
  return "var(--sgf-text-primary)";
}

/** Darken a themed stream / banner CSS variable for button hover. */
export function streamColorHover(colorVar) {
  return `color-mix(in srgb, ${colorVar} 82%, black)`;
}

/** Sales pages: stream name → { darker, lighter } using themed VIC / QLD / Stream Green. */
export function buildSalesStreamColors() {
  const colors = {
    "SGF - VIC": STREAM_GROUP_COLORS.vic,
    "SGF - QLD": STREAM_GROUP_COLORS.qld,
    "Green Streams": STREAM_GROUP_COLORS.green,
  };
  for (const stream of SALES_TOTALS_GREEN_STREAMS) {
    colors[stream] = STREAM_GROUP_COLORS.green;
  }
  colors["Home Office / Studio"] = STREAM_GROUP_COLORS.green;
  colors["Dual Dwelling"] = STREAM_GROUP_COLORS.green;
  colors["Creat Cash Flow"] = STREAM_GROUP_COLORS.green;
  return colors;
}

export { STREAM };
