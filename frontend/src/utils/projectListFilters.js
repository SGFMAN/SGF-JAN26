import { PROJECT_STATUS_OPTIONS } from "./projectStatus";
import { CLASSIFICATION_OPTIONS } from "./classifications";
import { BUILDING_PERMIT_STATUS_OPTIONS } from "../constants/planningStatusFields";
import {
  getDepositPaidFilterCategory,
  projectMatchesDepositPaidFilter,
} from "./projectDeposit";

export const FIELD_DEFINITIONS = {
  window_status: {
    label: "Windows",
    values: ["Not Ordered", "Ordered", "Complete"],
    defaultValue: "Not Ordered",
  },
  drawings_status: {
    label: "Drawings",
    values: ["Not Assigned", "Concept Stage", "Working Drawing Stage", "Drawings Complete"],
    defaultValue: "Not Assigned",
  },
  colours_status: {
    label: "Colours",
    values: ["Not Sent", "Sent", "Complete"],
    defaultValue: "Not Sent",
  },
  site_visit_status: {
    label: "Site Visit",
    values: ["Not Complete", "Email Sent", "Booked", "Complete"],
    defaultValue: "Not Complete",
  },
  contract_status: {
    label: "Contract",
    values: ["Not Sent", "Sent", "Complete"],
    defaultValue: "Not Sent",
  },
  supporting_documents_status: {
    label: "Supporting Documents",
    values: ["Not Sent", "Sent", "Complete"],
    defaultValue: "Not Sent",
  },
  water_declaration_status: {
    label: "Water Declaration",
    values: ["Not Required", "Not Sent", "Sent", "Complete"],
    defaultValue: "Not Required",
  },
  planning_status: {
    label: "Planning",
    values: ["Not Selected", "No Planning Required", "Planning Required", "Planning Permit Issued"],
    defaultValue: "Not Selected",
  },
  energy_report_status: {
    label: "Energy Report",
    values: ["Not Submitted", "Sent", "Complete"],
    defaultValue: "Not Submitted",
  },
  footing_certification_status: {
    label: "Footing Certification",
    values: ["Not Submitted", "Sent", "Complete"],
    defaultValue: "Not Submitted",
  },
  building_permit_status: {
    label: "Building Permit",
    values: BUILDING_PERMIT_STATUS_OPTIONS,
    defaultValue: "Not Submitted",
  },
  deposit: {
    label: "Deposit Paid",
    values: ["Full Deposit", "Partial Deposit", "No Deposit Paid", "Deposit Owed"],
    defaultValue: "Partial Deposit",
  },
  status: {
    label: "Project Status",
    values: PROJECT_STATUS_OPTIONS,
    defaultValue: "Pre-Engagement Phase",
  },
  year: {
    label: "Year",
    values: [],
    defaultValue: new Date().getFullYear().toString(),
  },
  classification: {
    label: "Classification",
    values: CLASSIFICATION_OPTIONS,
    defaultValue: "",
  },
};

const FILTER_SELECT_EXTRA = "3.25rem";

export const FILTER_BY_FIELD_LABELS = [
  "All fields",
  ...Object.values(FIELD_DEFINITIONS).map((def) => def.label),
];

export const PROJECT_LIST_ACTION_BUTTON_LABELS = [
  "VIC Only",
  "QLD Only",
  "All Projects",
  "Sort by Suburb",
  "Sort By Class",
  "Sort By Stream",
];

export const CLASSIFICATION_SORT_ORDER = FIELD_DEFINITIONS.classification.values;

export const STREAM_SORT_ORDER = [
  "SGF - VIC",
  "SGF - QLD",
  "Dual Dwelling",
  "ATA",
  "Pumped on Property",
  "Pumped On Property",
  "Henderson",
  "Creat Cash Flow",
  "Create Cash Flow",
  "Fresh Start Advisory",
];

export function filterSelectWidth(...labelGroups) {
  const labels = labelGroups.flat().map(String);
  const maxLen = Math.max(0, ...labels.map((label) => label.length));
  return `calc(${maxLen}ch + ${FILTER_SELECT_EXTRA})`;
}

export function getEffectiveValue(project, fieldName) {
  const fieldDef = FIELD_DEFINITIONS[fieldName];
  if (!fieldDef) return project[fieldName] || "";

  let value = project[fieldName];

  if (fieldName === "deposit") {
    return getDepositPaidFilterCategory(project);
  }

  if (fieldName === "year" && value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      value = value.substring(0, 4);
    }
    if (!value || value === null || value === undefined || value === "") {
      return fieldDef.defaultValue || "";
    }
    return value;
  }

  if (!value || value === null || value === undefined || value === "") {
    return fieldDef.defaultValue || "";
  }
  return value;
}

