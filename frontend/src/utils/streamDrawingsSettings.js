/**
 * Shared helpers for Stream Settings → Drawings and Drawings page recipient logic.
 */

function resolveStateCode(projectOrState) {
  if (!projectOrState) return "";
  const raw =
    typeof projectOrState === "string"
      ? projectOrState
      : projectOrState && typeof projectOrState === "object"
        ? projectOrState.state
        : "";
  const s = String(raw || "").trim().toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return "";
}

export function resolveStreamSettingsKey(stream, streamSettingsJson, projectOrState) {
  const base = stream != null ? String(stream).trim() : "";
  const map =
    streamSettingsJson && typeof streamSettingsJson === "object" && !Array.isArray(streamSettingsJson)
      ? streamSettingsJson
      : {};
  if (!base) return "";
  if (base === "SGF - VIC" || base === "SGF - QLD") return base;
  if (map[base]) return base;

  const normalizedBase =
    base === "Pumped on Property" ? "Pumped On Property" : base === "Creat Cash Flow" ? "Create Cash Flow" : base;
  const stateCode = resolveStateCode(projectOrState);
  if (stateCode) {
    const keyed = `${normalizedBase} - ${stateCode}`;
    if (map[keyed]) return keyed;
  }
  const vicKey = `${normalizedBase} - VIC`;
  const qldKey = `${normalizedBase} - QLD`;
  if (map[vicKey]) return vicKey;
  if (map[qldKey]) return qldKey;
  /** Never return a key that is not in `map` — callers would read a missing row and show “no recipients”. */
  if (map[normalizedBase]) return normalizedBase;
  /** Retail label used on some projects; settings rows are `SGF - VIC` / `SGF - QLD`. */
  if (normalizedBase === "SGF - Retail" || normalizedBase === "SGF Retail") {
    if (stateCode === "QLD" && map["SGF - QLD"]) return "SGF - QLD";
    if (map["SGF - VIC"]) return "SGF - VIC";
    if (map["SGF - QLD"]) return "SGF - QLD";
  }
  return "";
}

function isQldStreamSettingsRowKey(key) {
  return typeof key === "string" && / - QLD$/i.test(key);
}

export function isStreamSendDrawingsToClientsEnabled(stream, streamSettingsJson, projectOrState) {
  return isStreamDrawingsSectionSendToClientsEnabled(stream, streamSettingsJson, projectOrState, "sendClient");
}

/**
 * Send to Clients toggle for Drawings substreams (Send Drawings to Client, Concept Approved, WDs Approved).
 * QLD rows use `qld*` keys. Missing flag defaults to true (include client contacts).
 */
export function isStreamDrawingsSectionSendToClientsEnabled(stream, streamSettingsJson, projectOrState, section) {
  const key = resolveStreamSettingsKey(stream, streamSettingsJson, projectOrState);
  const map =
    streamSettingsJson && typeof streamSettingsJson === "object" && !Array.isArray(streamSettingsJson)
      ? streamSettingsJson
      : {};
  const row = key ? map[key] : null;
  const d = row && row.drawings && typeof row.drawings === "object" ? row.drawings : {};
  const qld = isQldStreamSettingsRowKey(key);
  const primaryKey =
    section === "sendClient"
      ? qld
        ? "qldSendToClients"
        : "sendToClients"
      : section === "conceptApproved"
        ? qld
          ? "qldConceptApprovedSendToClients"
          : "conceptApprovedSendToClients"
        : section === "wdsApproved"
          ? qld
            ? "qldWdsApprovedSendToClients"
            : "wdsApprovedSendToClients"
          : qld
            ? "qldSendToClients"
            : "sendToClients";
  const v = d[primaryKey];
  if (typeof v === "boolean") {
    if (section === "sendClient") return v === true;
    return v === true;
  }
  return true;
}

/** Primary + client contacts that have an email (same rules as drawings template client list). */
export function getProjectClientEmailsForDrawings(project) {
  if (!project) return [];
  const emails = [];
  if (project.email && String(project.email).trim()) {
    emails.push(String(project.email).trim());
  }
  if (project.client1_active === "true" && project.client1_email && String(project.client1_email).trim()) {
    emails.push(String(project.client1_email).trim());
  }
  if (project.client2_active === "true" && project.client2_email && String(project.client2_email).trim()) {
    emails.push(String(project.client2_email).trim());
  }
  if (project.client3_active === "true" && project.client3_email && String(project.client3_email).trim()) {
    emails.push(String(project.client3_email).trim());
  }
  return emails;
}

/**
 * Stream-level extra drawing recipients: checkbox on + non-empty address.
 * Independent of Send to Clients / project contacts.
 */
export function getStreamExtraDrawingEmails(stream, streamSettingsJson, projectOrState) {
  const key = resolveStreamSettingsKey(stream, streamSettingsJson, projectOrState);
  const map =
    streamSettingsJson && typeof streamSettingsJson === "object" && !Array.isArray(streamSettingsJson)
      ? streamSettingsJson
      : {};
  const d = key && map[key] && map[key].drawings && typeof map[key].drawings === "object" ? map[key].drawings : {};
  const out = [];
  for (let i = 1; i <= 3; i++) {
    const ck = `extraEmail${i}`;
    const ak = `extraEmail${i}Address`;
    if (d[ck] === true && d[ak] && String(d[ak]).trim()) {
      out.push(String(d[ak]).trim());
    }
  }
  return out;
}

/** When Send to Clients is off for the stream, remove project client emails from a To list (manual addresses kept). */
export function stripProjectClientEmailsWhenDisabled(toList, project, sendToClientsEnabled) {
  if (sendToClientsEnabled) return toList;
  const block = new Set(
    getProjectClientEmailsForDrawings(project).map((e) => String(e).trim().toLowerCase())
  );
  return toList.filter((e) => !block.has(String(e).trim().toLowerCase()));
}

export function mergeUniqueEmails(...groups) {
  const seen = new Set();
  const out = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const raw of group) {
      const e = String(raw || "").trim();
      if (!e) continue;
      const lower = e.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      out.push(e);
    }
  }
  return out;
}
