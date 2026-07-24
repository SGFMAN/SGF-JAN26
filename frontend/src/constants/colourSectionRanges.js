/** Colour Settings → section → colour range (group) mapping. */

export const COLOUR_SECTION_RANGE_KEYS = [
  "external",
  "windows",
  "hybrid_flooring_affordable",
  "hybrid_flooring_superior",
  "tiles",
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
  kitchen_cabinets: "Kitchen Cabinets",
  kitchen_benchtops_laminate: "Kitchen Benchtops - Laminate",
  kitchen_benchtops_stone: "Kitchen Benchtops - Stone",
};

export const COLORBOND_RANGE_KEY = "colorbond";

export function emptyColourSectionRanges() {
  const out = {};
  for (const key of COLOUR_SECTION_RANGE_KEYS) out[key] = "";
  out.external = COLORBOND_RANGE_KEY;
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
  if (!base.external) base.external = COLORBOND_RANGE_KEY;
  return base;
}

/**
 * Build dropdown option labels from a catalogue payload.
 * Duplicate names across subgroups become "Name (Subgroup)".
 */
export function colourOptionLabelsFromCatalogue(catalogue) {
  const samples = Array.isArray(catalogue?.samples) ? catalogue.samples : [];
  const byName = new Map();
  for (const sample of samples) {
    const name = String(sample?.name || "").trim();
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(sample);
  }
  const labels = [];
  for (const [name, list] of byName) {
    if (list.length === 1) {
      labels.push(name);
      continue;
    }
    for (const sample of list) {
      const subgroup = String(sample.subgroup || sample.subgroup_name || "").trim();
      labels.push(subgroup ? `${name} (${subgroup})` : name);
    }
  }
  labels.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return labels;
}
