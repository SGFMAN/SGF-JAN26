/**
 * Drawing notification From/To: only `stream_settings_json[resolvedRow].drawings` (VIC keys or QLD-mapped keys).
 * No template fallbacks, no top-level `drawings_vic_*` globals, no state-based guessing.
 */

import { resolveStreamSettingsKey } from "./streamDrawingsSettings";

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
    salespersonToClientFromEmail: "qldSalespersonToClientFromEmail",
  };
  return q[vicStyleKey] || vicStyleKey;
}

/** Per-stream-row `drawings` values only. */
function getDrawingFieldFromStreamRows(settings, project, vicStyleKey) {
  const streamKey = resolveProjectStreamSettingsRowKey(project, settings);
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
 * To recipients for Design → Salesperson — stream row `drawings` only.
 */
export function resolveDesignToSalespersonToEmails(settings, project, _templateToEmails) {
  const rowTo = getDrawingFieldFromStreamRows(settings, project, "designToSalespersonToEmail");
  return parseSettingsToEmailList(rowTo);
}

/**
 * @param {Record<string, unknown> | null | undefined} settings from GET /api/settings
 * @param {Record<string, unknown> | null | undefined} project
 */
export function resolveSalespersonToClientFrom(settings, project, _templateFrom) {
  return getDrawingFieldFromStreamRows(settings, project, "salespersonToClientFromEmail");
}

/**
 * DRAWINGS - Sales to Design: From = salesperson-to-client From on the stream row; To = design inbox list from stream row.
 */
export function resolveSalesToDesignFrom(settings, project, _templateFrom) {
  return resolveSalespersonToClientFrom(settings, project, _templateFrom);
}

export function resolveSalesToDesignToEmails(settings, project, _templateToEmails) {
  const fromStream = parseSettingsToEmailList(getDrawingFieldFromStreamRows(settings, project, "designToSalespersonFromEmail"));
  if (fromStream.length > 0) return fromStream;
  return [];
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
