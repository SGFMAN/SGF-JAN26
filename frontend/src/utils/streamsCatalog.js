/** Shared helpers for DB-backed sales streams (`/api/streams`). */

export const SGF_VIC_STREAM = "SGF - VIC";
export const SGF_QLD_STREAM = "SGF - QLD";

/** Fallback when API is unavailable — matches seeded defaults. */
export const FALLBACK_STREAMS = [
  {
    id: -1,
    name: SGF_VIC_STREAM,
    display_name: "SGF - Retail",
    sort_order: 0,
    is_sgf: true,
    badge_acronym: "VIC",
    aliases: [],
    active: true,
  },
  {
    id: -2,
    name: SGF_QLD_STREAM,
    display_name: "SGF - Retail",
    sort_order: 1,
    is_sgf: true,
    badge_acronym: "QLD",
    aliases: [],
    active: true,
  },
  {
    id: -3,
    name: "Dual Dwelling",
    display_name: "Dual Dwelling Investments",
    sort_order: 10,
    is_sgf: false,
    badge_acronym: "DDI",
    aliases: [],
    active: true,
  },
  {
    id: -4,
    name: "ATA",
    display_name: "ATA",
    sort_order: 20,
    is_sgf: false,
    badge_acronym: "ATA",
    aliases: [],
    active: true,
  },
  {
    id: -5,
    name: "Pumped On Property",
    display_name: "Pumped On Property",
    sort_order: 30,
    is_sgf: false,
    badge_acronym: "POP",
    aliases: ["Pumped on Property"],
    active: true,
  },
  {
    id: -6,
    name: "Henderson",
    display_name: "Henderson",
    sort_order: 40,
    is_sgf: false,
    badge_acronym: "HEN",
    aliases: [],
    active: true,
  },
  {
    id: -7,
    name: "Create Cash Flow",
    display_name: "Create Cash Flow",
    sort_order: 50,
    is_sgf: false,
    badge_acronym: "CCF",
    aliases: ["Creat Cash Flow"],
    active: true,
  },
  {
    id: -8,
    name: "Fresh Start Advisory",
    display_name: "Fresh Start Advisory",
    sort_order: 60,
    is_sgf: false,
    badge_acronym: "FSA",
    aliases: [],
    active: true,
  },
];

export async function fetchStreams(apiBase = "") {
  try {
    const res = await fetch(`${apiBase}/api/streams`);
    if (!res.ok) throw new Error(`streams ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return FALLBACK_STREAMS;
    return rows.map(normalizeStreamRecord);
  } catch {
    return FALLBACK_STREAMS;
  }
}

export function normalizeStreamRecord(row) {
  const aliases = Array.isArray(row?.aliases)
    ? row.aliases.map((a) => String(a || "").trim()).filter(Boolean)
    : [];
  return {
    id: row?.id,
    name: String(row?.name || "").trim(),
    display_name: String(row?.display_name || row?.name || "").trim(),
    sort_order: Number(row?.sort_order) || 0,
    is_sgf: !!row?.is_sgf,
    badge_acronym: String(row?.badge_acronym || "").trim(),
    aliases,
    active: row?.active !== false,
  };
}

/** Project dropdown values (all stream `name`s). */
export function projectStreamOptions(streams) {
  const list = Array.isArray(streams) && streams.length ? streams : FALLBACK_STREAMS;
  const names = [];
  const seen = new Set();
  for (const s of list) {
    if (!s?.name || s.active === false) continue;
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    names.push(s.name);
    for (const alias of s.aliases || []) {
      // Keep aliases out of the dropdown — canonical name only.
      void alias;
    }
  }
  return names;
}

/** Non-SGF streams used on sales green columns. */
export function greenSalesStreams(streams) {
  const list = Array.isArray(streams) && streams.length ? streams : FALLBACK_STREAMS;
  return list.filter((s) => s.active !== false && !s.is_sgf).map((s) => s.name);
}

/** Match a project's stream field to a catalog stream name (includes aliases). */
export function projectMatchesStream(projectStream, streamName, streams) {
  const ps = String(projectStream || "").trim();
  const want = String(streamName || "").trim();
  if (!ps || !want) return false;
  if (ps === want) return true;
  const list = Array.isArray(streams) && streams.length ? streams : FALLBACK_STREAMS;
  const row = list.find((s) => s.name === want);
  if (row?.aliases?.some((a) => a === ps)) return true;
  // Legacy hardcoded aliases
  if (want === "Pumped On Property" && (ps === "Pumped on Property" || ps === "Pumped On Property")) {
    return true;
  }
  if (want === "Create Cash Flow" && (ps === "Creat Cash Flow" || ps === "Create Cash Flow")) {
    return true;
  }
  return false;
}

/** Email Settings keys for a catalog stream (`Name - VIC` / `Name - QLD`, or SGF as-is). */
export function emailSettingsKeysForStream(stream) {
  if (!stream?.name) return [];
  if (stream.is_sgf || /\s-\s*(VIC|QLD)$/i.test(stream.name)) return [stream.name];
  return [`${stream.name} - VIC`, `${stream.name} - QLD`];
}

/** Flat list of all email settings keys from the catalog. */
export function emailSettingsKeysFromStreams(streams) {
  const list = Array.isArray(streams) && streams.length ? streams : FALLBACK_STREAMS;
  const keys = [];
  const seen = new Set();
  for (const s of list) {
    for (const k of emailSettingsKeysForStream(s)) {
      if (seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
    }
  }
  return keys;
}

/**
 * Email Settings left-nav items grouped by display_name.
 * @returns {{ label: string, keys: string[], sort_order: number }[]}
 */
export function emailSettingsDisplayItems(streams) {
  const list = Array.isArray(streams) && streams.length ? streams : FALLBACK_STREAMS;
  const byLabel = new Map();
  for (const s of list) {
    const label = s.display_name || s.name;
    if (!byLabel.has(label)) {
      byLabel.set(label, { label, keys: [], sort_order: s.sort_order });
    }
    const entry = byLabel.get(label);
    entry.sort_order = Math.min(entry.sort_order, s.sort_order);
    for (const k of emailSettingsKeysForStream(s)) {
      if (!entry.keys.includes(k)) entry.keys.push(k);
    }
  }
  return [...byLabel.values()].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

/** Legacy map used when migrating unsuffixed settings keys. */
export function buildLegacyStreamToVicMap(streams) {
  const list = Array.isArray(streams) && streams.length ? streams : FALLBACK_STREAMS;
  const map = {};
  for (const s of list) {
    if (s.is_sgf) continue;
    map[s.name] = `${s.name} - VIC`;
    for (const alias of s.aliases || []) {
      map[alias] = `${s.name} - VIC`;
    }
  }
  return map;
}
