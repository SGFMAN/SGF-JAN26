/**
 * Drawing notification From/To using Stream Settings (VIC / QLD / Investor),
 * falling back to email template addresses when a setting is empty.
 */

/** @param {Record<string, unknown> | null | undefined} project */
export function drawingsNotifyRegion(project) {
  if (!project || typeof project !== "object") return "vic";
  const st = String(project.state ?? "").trim().toUpperCase();
  if (st === "QLD" || st === "QUEENSLAND") return "qld";
  if (st === "VIC" || st === "VICTORIA") return "vic";
  const stream = String(project.stream ?? "").trim();
  if (stream === "SGF - QLD") return "qld";
  if (stream === "SGF - VIC") return "vic";
  return "investor";
}

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

function stateCodeFromProject(project) {
  if (!project || typeof project !== "object") return "";
  const s = String(project.state ?? "").trim().toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return "";
}

function normalizeBaseStream(stream) {
  const base = String(stream ?? "").trim();
  if (base === "Pumped on Property") return "Pumped On Property";
  if (base === "Creat Cash Flow") return "Create Cash Flow";
  return base;
}

function resolveStreamSettingsKeyForProject(project, settings) {
  const stream = normalizeBaseStream(project?.stream);
  if (!stream) return "";
  if (stream === "SGF - VIC" || stream === "SGF - QLD") return stream;
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  if (map[stream]) return stream;
  const st = stateCodeFromProject(project);
  if (st) {
    const byState = `${stream} - ${st}`;
    if (map[byState]) return byState;
  }
  if (map[`${stream} - VIC`]) return `${stream} - VIC`;
  if (map[`${stream} - QLD`]) return `${stream} - QLD`;
  return stream;
}

function getNonSgfDrawingOverride(settings, project, key) {
  const streamKey = resolveStreamSettingsKeyForProject(project, settings);
  if (!streamKey || streamKey === "SGF - VIC" || streamKey === "SGF - QLD") return "";
  const map = parseStreamSettingsMap(settings?.stream_settings_json);
  const row = map[streamKey] && typeof map[streamKey] === "object" ? map[streamKey] : null;
  const drawings = row && row.drawings && typeof row.drawings === "object" ? row.drawings : null;
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
 * @param {string | null | undefined} templateFrom from email_templates.from_address
 */
export function resolveDesignToSalespersonFrom(settings, project, templateFrom) {
  const nonSgf = getNonSgfDrawingOverride(settings, project, "designToSalespersonFromEmail");
  if (nonSgf) return nonSgf;
  const region = drawingsNotifyRegion(project);
  const key =
    region === "qld"
      ? "drawings_qld_design_to_salesperson_email"
      : region === "vic"
        ? "drawings_vic_design_to_salesperson_email"
        : "drawings_investor_streams_design_to_salesperson_email";
  const override =
    settings && settings[key] != null && String(settings[key]).trim()
      ? String(settings[key]).trim()
      : "";
  const base = templateFrom != null ? String(templateFrom).trim() : "";
  return override || base;
}

/**
 * To recipients for Design → Salesperson (VIC/QLD settings text; investor uses template only).
 * @param {string[]} templateToEmails from parseEmailTemplateToAddressList(template.to_addresses)
 */
export function resolveDesignToSalespersonToEmails(settings, project, templateToEmails) {
  const nonSgf = getNonSgfDrawingOverride(settings, project, "designToSalespersonToEmail");
  const nonSgfList = parseSettingsToEmailList(nonSgf);
  if (nonSgfList.length > 0) return nonSgfList;
  const region = drawingsNotifyRegion(project);
  const key =
    region === "qld"
      ? "drawings_qld_design_to_salesperson_to_email"
      : region === "vic"
        ? "drawings_vic_design_to_salesperson_to_email"
        : null;
  const fromSettings = key && settings ? parseSettingsToEmailList(settings[key]) : [];
  if (fromSettings.length > 0) return fromSettings;
  return uniqueEmails(templateToEmails);
}

/**
 * @param {Record<string, unknown> | null | undefined} settings from GET /api/settings
 * @param {Record<string, unknown> | null | undefined} project
 * @param {string | null | undefined} templateFrom from email_templates.from_address
 */
export function resolveSalespersonToClientFrom(settings, project, templateFrom) {
  const nonSgf = getNonSgfDrawingOverride(settings, project, "salespersonToClientFromEmail");
  if (nonSgf) return nonSgf;
  const region = drawingsNotifyRegion(project);
  const key =
    region === "qld"
      ? "drawings_qld_salesperson_to_client_email"
      : region === "vic"
        ? "drawings_vic_salesperson_to_client_email"
        : "drawings_investor_streams_salesperson_to_client_email";
  const override =
    settings && settings[key] != null && String(settings[key]).trim()
      ? String(settings[key]).trim()
      : "";
  const base = templateFrom != null ? String(templateFrom).trim() : "";
  return override || base;
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
 * To for Sales → Client: Stream Settings first (Send to Clients + Extra emails for the stream),
 * then template To with {Contact1}… tokens expanded. Template raw addresses are only used if
 * the settings-based list is empty.
 * @param {string[]} templateToEmails
 * @param {string[]} mergedFallback from getProjectClientEmails + getStreamExtraDrawingEmails, etc.
 */
export function resolveSalespersonToClientToEmails(
  _settings,
  project,
  templateToEmails,
  mergedFallback
) {
  const fromStream = uniqueEmails(mergedFallback);
  if (fromStream.length > 0) return fromStream;
  const expanded = expandProjectContactTokensInToAddresses(templateToEmails, project);
  if (expanded.length > 0) return expanded;
  return uniqueEmails(templateToEmails).filter((e) => e.includes("@"));
}
