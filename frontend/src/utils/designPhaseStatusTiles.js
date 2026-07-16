import { STREAM, INDICATOR, UI } from "./uiThemeTokens.js";
import { getOverviewIndicatorStyle } from "./uiButtonStyles.js";

const PAGE_TEXT = UI.pageText;

const indicatorFallbacks = {
  red: STREAM.qldRed,
  orange: INDICATOR.orange,
  green: STREAM.streamGreen,
  text: PAGE_TEXT,
};

function indicatorRed() {
  return getOverviewIndicatorStyle("red", indicatorFallbacks);
}
function indicatorOrange() {
  return getOverviewIndicatorStyle("orange", indicatorFallbacks);
}
function indicatorGreen() {
  return getOverviewIndicatorStyle("green", indicatorFallbacks);
}

/** Read staff snake_case or client camelCase project fields. */
function field(project, snakeKey, camelKey) {
  if (!project) return undefined;
  if (project[snakeKey] !== undefined && project[snakeKey] !== null) return project[snakeKey];
  if (camelKey && project[camelKey] !== undefined && project[camelKey] !== null) return project[camelKey];
  return undefined;
}

function calculateFullDeposit(project) {
  const cost = field(project, "project_cost", "projectCost");
  if (!cost) return 0;
  const costNum = parseInt(String(cost).replace(/[^0-9]/g, ""), 10) || 0;
  return Math.floor(costNum / 20);
}

function isDepositFullyPaid(project) {
  const deposit = field(project, "deposit", "deposit");
  const cost = field(project, "project_cost", "projectCost");
  if (!deposit || !cost) return false;
  const depositNum = parseInt(String(deposit).replace(/[^0-9]/g, ""), 10) || 0;
  const fullDeposit = calculateFullDeposit(project);
  return depositNum >= fullDeposit && fullDeposit > 0;
}

function getDepositStatus(project) {
  const preset = field(project, "deposit_status", "depositStatus");
  if (preset != null && String(preset).trim() !== "") return String(preset);

  const deposit = field(project, "deposit", "deposit");
  const cost = field(project, "project_cost", "projectCost");
  if (!deposit || !cost) return "No Deposit";
  return isDepositFullyPaid(project) ? "Full Deposit" : "Partial Deposit";
}

function getDepositStatusIndicator(project) {
  const status = getDepositStatus(project);
  if (status === "Full Deposit") return indicatorGreen();
  return indicatorRed();
}

function getDrawingsStatusIndicator(project) {
  const status = field(project, "drawings_status", "drawingsStatus") || "Not Assigned";
  if (status === "Concept Stage") return indicatorOrange();
  if (status === "Working Drawing Stage") return indicatorOrange();
  if (status === "Drawings Complete") return indicatorGreen();
  return indicatorRed();
}

function getColoursStatusIndicator(project) {
  const status = field(project, "colours_status", "coloursStatus") || "Not Sent";
  if (status === "Sent") return indicatorOrange();
  if (status === "Complete") return indicatorGreen();
  return indicatorRed();
}

function getWindowStatusIndicator(project) {
  const status = field(project, "window_status", "windowStatus") || "Not Ordered";
  if (status === "Ordered") return indicatorOrange();
  if (status === "Complete") return indicatorGreen();
  return indicatorRed();
}

function getSiteVisitStatusIndicator(project) {
  const status = field(project, "site_visit_status", "siteVisitStatus") || "Not Complete";
  if (status === "Booked") return indicatorOrange();
  if (status === "Complete") return indicatorGreen();
  return indicatorRed();
}

function getContractStatusText(project) {
  const preset = field(project, "contract_status_text", "contractStatusText");
  if (preset != null && String(preset).trim() !== "") return String(preset);

  const contractStatus = field(project, "contract_status", "contractStatus") || "Not Sent";
  const supportingDocsStatus =
    field(project, "supporting_documents_status", "supportingDocumentsStatus") || "Not Sent";
  const waterDeclStatus =
    field(project, "water_declaration_status", "waterDeclarationStatus") || "Not Required";

  const isContractComplete = contractStatus === "Complete";
  const isSupportingDocsComplete = supportingDocsStatus === "Complete";
  const isWaterDeclComplete =
    waterDeclStatus === "Complete" || waterDeclStatus === "Not Required";

  if (isContractComplete && isSupportingDocsComplete && isWaterDeclComplete) {
    return "All Documents Complete";
  }
  return "Documents Missing";
}

function getContractStatusIndicator(project) {
  const contractStatus = field(project, "contract_status", "contractStatus") || "Not Sent";
  const supportingDocsStatus =
    field(project, "supporting_documents_status", "supportingDocumentsStatus") || "Not Sent";
  const waterDeclStatus =
    field(project, "water_declaration_status", "waterDeclarationStatus") || "Not Required";

  if (
    contractStatus === "Complete" &&
    supportingDocsStatus === "Complete" &&
    (waterDeclStatus === "Complete" || waterDeclStatus === "Not Required")
  ) {
    return indicatorGreen();
  }
  if (contractStatus === "Sent") return indicatorOrange();
  return indicatorRed();
}

