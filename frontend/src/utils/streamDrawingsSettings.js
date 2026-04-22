/**
 * Shared helpers for Stream Settings → Drawings and Drawings page recipient logic.
 */

export function isStreamSendDrawingsToClientsEnabled(stream, streamSettingsJson) {
  const key = stream != null ? String(stream).trim() : "";
  const map =
    streamSettingsJson && typeof streamSettingsJson === "object" && !Array.isArray(streamSettingsJson)
      ? streamSettingsJson
      : {};
  const row = key ? map[key] : null;
  const v = row && row.drawings && typeof row.drawings === "object" ? row.drawings.sendToClients : undefined;
  if (typeof v !== "boolean") return true;
  return v === true;
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
export function getStreamExtraDrawingEmails(stream, streamSettingsJson) {
  const key = stream != null ? String(stream).trim() : "";
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
