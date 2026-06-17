/**
 * Drawing notification From/To: only `stream_settings_json[resolvedRow].drawings` (VIC keys or QLD-mapped keys).
 * Each flow reads only its section’s fields — no falling back to other sections or templates for routing.
 */

import { mergeUniqueEmails, resolveStreamSettingsKey } from "./streamDrawingsSettings";

/** Parse template `to_addresses` (array, JSON array string, or comma list) → unique trimmed emails. */
export function parseEmailTemplateToAddressList(raw) {
  if (raw == null || raw === "") return [];
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      list = Array.isArray(parsed) ? parsed : s.split(",").map((a) => a.trim()).filter(Boolean);
    } catch {
      list = s.split(",").map((a) => a.trim()).filter(Boolean);
    }
  } else return [];
  return uniqueEmails(list.map((a) => String(a).trim()).filter(Boolean));
}

function uniqueEmails(arr) {
  const seen = new Set();
  const out = [];
  for (const e of arr || []) {
    const t = String(e || "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function parseStreamSettingsMap(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function normalizeBaseStream(stream) {
  const base = String(stream ?? "").trim();
  if (base === "Pumped on Property") return "Pumped On Property";
  if (base === "Creat Cash Flow") return "Create Cash Flow";
  return base;
}

/** Same key as Drawings helpers / Stream Settings (stream + optional state row). */
function resolveProjectStreamSettingsRowKey(project, settings) {
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  return resolveStreamSettingsKey(normalizeBaseStream(project?.stream), map, project);
}

/** `… - QLD` stream rows store QLD drawing fields under `qld*` keys in `drawings`. */
function drawingFieldKeyForStreamRow(streamKey, vicStyleKey) {
  const useQld = typeof streamKey === "string" && / - QLD$/i.test(streamKey);
  if (!useQld) return vicStyleKey;
  const q = {
    designToSalespersonFromEmail: "qldDesignToSalespersonFromEmail",
    designToSalespersonToEmail: "qldDesignToSalespersonToEmail",
    designToSalespersonToEmail2: "qldDesignToSalespersonToEmail2",
    designToSalespersonConstructionToEmail: "qldDesignToSalespersonConstructionToEmail",
    designToSalespersonConstructionToEmail2: "qldDesignToSalespersonConstructionToEmail2",
    designToSalespersonConstructionToEmail3: "qldDesignToSalespersonConstructionToEmail3",
    designToSalespersonConstructionToEmail4: "qldDesignToSalespersonConstructionToEmail4",
    designNotesFromEmail: "qldDesignNotesFromEmail",
    designNotesToEmail: "qldDesignNotesToEmail",
    salesNotesFromEmail: "qldSalesNotesFromEmail",
    salesNotesToEmail: "qldSalesNotesToEmail",
    conceptApprovedFromEmail: "qldConceptApprovedFromEmail",
    conceptApprovedToEmail: "qldConceptApprovedToEmail",
    wdsApprovedFromEmail: "qldWdsApprovedFromEmail",
    wdsApprovedToEmail: "qldWdsApprovedToEmail",
    wdsApprovedToEmail2: "qldWdsApprovedToEmail2",
    salespersonToClientFromEmail: "qldSalespersonToClientFromEmail",
  };
  return q[vicStyleKey] || vicStyleKey;
}

function drawingValue(drawings, streamKey, vicStyleKey) {
  if (!drawings || typeof drawings !== "object") return "";
  const k = drawingFieldKeyForStreamRow(streamKey, vicStyleKey);
  const v = drawings[k] != null ? String(drawings[k]).trim() : "";
  return v || "";
}

function projectStateCode(project) {
  const s = String(project?.state ?? "").trim().toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return "";
}

/** Display name for drawing-related client emails: fixed by state; other states use `project.salesperson`. */
const REGIONAL_SALESPERSON_DISPLAY_NAME = {
  QLD: "Brian Willis",
  VIC: "Ben Donnan",
};

export function resolveRegionalSalespersonName(project) {
  const code = projectStateCode(project);
  if (code && Object.prototype.hasOwnProperty.call(REGIONAL_SALESPERSON_DISPLAY_NAME, code)) {
    return REGIONAL_SALESPERSON_DISPLAY_NAME[code];
  }
  return String(project?.salesperson ?? "").trim();
}

/**
 * Stream row for Sales Notes email: same resolver as other drawings, then match any `… - VIC`/`… - QLD`
 * row when the primary key is missing (stale stream string on the project).
 */
function resolveSalesNotesStreamRowKey(project, settings) {
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  const baseRaw = normalizeBaseStream(project?.stream);
  const baseStr = String(baseRaw || "").trim();
  if (!baseStr) return "";

  let key = resolveStreamSettingsKey(baseStr, map, project);
  if (key && map[key] && typeof map[key] === "object") return key;

  const nb = baseStr.replace(/\s*-\s*(VIC|QLD)\s*$/i, "").trim().toLowerCase();
  const st = projectStateCode(project);
  const lb = baseStr.toLowerCase();
  let bestKey = "";
  let bestScore = -1;
  for (const k of Object.keys(map)) {
    const row = map[k];
    if (!row || typeof row !== "object") continue;
    const d = row.drawings;
    if (!d || typeof d !== "object") continue;
    const hasRouting =
      drawingValue(d, k, "salesNotesFromEmail") ||
      drawingValue(d, k, "salesNotesToEmail") ||
      drawingValue(d, k, "designNotesFromEmail") ||
      drawingValue(d, k, "designNotesToEmail");
    if (!hasRouting) continue;

    const lk = k.toLowerCase();
    let score = 0;
    if (lk === lb) score += 100;
    else if (lk.startsWith(lb + " -")) score += 90;
    const rowBase = k.replace(/\s*-\s*(VIC|QLD)\s*$/i, "").trim().toLowerCase();
    if (nb && rowBase === nb) score += 70;
    if (st === "QLD" && / - QLD$/i.test(k)) score += 15;
    if (st === "VIC" && / - VIC$/i.test(k)) score += 15;
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }
  return bestKey;
}

/**
 * Stream row for Concept Approved: primary stream key, else best map row that already has Concept Approved From/To set.
 */
function resolveConceptApprovedStreamRowKey(project, settings) {
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  const baseRaw = normalizeBaseStream(project?.stream);
  const baseStr = String(baseRaw || "").trim();
  if (!baseStr) return "";

  let key = resolveStreamSettingsKey(baseStr, map, project);
  if (key && map[key] && typeof map[key] === "object") return key;

  const nb = baseStr.replace(/\s*-\s*(VIC|QLD)\s*$/i, "").trim().toLowerCase();
  const st = projectStateCode(project);
  const lb = baseStr.toLowerCase();
  let bestKey = "";
  let bestScore = -1;
  for (const k of Object.keys(map)) {
    const row = map[k];
    if (!row || typeof row !== "object") continue;
    const d = row.drawings;
    if (!d || typeof d !== "object") continue;
    const hasRouting =
      drawingValue(d, k, "conceptApprovedFromEmail") || drawingValue(d, k, "conceptApprovedToEmail");
    if (!hasRouting) continue;

    const lk = k.toLowerCase();
    let score = 0;
    if (lk === lb) score += 100;
    else if (lk.startsWith(lb + " -")) score += 90;
    const rowBase = k.replace(/\s*-\s*(VIC|QLD)\s*$/i, "").trim().toLowerCase();
    if (nb && rowBase === nb) score += 70;
    if (st === "QLD" && / - QLD$/i.test(k)) score += 15;
    if (st === "VIC" && / - VIC$/i.test(k)) score += 15;
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }
  return bestKey;
}

/**
 * Stream row for WDs Approved: primary stream key, else best map row that already has WDs Approved From/To set.
 */
function resolveWdsApprovedStreamRowKey(project, settings) {
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  const baseRaw = normalizeBaseStream(project?.stream);
  const baseStr = String(baseRaw || "").trim();
  if (!baseStr) return "";

  let key = resolveStreamSettingsKey(baseStr, map, project);
  if (key && map[key] && typeof map[key] === "object") return key;

  const nb = baseStr.replace(/\s*-\s*(VIC|QLD)\s*$/i, "").trim().toLowerCase();
  const st = projectStateCode(project);
  const lb = baseStr.toLowerCase();
  let bestKey = "";
  let bestScore = -1;
  for (const k of Object.keys(map)) {
    const row = map[k];
    if (!row || typeof row !== "object") continue;
    const d = row.drawings;
    if (!d || typeof d !== "object") continue;
    const hasRouting =
      drawingValue(d, k, "wdsApprovedFromEmail") ||
      drawingValue(d, k, "wdsApprovedToEmail") ||
      drawingValue(d, k, "wdsApprovedToEmail2");
    if (!hasRouting) continue;

    const lk = k.toLowerCase();
    let score = 0;
    if (lk === lb) score += 100;
    else if (lk.startsWith(lb + " -")) score += 90;
    const rowBase = k.replace(/\s*-\s*(VIC|QLD)\s*$/i, "").trim().toLowerCase();
    if (nb && rowBase === nb) score += 70;
    if (st === "QLD" && / - QLD$/i.test(k)) score += 15;
    if (st === "VIC" && / - VIC$/i.test(k)) score += 15;
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }
  return bestKey;
}

/** Stream row for Drawings Upload (design → sales): primary key, else best row with Upload From/To set. */
function resolveDesignToSalespersonStreamRowKey(project, settings) {
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  const baseRaw = normalizeBaseStream(project?.stream);
  const baseStr = String(baseRaw || "").trim();
  if (!baseStr) return "";

  let key = resolveStreamSettingsKey(baseStr, map, project);
  if (key && map[key] && typeof map[key] === "object") {
    const d = map[key].drawings;
    if (
      d &&
      (drawingValue(d, key, "designToSalespersonFromEmail") ||
        drawingValue(d, key, "designToSalespersonToEmail") ||
        drawingValue(d, key, "designToSalespersonToEmail2") ||
        drawingValue(d, key, "designToSalespersonConstructionToEmail") ||
        drawingValue(d, key, "designToSalespersonConstructionToEmail2") ||
        drawingValue(d, key, "designToSalespersonConstructionToEmail3") ||
        drawingValue(d, key, "designToSalespersonConstructionToEmail4"))
    ) {
      return key;
    }
  }

  const nb = baseStr.replace(/\s*-\s*(VIC|QLD)\s*$/i, "").trim().toLowerCase();
  const st = projectStateCode(project);
  const lb = baseStr.toLowerCase();
  let bestKey = "";
  let bestScore = -1;
  for (const k of Object.keys(map)) {
    const row = map[k];
    if (!row || typeof row !== "object") continue;
    const d = row.drawings;
    if (!d || typeof d !== "object") continue;
    const hasRouting =
      drawingValue(d, k, "designToSalespersonFromEmail") ||
      drawingValue(d, k, "designToSalespersonToEmail") ||
      drawingValue(d, k, "designToSalespersonToEmail2") ||
      drawingValue(d, k, "designToSalespersonConstructionToEmail") ||
      drawingValue(d, k, "designToSalespersonConstructionToEmail2") ||
      drawingValue(d, k, "designToSalespersonConstructionToEmail3") ||
      drawingValue(d, k, "designToSalespersonConstructionToEmail4");
    if (!hasRouting) continue;

    const lk = k.toLowerCase();
    let score = 0;
    if (lk === lb) score += 100;
    else if (lk.startsWith(lb + " -")) score += 90;
    const rowBase = k.replace(/\s*-\s*(VIC|QLD)\s*$/i, "").trim().toLowerCase();
    if (nb && rowBase === nb) score += 70;
    if (st === "QLD" && / - QLD$/i.test(k)) score += 15;
    if (st === "VIC" && / - VIC$/i.test(k)) score += 15;
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  }
  return bestKey;
}

const DESIGN_TO_SALESPERSON_FIELD_KEYS = new Set([
  "designToSalespersonFromEmail",
  "designToSalespersonToEmail",
  "designToSalespersonToEmail2",
  "designToSalespersonConstructionToEmail",
  "designToSalespersonConstructionToEmail2",
  "designToSalespersonConstructionToEmail3",
  "designToSalespersonConstructionToEmail4",
]);

export function isConstructionPhaseProject(project) {
  return String(project?.status ?? "").trim() === "Construction Phase";
}

/** Per-stream-row `drawings` values only. */
function getDrawingFieldFromStreamRows(settings, project, vicStyleKey) {
  let streamKey = resolveProjectStreamSettingsRowKey(project, settings);
  if (DESIGN_TO_SALESPERSON_FIELD_KEYS.has(vicStyleKey)) {
    const uploadKey = resolveDesignToSalespersonStreamRowKey(project, settings);
    if (uploadKey) streamKey = uploadKey;
  }
  if (!streamKey) return "";
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  const row = map[streamKey] && typeof map[streamKey] === "object" ? map[streamKey] : null;
  const drawings = row && row.drawings && typeof row.drawings === "object" ? row.drawings : null;
  const key = drawingFieldKeyForStreamRow(streamKey, vicStyleKey);
  const v = drawings && drawings[key] != null ? String(drawings[key]).trim() : "";
  return v || "";
}

/** Split comma / semicolon / newline separated addresses from a settings text field. */
export function parseSettingsToEmailList(raw) {
  if (raw == null || raw === "") return [];
  return uniqueEmails(String(raw).split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean));
}

/**
 * @param {Record<string, unknown> | null | undefined} settings from GET /api/settings
 * @param {Record<string, unknown> | null | undefined} project
 */
export function resolveDesignToSalespersonFrom(settings, project, _templateFrom) {
  return getDrawingFieldFromStreamRows(settings, project, "designToSalespersonFromEmail");
}

/**
 * To recipients for Drawings Upload (primary + optional second To on VIC/QLD stream row `drawings`).
 * Uses [DESIGN] or [CONSTRUCTION] To fields based on project status.
 */
export function resolveDesignToSalespersonToEmails(settings, project, _templateToEmails) {
  const construction = isConstructionPhaseProject(project);
  if (construction) {
    const primary = parseSettingsToEmailList(
      getDrawingFieldFromStreamRows(settings, project, "designToSalespersonConstructionToEmail")
    );
    const additional = parseSettingsToEmailList(
      getDrawingFieldFromStreamRows(settings, project, "designToSalespersonConstructionToEmail2")
    );
    const additional2 = parseSettingsToEmailList(
      getDrawingFieldFromStreamRows(settings, project, "designToSalespersonConstructionToEmail3")
    );
    const additional3 = parseSettingsToEmailList(
      getDrawingFieldFromStreamRows(settings, project, "designToSalespersonConstructionToEmail4")
    );
    return mergeUniqueEmails(primary, additional, additional2, additional3);
  }
  const primary = parseSettingsToEmailList(
    getDrawingFieldFromStreamRows(settings, project, "designToSalespersonToEmail")
  );
  const secondary = parseSettingsToEmailList(
    getDrawingFieldFromStreamRows(settings, project, "designToSalespersonToEmail2")
  );
  return mergeUniqueEmails(primary, secondary);
}

/** Stream Settings → Drawings → Design Notes — From only (resolved row from stream + state). */
export function resolveDesignNotesFrom(settings, project, _templateFrom) {
  return getDrawingFieldFromStreamRows(settings, project, "designNotesFromEmail");
}

/** Stream Settings → Drawings → Design Notes — To only. */
export function resolveDesignNotesToEmails(settings, project, _templateToEmails) {
  return parseSettingsToEmailList(getDrawingFieldFromStreamRows(settings, project, "designNotesToEmail"));
}

/**
 * @param {Record<string, unknown> | null | undefined} settings from GET /api/settings
 * @param {Record<string, unknown> | null | undefined} project
 */
export function resolveSalespersonToClientFrom(settings, project, _templateFrom) {
  return getDrawingFieldFromStreamRows(settings, project, "salespersonToClientFromEmail");
}

/** Sales Notes — To (same row + seed as Stream Settings → Drawings when Sales To is empty). */
export function resolveSalesNotesToEmails(settings, project, _templateToEmails) {
  const streamKey = resolveSalesNotesStreamRowKey(project, settings);
  if (!streamKey) return [];
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  const row = map[streamKey];
  const d = row?.drawings && typeof row.drawings === "object" ? row.drawings : null;
  let raw = drawingValue(d, streamKey, "salesNotesToEmail");
  if (!raw) raw = drawingValue(d, streamKey, "designNotesFromEmail");
  return parseSettingsToEmailList(raw);
}

/**
 * DRAWINGS - Sales to Design: From = Sales Notes — From; To = Sales Notes — To.
 * (When Sales From is empty, uses Design Notes — To like Stream Settings seed.)
 */
export function resolveSalesToDesignFrom(settings, project, _templateFrom) {
  const streamKey = resolveSalesNotesStreamRowKey(project, settings);
  if (!streamKey) return "";
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  const row = map[streamKey];
  const d = row?.drawings && typeof row.drawings === "object" ? row.drawings : null;
  let v = drawingValue(d, streamKey, "salesNotesFromEmail");
  if (!v) v = drawingValue(d, streamKey, "designNotesToEmail");
  return v || "";
}

export function resolveSalesToDesignToEmails(settings, project, _templateToEmails) {
  void _templateToEmails;
  return resolveSalesNotesToEmails(settings, project, _templateToEmails);
}

/** Concept Approved — To only (`conceptApprovedToEmail` / QLD key on resolved row). No fallback to other sections. */
export function resolveConceptApprovedToEmails(settings, project, _templateToEmails) {
  const streamKey = resolveConceptApprovedStreamRowKey(project, settings);
  if (!streamKey) return [];
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  const row = map[streamKey];
  const d = row?.drawings && typeof row.drawings === "object" ? row.drawings : null;
  return parseSettingsToEmailList(drawingValue(d, streamKey, "conceptApprovedToEmail"));
}

/** Concept Approved — From only. No fallback to other sections. */
export function resolveConceptApprovedFrom(settings, project, _templateFrom) {
  const streamKey = resolveConceptApprovedStreamRowKey(project, settings);
  if (!streamKey) return "";
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  const row = map[streamKey];
  const d = row?.drawings && typeof row.drawings === "object" ? row.drawings : null;
  return drawingValue(d, streamKey, "conceptApprovedFromEmail");
}

/** WDs Approved — To recipients; primary + optional additional To merged (same pattern as Drawings Upload QLD second To). */
export function resolveWdsApprovedToEmails(settings, project, _templateToEmails) {
  const streamKey = resolveWdsApprovedStreamRowKey(project, settings);
  if (!streamKey) return [];
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  const row = map[streamKey];
  const d = row?.drawings && typeof row.drawings === "object" ? row.drawings : null;
  const primary = parseSettingsToEmailList(drawingValue(d, streamKey, "wdsApprovedToEmail"));
  const secondary = parseSettingsToEmailList(drawingValue(d, streamKey, "wdsApprovedToEmail2"));
  return mergeUniqueEmails(primary, secondary);
}

/** WDs Approved — From only. */
export function resolveWdsApprovedFrom(settings, project, _templateFrom) {
  const streamKey = resolveWdsApprovedStreamRowKey(project, settings);
  if (!streamKey) return "";
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  const row = map[streamKey];
  const d = row?.drawings && typeof row.drawings === "object" ? row.drawings : null;
  return drawingValue(d, streamKey, "wdsApprovedFromEmail");
}

/**
 * Map template To placeholders to real project emails (e.g. {Contact1} → client1 when active).
 * Raw addresses pass through; unknown tokens are skipped.
 * @param {string[]} templateToEmails from parseEmailTemplateToAddressList
 * @param {Record<string, unknown> | null | undefined} project
 */
export function expandProjectContactTokensInToAddresses(templateToEmails, project) {
  if (!Array.isArray(templateToEmails) || !project || typeof project !== "object") return [];
  const out = [];
  for (const raw of templateToEmails) {
    const s = String(raw || "").trim();
    if (!s) continue;
    const key = s.replace(/^\s+|\s+$/g, "").toLowerCase();
    const c1 = String(project.client1_active || "").toLowerCase() === "true";
    const c2 = String(project.client2_active || "").toLowerCase() === "true";
    const c3 = String(project.client3_active || "").toLowerCase() === "true";
    if (key === "{contact1}" || key === "contact1") {
      if (c1 && project.client1_email && String(project.client1_email).trim()) {
        out.push(String(project.client1_email).trim());
      }
      continue;
    }
    if (key === "{contact2}" || key === "contact2") {
      if (c2 && project.client2_email && String(project.client2_email).trim()) {
        out.push(String(project.client2_email).trim());
      }
      continue;
    }
    if (key === "{contact3}" || key === "contact3") {
      if (c3 && project.client3_email && String(project.client3_email).trim()) {
        out.push(String(project.client3_email).trim());
      }
      continue;
    }
    if (key === "{primary}" || key === "{clientemail}" || key === "{email}") {
      if (project.email && String(project.email).trim()) {
        out.push(String(project.email).trim());
      }
      continue;
    }
    if (s.includes("@")) {
      out.push(s);
    }
  }
  return uniqueEmails(out);
}

/**
 * To for Sales → Client: caller supplies the merged list (clients + stream extras from settings).
 * Template To is ignored for routing.
 */
export function resolveSalespersonToClientToEmails(_settings, project, _templateToEmails, mergedFallback) {
  const fromStream = uniqueEmails(mergedFallback);
  void _settings;
  void project;
  void _templateToEmails;
  return fromStream;
}
