/**
 * Client Portal overview DTO — never return the full staff project row.
 */

const { DRAFTSPERSON_UNASSIGNED } = require("./draftspersonConstants");

function formatAddress(row) {
  const street = row.street != null ? String(row.street).trim() : "";
  const suburb = row.suburb != null ? String(row.suburb).trim() : "";
  const state = row.state != null ? String(row.state).trim() : "";
  const parts = [street, suburb, state].filter(Boolean);
  if (parts.length) return parts.join(", ");
  const name = row.name != null ? String(row.name).trim() : "";
  return name || "Project";
}

function formatDraftsperson(raw) {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t || t === DRAFTSPERSON_UNASSIGNED) return null;
  return t;
}

function deriveExpectedNextStep(row) {
  const sub = row.substatus != null ? String(row.substatus).trim() : "";
  const detail = row.substatus_detail != null ? String(row.substatus_detail).trim() : "";
  if (sub && detail) return `${sub} — ${detail}`;
  if (sub) return sub;

  const drawings = row.drawings_status != null ? String(row.drawings_status).trim() : "";
  if (drawings && drawings !== "Not Assigned") {
    return `Drawings: ${drawings}`;
  }

  const status = row.status != null ? String(row.status).trim() : "";
  if (status) return `Current stage: ${status}`;
  return "Your project team will be in touch with the next steps.";
}

function pickDate(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  return s || null;
}

/**
 * Build a client-safe project overview object.
 */
function toClientProjectOverviewDto(row) {
  const importantDates = {
    siteVisitDate: pickDate(row.site_visit_date),
    siteVisitScheduledDate: pickDate(row.site_visit_scheduled_date),
    contractSentDate: pickDate(row.contract_sent_date),
    contractCompleteDate: pickDate(row.contract_complete_date),
    drawingsSentToClientDate: pickDate(row.drawings_sent_to_client_date),
    coloursSentDate: pickDate(row.colours_sent_date),
  };

  return {
    projectId: row.id,
    address: formatAddress(row),
    status: row.status != null ? String(row.status) : null,
    substatus: row.substatus != null ? String(row.substatus) : null,
    substatusDetail: row.substatus_detail != null ? String(row.substatus_detail) : null,
    salesConsultant: row.salesperson != null ? String(row.salesperson).trim() || null : null,
    projectConsultant: formatDraftsperson(row.draftsperson),
    expectedNextStep: deriveExpectedNextStep(row),
    importantDates,
  };
}

const CLIENT_PROJECT_SELECT = `
  SELECT
    id,
    name,
    status,
    suburb,
    street,
    state,
    salesperson,
    draftsperson,
    substatus,
    substatus_detail,
    drawings_status,
    site_visit_date,
    site_visit_scheduled_date,
    contract_sent_date,
    contract_complete_date,
    drawings_sent_to_client_date,
    colours_sent_date
  FROM projects
  WHERE id = $1
`;

module.exports = {
  toClientProjectOverviewDto,
  CLIENT_PROJECT_SELECT,
};
