/** Colour Settings → section → colour range (group) mapping. */

export const COLOUR_SECTION_RANGE_KEYS = [
  "external",
  "windows",
  "hybrid_flooring_affordable",
  "hybrid_flooring_superior",
  "tiles",
  "carpets",
  "kitchen_cabinets",
  "kitchen_benchtops_laminate",
  "kitchen_benchtops_stone",
];

export const COLOUR_SECTION_RANGE_LABELS = {
  external: "External",
  windows: "Windows",
  hybrid_flooring_affordable: "Hybrid Flooring - Affordable",
  hybrid_flooring_superior: "Hybrid Flooring - Superior",
  tiles: "Tiles",
  carpets: "Carpets",
  kitchen_cabinets: "Kitchen Cabinets",
  kitchen_benchtops_laminate: "Kitchen Benchtops - Laminate",
  kitchen_benchtops_stone: "Kitchen Benchtops - Stone",
};

export const COLORBOND_RANGE_KEY = "colorbond";

export function emptyColourSectionRanges() {
  const out = {};
  for (const key of COLOUR_SECTION_RANGE_KEYS) out[key] = "";
  return out;
}

export function normalizeColourSectionRanges(raw) {
  const base = emptyColourSectionRanges();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  for (const key of COLOUR_SECTION_RANGE_KEYS) {
    if (raw[key] == null) continue;
    const v = String(raw[key]).trim();
    base[key] = v;
  }
  return base;
}

/**
 * Build dropdown option labels from a catalogue payload.
 * Duplicate names across subgroups become "Name (Subgroup)".
 */
export function colourOptionLabelsFromCatalogue(catalogue) {
  return colourOptionEntriesFromCatalogue(catalogue).map((e) => e.label);
}

/**
 * Label + sample metadata for dropdowns (includes image_url when present).
 * Duplicate names across subgroups become "Name (Subgroup)".
 */
export function colourOptionEntriesFromCatalogue(catalogue) {
  const samples = Array.isArray(catalogue?.samples) ? catalogue.samples : [];
  const byName = new Map();
  for (const sample of samples) {
    const name = String(sample?.name || "").trim();
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(sample);
  }
  const entries = [];
  for (const [name, list] of byName) {
    if (list.length === 1) {
      entries.push({
        label: name,
        image_url: list[0]?.image_url || null,
        sample: list[0],
      });
      continue;
    }
    for (const sample of list) {
      const subgroup = String(sample.subgroup || sample.subgroup_name || "").trim();
      entries.push({
        label: subgroup ? `${name} (${subgroup})` : name,
        image_url: sample?.image_url || null,
        sample,
      });
    }
  }
  entries.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return entries;
}