export function getAvailableFieldValues(projects, selectedField, scopeFilter) {
  if (!selectedField) return [];

  const fieldDef = FIELD_DEFINITIONS[selectedField];
  if (!fieldDef) return [];

  if (selectedField === "deposit" || selectedField === "drawings_status") {
    return fieldDef.values;
  }

  const projectValues = new Set();
  projects.forEach((project) => {
    if (scopeFilter(project)) {
      const effectiveValue = getEffectiveValue(project, selectedField);
      if (effectiveValue) {
        projectValues.add(effectiveValue);
      }
    }
  });

  if (selectedField === "year") {
    return Array.from(projectValues).sort((a, b) => b.localeCompare(a));
  }

  const allValues = new Set([...fieldDef.values, ...Array.from(projectValues)]);
  return Array.from(allValues).sort();
}

/** Search suburb/street/name plus client contact emails (1–3), ignoring active checkboxes. */
export function matchesSearch(project, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  const suburb = (project.suburb || "").toLowerCase();
  const street = (project.street || "").toLowerCase();
  const name = (project.name || "").toLowerCase();
  if (suburb.includes(q) || street.includes(q) || name.includes(q)) return true;

  // Contact emails — match even when the contact is unchecked / inactive
  const emails = [
    project.client1_email,
    project.client2_email,
    project.client3_email,
    project.email, // legacy primary email
  ];
  return emails.some((raw) => {
    const email = String(raw ?? "").trim().toLowerCase();
    return email !== "" && email.includes(q);
  });
}

export function sortProjects(list, sortMode) {
  list.sort((a, b) => {
    const suburbA = (a.suburb || "").toLowerCase();
    const suburbB = (b.suburb || "").toLowerCase();
    const streetA = (a.street || "").toLowerCase();
    const streetB = (b.street || "").toLowerCase();

    if (sortMode === "class") {
      const classA = a.classification || "";
      const classB = b.classification || "";
      const idxA = CLASSIFICATION_SORT_ORDER.indexOf(classA);
      const idxB = CLASSIFICATION_SORT_ORDER.indexOf(classB);
      const safeIdxA = idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA;
      const safeIdxB = idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB;
      if (safeIdxA !== safeIdxB) return safeIdxA - safeIdxB;
      if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
      return streetA.localeCompare(streetB);
    }

    if (sortMode === "stream") {
      const streamA = a.stream || "";
      const streamB = b.stream || "";
      const idxA = STREAM_SORT_ORDER.indexOf(streamA);
      const idxB = STREAM_SORT_ORDER.indexOf(streamB);
      const safeIdxA = idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA;
      const safeIdxB = idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB;
      if (safeIdxA !== safeIdxB) return safeIdxA - safeIdxB;
      if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
      return streetA.localeCompare(streetB);
    }

    if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
    return streetA.localeCompare(streetB);
  });
}

export function applyProjectListFilters(projects, options) {
  const {
    scopeFilter,
    stateFilter,
    selectedField,
    selectedValue,
    searchQuery,
    sortMode = "suburb",
  } = options;

  let filtered = projects.filter(scopeFilter);

  if (stateFilter !== "All") {
    filtered = filtered.filter((project) => {
      const projectState = (project.state || "").toUpperCase();
      return projectState === stateFilter.toUpperCase();
    });
  }

  if (selectedField && selectedValue) {
    filtered = filtered.filter((project) => {
      if (selectedField === "deposit") {
        return projectMatchesDepositPaidFilter(project, selectedValue);
      }
      const effectiveValue = getEffectiveValue(project, selectedField);
      return effectiveValue === selectedValue;
    });
  }

  if (searchQuery?.trim()) {
    filtered = filtered.filter((project) => matchesSearch(project, searchQuery));
  }

  sortProjects(filtered, sortMode);
  return filtered;
}

export function buildProjectListHeadingCount({
  totalCount,
  filteredCount,
  searchQuery,
  selectedField,
  selectedValue,
  stateFilter,
}) {
  if (selectedField && selectedValue) {
    return `(${filteredCount} found)`;
  }
  if (searchQuery?.trim()) {
    return `(${filteredCount} found)`;
  }
  if (stateFilter !== "All") {
    return `(${filteredCount} total)`;
  }
  return totalCount > 0 ? `(${totalCount} total)` : "";
}
