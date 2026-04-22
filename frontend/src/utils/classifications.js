/** Canonical classification labels (dropdown order / sort order). */
export const CLASSIFICATION_OPTIONS = [
  "Small Second Dwelling",
  "Dependant Persons Unit",
  "Detached Extension",
  "Dwelling",
  "Home Office / Studio",
  "Dwelling & DPU",
  "Dwelling & SSD",
  "SSD & DPU",
  "Renovation",
  "Dual Occ",
];

const BADGE_GREY = "#a1a1a3";

/** Short labels used in new-project flow (e.g. PDF line). */
export const CLASSIFICATION_ABBREV_MAP = {
  "Small Second Dwelling": "SSD",
  "Dependant Persons Unit": "DPU",
  "Detached Extension": "DEX",
  Dwelling: "DWE",
  "Home Office / Studio": "OFFICE",
  "Dwelling & DPU": "D&DPU",
  "Dwelling & SSD": "D&SSD",
  "SSD & DPU": "SSD&DPU",
  Renovation: "REN",
  "Dual Occ": "DOC",
};

/** Acronym + colour for project cards and grids. */
export const CLASSIFICATION_BADGE_MAP = {
  "Small Second Dwelling": { acronym: "SSD", color: BADGE_GREY },
  "Dependant Persons Unit": { acronym: "DPU", color: BADGE_GREY },
  "Detached Extension": { acronym: "DEX", color: BADGE_GREY },
  Dwelling: { acronym: "DWE", color: BADGE_GREY },
  "Home Office / Studio": { acronym: "OFFICE", color: BADGE_GREY },
  "Dwelling & DPU": { acronym: "D&DPU", color: BADGE_GREY },
  "Dwelling & SSD": { acronym: "D&SSD", color: BADGE_GREY },
  "SSD & DPU": { acronym: "SSD&DPU", color: BADGE_GREY },
  Renovation: { acronym: "REN", color: BADGE_GREY },
  "Dual Occ": { acronym: "DOC", color: BADGE_GREY },
};