function getPlanningPermitStatusIndicator(project) {
  const status = field(project, "planning_status", "planningStatus") || "Not Selected";
  if (status === "No Planning Required" || status === "Planning Permit Issued") {
    return indicatorGreen();
  }
  return indicatorRed();
}

function getEnergyReportStatusIndicator(project) {
  const status = field(project, "energy_report_status", "energyReportStatus") || "Not Submitted";
  if (status === "Complete") return indicatorGreen();
  if (status === "Sent") return indicatorOrange();
  return indicatorRed();
}

function getFootingCertificationStatusIndicator(project) {
  const status =
    field(project, "footing_certification_status", "footingCertificationStatus") || "Not Submitted";
  if (status === "Complete") return indicatorGreen();
  if (status === "Sent") return indicatorOrange();
  return indicatorRed();
}

function getBuildingPermitStatusIndicator(project) {
  const status = field(project, "building_permit_status", "buildingPermitStatus") || "Not Submitted";
  if (status === "Complete") return indicatorGreen();
  if (status === "Sent") return indicatorOrange();
  return indicatorRed();
}

function getPicStatusIndicator(project) {
  const pic = field(project, "pic", "pic");
  return (pic || "No") === "Yes" ? indicatorGreen() : indicatorRed();
}

function getSurveySoilsStatusText(project) {
  const preset = field(project, "survey_soils_status_text", "surveySoilsStatusText");
  if (preset != null && String(preset).trim() !== "") return String(preset);

  const surveyStatus = field(project, "survey_status", "surveyStatus") || "Not Booked";
  const soilStatus = field(project, "soil_status", "soilStatus") || "Not Booked";

  if (surveyStatus === "Complete" && soilStatus === "Complete") return "Complete";
  if (surveyStatus === "Not Booked" && soilStatus === "Not Booked") return "Not Booked";
  return "In Progress";
}

function getSurveySoilsStatusIndicator(project) {
  const surveyStatus = field(project, "survey_status", "surveyStatus") || "Not Booked";
  const soilStatus = field(project, "soil_status", "soilStatus") || "Not Booked";

  if (surveyStatus === "Not Booked" && soilStatus === "Not Booked") return indicatorRed();
  if (surveyStatus === "Complete" && soilStatus === "Complete") return indicatorGreen();
  return indicatorOrange();
}

/**
 * Design phase status tiles (deposit, drawings, site visit, etc.) with RAG colours.
 */
export function buildDesignPhaseStatusTiles(project) {
  if (!project) return [];

  return [
    {
      key: "deposit",
      label: "Deposit",
      value: getDepositStatus(project),
      indicatorStyle: getDepositStatusIndicator(project),
      view: "admin",
    },
    {
      key: "drawings",
      label: "Drawings",
      value: field(project, "drawings_status", "drawingsStatus") || "Not Assigned",
      indicatorStyle: getDrawingsStatusIndicator(project),
      view: "drawings",
    },
    {
      key: "site-visit",
      label: "Site Visit",
      value: field(project, "site_visit_status", "siteVisitStatus") || "Not Complete",
      indicatorStyle: getSiteVisitStatusIndicator(project),
      view: "site-visit",
    },
    {
      key: "colours",
      label: "Colours",
      value: field(project, "colours_status", "coloursStatus") || "Not Sent",
      indicatorStyle: getColoursStatusIndicator(project),
      view: "colours",
    },
    {
      key: "windows",
      label: "Windows",
      value: field(project, "window_status", "windowStatus") || "Not Ordered",
      indicatorStyle: getWindowStatusIndicator(project),
      view: "windows",
    },
    {
      key: "contract",
      label: "Contract",
      value: getContractStatusText(project),
      indicatorStyle: getContractStatusIndicator(project),
      view: "contract",
    },
    {
      key: "survey-soils",
      label: "Survey & Soils",
      value: getSurveySoilsStatusText(project),
      indicatorStyle: getSurveySoilsStatusIndicator(project),
      view: "survey-soil",
    },
    {
      key: "planning",
      label: "Planning Permit",
      value: field(project, "planning_status", "planningStatus") || "Not Selected",
      indicatorStyle: getPlanningPermitStatusIndicator(project),
      view: "planning",
    },
    {
      key: "energy",
      label: "Energy Report",
      value: field(project, "energy_report_status", "energyReportStatus") || "Not Submitted",
      indicatorStyle: getEnergyReportStatusIndicator(project),
      view: "planning",
    },
    {
      key: "footing",
      label: "Footing Certification",
      value:
        field(project, "footing_certification_status", "footingCertificationStatus") || "Not Submitted",
      indicatorStyle: getFootingCertificationStatusIndicator(project),
      view: "planning",
    },
    {
      key: "building-permit",
      label: "Building Permit",
      value: field(project, "building_permit_status", "buildingPermitStatus") || "Not Submitted",
      indicatorStyle: getBuildingPermitStatusIndicator(project),
      view: "planning",
    },
    {
      key: "pic",
      label: "PIC",
      value: field(project, "pic", "pic") === "Yes" ? "Yes" : "No",
      indicatorStyle: getPicStatusIndicator(project),
      view: "planning",
    },
  ];
}
