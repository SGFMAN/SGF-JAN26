/** New Project email routing: From/To always come from Stream Settings `newProject`. */

import { expandProjectContactTokensInToAddresses } from "./drawingNotifyFrom";
import { resolveStreamSettingsKey } from "./streamDrawingsSettings";

function parseStreamMap(raw) {
  if (raw == null || raw === "") return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function getStreamNewProjectRow(settings, project) {
  const map = parseStreamMap(settings?.stream_settings_json);
  const key = resolveStreamSettingsKey(
    project?.stream != null ? String(project.stream).trim() : "",
    map,
    project
  );
  const row = key && map[key] && typeof map[key] === "object" ? map[key] : null;
  const np = row?.newProject && typeof row.newProject === "object" && !Array.isArray(row.newProject) ? row.newProject : {};
  return { streamKey: key, newProject: np };
}

function uniqueTrimmed(list) {
  const seen = new Set();
  const out = [];
  for (const e of list || []) {
    const t = String(e ?? "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function coerceTeamEmailToList(np) {
  const raw = np?.teamEmailTo;
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return uniqueTrimmed(raw.map((x) => String(x ?? "").trim()));
  }
  const s = String(raw).trim();
  if (!s) return [];
  return uniqueTrimmed(s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean));
}

export function resolveNewProjectTeamFrom(settings, project) {
  const { newProject: np } = getStreamNewProjectRow(settings, project);
  return np.teamEmailFrom != null ? String(np.teamEmailFrom).trim() : "";
}

/** Team internal “To” list from stream only. */
export function resolveNewProjectTeamToEmailsFromStream(settings, project) {
  const { newProject: np } = getStreamNewProjectRow(settings, project);
  return coerceTeamEmailToList(np);
}

export function resolveNewProjectClientFrom(settings, project) {
  const { newProject: np } = getStreamNewProjectRow(settings, project);
  return np.clientEmailFrom != null ? String(np.clientEmailFrom).trim() : "";
}

/** Client “To” from stream (`{Contact1}` etc.) or []. */
export function resolveNewProjectClientToEmails(settings, project) {
  const { newProject: np } = getStreamNewProjectRow(settings, project);
  const token = np.clientEmailTo != null ? String(np.clientEmailTo).trim() : "";
  if (!token) return [];
  return expandProjectContactTokensInToAddresses([token], project);
}

/** Placeholder project for Stream Settings email preview (no API). */
export function buildSampleProjectForStreamPreview(streamKey) {
  const qld = typeof streamKey === "string" && / - QLD$/i.test(streamKey);
  const fullDeposit = Math.floor(500000 / 20);
  return {
    stream: streamKey,
    state: qld ? "QLD" : "VIC",
    name: "45 Example Street, Previewville",
    street: "45 Example Street",
    suburb: "Previewville",
    client_name: "Alex Preview",
    client1_name: "Alex Preview",
    client1_email: "client.preview@example.com",
    client1_active: "true",
    email: "client.preview@example.com",
    salesperson: "Sample Salesperson",
    draftsperson: "Sample Draftsperson",
    project_cost: 500000,
    deposit: fullDeposit,
  };
}

export function buildSampleProjectPartialDeposit(streamKey) {
  return { ...buildSampleProjectForStreamPreview(streamKey), deposit: 1000 };
}
