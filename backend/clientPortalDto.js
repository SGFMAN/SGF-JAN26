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

function parseMoneyInt(value) {
  if (value == null || value === "") return 0;
  return parseInt(String(value).replace(/[^0-9]/g, ""), 10) || 0;
}

function deriveDepositStatus(row) {
  const depositNum = parseMoneyInt(row.deposit);
  const costNum = parseMoneyInt(row.project_cost);
  if (!depositNum || !costNum) return "No Deposit";
  const fullDeposit = Math.floor(costNum / 20);
  if (fullDeposit > 0 && depositNum >= fullDeposit) return "Full Deposit";
  return "Partial Deposit";
}

function deriveContractStatusText(row) {
  const contractStatus = row.contract_status != null ? String(row.contract_status) : "Not Sent";
  const supportingDocsStatus =
    row.supporting_documents_status != null ? String(row.supporting_documents_status) : "Not Sent";
  const waterDeclStatus =
    row.water_declaration_status != null ? String(row.water_declaration_status) : "Not Required";

  if (
    contractStatus === "Complete" &&
    supportingDocsStatus === "Complete" &&
    (waterDeclStatus === "Complete" || waterDeclStatus === "Not Required")
  ) {
    return "All Documents Complete";
  }
  return "Documents Missing";
}

function deriveSurveySoilsStatusText(row) {
  const surveyStatus = row.survey_status != null ? String(row.survey_status) : "Not Booked";
  const soilStatus = row.soil_status != null ? String(row.soil_status) : "Not Booked";
  if (surveyStatus === "Complete" && soilStatus === "Complete") return "Complete";
  if (surveyStatus === "Not Booked" && soilStatus === "Not Booked") return "Not Booked";
  return "In Progress";
}

function pickString(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  return s || null;
}

/**
 * Build a client-safe project overview object (status tiles only).
 */
function toClientProjectOverviewDto(row) {
  return {
    projectId: row.id,
    address: formatAddress(row),
    projectInfo: {
      status: pickString(row.status),
      onHold: row.on_hold === true || row.on_hold === "true",
      street: pickString(row.street),
      suburb: pickString(row.suburb),
      state: pickString(row.state),
      specs: pickString(row.specs),
      classification: pickString(row.classification),
      qpNumber: pickString(row.qp_number),
    },
    hasDrawing: Boolean(pickString(row.drawings_pdf_location)),
    depositStatus: deriveDepositStatus(row),
    drawingsStatus: pickString(row.drawings_status) || "Not Assigned",
    drawings_status: pickString(row.drawings_status) || "Not Assigned",
    drawings_working_approved_date: pickString(row.drawings_working_approved_date),
    siteVisitStatus: pickString(row.site_visit_status) || "Not Complete",
    site_visit_status: pickString(row.site_visit_status) || "Not Complete",
    coloursStatus: pickString(row.colours_status) || "Not Sent",
    colours_status: pickString(row.colours_status) || "Not Sent",
    windowStatus: pickString(row.window_status) || "Not Ordered",
    window_status: pickString(row.window_status) || "Not Ordered",
    contractStatusText: deriveContractStatusText(row),
    contractStatus: pickString(row.contract_status) || "Not Sent",
    contract_status: pickString(row.contract_status) || "Not Sent",
    supportingDocumentsStatus: pickString(row.supporting_documents_status) || "Not Sent",
    supporting_documents_status: pickString(row.supporting_documents_status) || "Not Sent",
    waterDeclarationStatus: pickString(row.water_declaration_status) || "Not Required",
    water_declaration_status: pickString(row.water_declaration_status) || "Not Required",
    water_authority: pickString(row.water_authority) || "Not Required",
    surveySoilsStatusText: deriveSurveySoilsStatusText(row),
    surveyStatus: pickString(row.survey_status) || "Not Booked",
    survey_status: pickString(row.survey_status) || "Not Booked",
    soilStatus: pickString(row.soil_status) || "Not Booked",
    soil_status: pickString(row.soil_status) || "Not Booked",
    planningStatus: pickString(row.planning_status) || "Not Selected",
    planning_status: pickString(row.planning_status) || "Not Selected",
    planning_town_planning: pickString(row.planning_town_planning),
    planning_bal: pickString(row.planning_bal),
    planning_energy_report_received_at: pickString(row.planning_energy_report_received_at),
    planning_footing_certification_received_at: pickString(row.planning_footing_certification_received_at),
    planning_building_permit_received_at: pickString(row.planning_building_permit_received_at),
    planning_sewer_connection: pickString(row.planning_sewer_connection),
    planning_sewer_septic_permit: pickString(row.planning_sewer_septic_permit),
    energyReportStatus: pickString(row.energy_report_status) || "Not Submitted",
    footingCertificationStatus: pickString(row.footing_certification_status) || "Not Submitted",
    buildingPermitStatus: pickString(row.building_permit_status) || "Not Submitted",
    pic: pickString(row.pic) === "Yes" ? "Yes" : "No",
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
    on_hold,
    specs,
    classification,
    qp_number,
    deposit,
    project_cost,
    drawings_status,
    drawings_pdf_location,
    drawings_working_approved_date,
    site_visit_status,
    colours_status,
    window_status,
    contract_status,
    supporting_documents_status,
    water_declaration_status,
    water_authority,
    survey_status,
    soil_status,
    planning_status,
    planning_town_planning,
    planning_bal,
    planning_energy_report_received_at,
    planning_footing_certification_received_at,
    planning_building_permit_received_at,
    planning_sewer_connection,
    planning_sewer_septic_permit,
    energy_report_status,
    footing_certification_status,
    building_permit_status,
    pic
  FROM projects
  WHERE id = $1
`;

module.exports = {
  toClientProjectOverviewDto,
  CLIENT_PROJECT_SELECT,
};
