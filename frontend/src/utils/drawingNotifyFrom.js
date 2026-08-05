/**
 * Drawing notification From/To:
 * - Drawings Upload → General `email_general_json.drawingsUpload` (VIC/QLD by project state)
 * - Other sections → `stream_settings_json[resolvedRow].drawings` (VIC keys or QLD-mapped keys)
 * Each flow reads only its section’s fields — no falling back to other sections or templates for routing.
 */

import {
  getGeneralConceptApprovedBranch,
  getGeneralDesignNotesBranch,
  getGeneralDrawingsUploadBranch,
  getGeneralSalesNotesBranch,
  getGeneralWdsApprovedBranch,
} from "./emailGeneralSettings";
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
    designToSalespersonCrmToEmail: "qldDesignToSalespersonCrmToEmail",
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

export function isConstructionPhaseProject(project) {
  return String(project?.status ?? "").trim() === "Construction Phase";
}

/** Per-stream-row `drawings` values only (not Drawings Upload — that lives in General). */
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
 * General → Drawings → Drawings Upload — From (VIC/QLD by project state).
 * @param {Record<string, unknown> | null | undefined} settings from GET /api/settings
 * @param {Record<string, unknown> | null | undefined} project
 */
export function resolveDesignToSalespersonFrom(settings, project, _templateFrom) {
  return getGeneralDrawingsUploadBranch(settings, project).fromEmail || "";
}

/**
 * To recipients for Drawings Upload (General `email_general_json.drawingsUpload`).
 *
 * Upload modal kind:
 * - certifier → To [CRM] + To (additional) [DESIGN]  (never To [DESIGN])
 * - concept / working → To [DESIGN] + To (additional) [DESIGN]  (never CRM)
 *
 * When kind is omitted, falls back to [DESIGN]/CONSTRUCTION] by project status (no CRM).
 */
export function resolveDesignToSalespersonToEmails(settings, project, _templateToEmails, uploadKind) {
  const kind = String(uploadKind || "").trim().toLowerCase();
  const branch = getGeneralDrawingsUploadBranch(settings, project);
  const additionalDesign = parseSettingsToEmailList(branch.toDesignEmail2);

  if (kind === "certifier") {
    const crm = parseSettingsToEmailList(branch.toCrmEmail);
    // Explicitly exclude primary DESIGN To for certifier uploads.
    return mergeUniqueEmails(crm, additionalDesign);
  }

  if (kind === "concept" || kind === "working") {
    const primary = parseSettingsToEmailList(branch.toDesignEmail);
    // Explicitly exclude CRM for concept/working uploads.
    return mergeUniqueEmails(primary, additionalDesign);
  }

  const construction = isConstructionPhaseProject(project);
  if (construction) {
    const primary = parseSettingsToEmailList(branch.toConstructionEmail);
    const additional = parseSettingsToEmailList(branch.toConstructionEmail2);
    const additional2 = parseSettingsToEmailList(branch.toConstructionEmail3);
    const additional3 = parseSettingsToEmailList(branch.toConstructionEmail4);
    return mergeUniqueEmails(primary, additional, additional2, additional3);
  }
  const primary = parseSettingsToEmailList(branch.toDesignEmail);
  return mergeUniqueEmails(primary, additionalDesign);
}

/** General → Drawings → Design Notes — From. */
export function resolveDesignNotesFrom(settings, project, _templateFrom) {
  return getGeneralDesignNotesBranch(settings, project).fromEmail || "";
}

/** General → Drawings → Design Notes — To. */
export function resolveDesignNotesToEmails(settings, project, _templateToEmails) {
  return parseSettingsToEmailList(getGeneralDesignNotesBranch(settings, project).toEmail);
}

/**
 * Stream Settings → Drawings → Send Drawings to Client — From (still per-stream).
 * @param {Record<string, unknown> | null | undefined} settings from GET /api/settings
 * @param {Record<string, unknown> | null | undefined} project
 */
export function resolveSalespersonToClientFrom(settings, project, _templateFrom) {
  return getDrawingFieldFromStreamRows(settings, project, "salespersonToClientFromEmail");
}

/** General → Drawings → Sales Notes — To (seeds from Design Notes when empty). */
export function resolveSalesNotesToEmails(settings, project, _templateToEmails) {
  return parseSettingsToEmailList(getGeneralSalesNotesBranch(settings, project).toEmail);
}

/**
 * DRAWINGS - Sales to Design: From = Sales Notes — From; To = Sales Notes — To.
 * (When Sales From is empty, uses Design Notes — To like the former Stream Settings seed.)
 */
export function resolveSalesToDesignFrom(settings, project, _templateFrom) {
  return getGeneralSalesNotesBranch(settings, project).fromEmail || "";
}

export function resolveSalesToDesignToEmails(settings, project, _templateToEmails) {
  void _templateToEmails;
  return resolveSalesNotesToEmails(settings, project, _templateToEmails);
}

/** General → Drawings → Concept Approved — To. */
export function resolveConceptApprovedToEmails(settings, project, _templateToEmails) {
  return parseSettingsToEmailList(getGeneralConceptApprovedBranch(settings, project).toEmail);
}

/** General → Drawings → Concept Approved — From. */
export function resolveConceptApprovedFrom(settings, project, _templateFrom) {
  return getGeneralConceptApprovedBranch(settings, project).fromEmail || "";
}

/** General → Drawings → WDs Approved — To (primary + additional). */
export function resolveWdsApprovedToEmails(settings, project, _templateToEmails) {
  const branch = getGeneralWdsApprovedBranch(settings, project);
  return mergeUniqueEmails(
    parseSettingsToEmailList(branch.toEmail),
    parseSettingsToEmailList(branch.toEmail2)
  );
}

/** General → Drawings → WDs Approved — From. */
export function resolveWdsApprovedFrom(settings, project, _templateFrom) {
  return getGeneralWdsApprovedBranch(settings, project).fromEmail || "";
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
