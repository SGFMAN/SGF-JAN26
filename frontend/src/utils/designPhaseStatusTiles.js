import { STREAM, INDICATOR, TEXT } from "./uiThemeTokens.js";
import { getOverviewIndicatorStyle } from "./uiButtonStyles.js";
import {
  getMandatoryPlanningOverviewKind,
  getBuildingPermitOverviewKind,
  getPlanningRequirementOverviewKind,
  getSewerConnectionOverviewKind,
  getSewerConnectionStatusLabel,
  normalizeBuildingPermitStatus,
  normalizePlanningStatus,
} from "../constants/planningStatusFields.js";
import {
  getOverviewDepositStatusLabel,
  getOverviewDepositStatusLevel,
} from "./projectDeposit.js";
import { DRAWINGS_STATUS } from "./drawingsStatusRules.js";

const indicatorFallbacks = {
  red: STREAM.qldRed,
  orange: INDICATOR.orange,
  green: STREAM.streamGreen,
  text: TEXT.dark,
};

function indicatorRed() {
  return { ...getOverviewIndicatorStyle("red", indicatorFallbacks), variant: "red", color: TEXT.light };
}
function indicatorOrange() {
  return { ...getOverviewIndicatorStyle("orange", indicatorFallbacks), variant: "orange" };
}
function indicatorGreen() {
  return { ...getOverviewIndicatorStyle("green", indicatorFallbacks), variant: "green" };
}

/** Read staff snake_case or client camelCase project fields. */
function field(project, snakeKey, camelKey) {
  if (!project) return undefined;
  if (project[snakeKey] !== undefined && project[snakeKey] !== null) return project[snakeKey];
  if (camelKey && project[camelKey] !== undefined && project[camelKey] !== null) return project[camelKey];
  return undefined;
}

function getDepositStatus(project) {
  const preset = field(project, "deposit_status", "depositStatus");
  if (preset != null && String(preset).trim() !== "") return String(preset);
  return getOverviewDepositStatusLabel(project);
}

function getDepositStatusIndicator(project) {
  const preset = field(project, "deposit_status", "depositStatus");
  if (preset != null && String(preset).trim() !== "") {
    if (String(preset).trim() === "Full Deposit") return indicatorGreen();
    if (String(preset).trim() === "Partial Deposit") return indicatorOrange();
    return indicatorRed();
  }
  const level = getOverviewDepositStatusLevel(project);
  if (level === "complete") return indicatorGreen();
  if (level === "partial") return indicatorOrange();
  return indicatorRed();
}

function getDrawingsStatus(project) {
  return field(project, "drawings_status", "drawingsStatus") || DRAWINGS_STATUS.NOT_ASSIGNED;
}

function getConceptDrawingsStatus(project) {
  const status = getDrawingsStatus(project);
  if (status === DRAWINGS_STATUS.COMPLETE || status === DRAWINGS_STATUS.WORKING_STAGE) {
    return "Complete";
  }
  if (status === DRAWINGS_STATUS.CONCEPT_STAGE) return "In Progress";
  return "Incomplete";
}

function getConceptDrawingsStatusIndicator(project) {
  const label = getConceptDrawingsStatus(project);
  if (label === "Complete") return indicatorGreen();
  if (label === "In Progress") return indicatorOrange();
  return indicatorRed();
}

function hasWorkingDrawingsApproved(project) {
  const approvedDate = field(project, "drawings_working_approved_date", "drawingsWorkingApprovedDate");
  if (approvedDate != null && String(approvedDate).trim() !== "") return true;
  return getDrawingsStatus(project) === DRAWINGS_STATUS.COMPLETE;
}

function getWorkingDrawingsStatus(project) {
  if (hasWorkingDrawingsApproved(project)) return "Complete";
  const status = getDrawingsStatus(project);
  if (status === DRAWINGS_STATUS.WORKING_STAGE) return "In Progress";
  return "Incomplete";
}

function getWorkingDrawingsStatusIndicator(project) {
  const label = getWorkingDrawingsStatus(project);
  if (label === "Complete") return indicatorGreen();
  if (label === "In Progress") return indicatorOrange();
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

function isOverviewContractComplete(project) {
  const contractStatus = field(project, "contract_status", "contractStatus") || "Not Sent";
  const supportingDocsStatus =
    field(project, "supporting_documents_status", "supportingDocumentsStatus") || "Not Sent";
  const waterDeclStatus = field(project, "water_declaration_status", "waterDeclarationStatus");
  const waterAuthority = field(project, "water_authority", "waterAuthority") || "Not Required";
  return (
    contractStatus === "Complete" &&
    supportingDocsStatus === "Complete" &&
    (waterDeclStatus === "Complete" || waterAuthority === "Not Required")
  );
}

/** Overview Contract tile value ("All Documents Complete" | "Documents Missing"). */
export function getContractStatusText(project) {
  const preset = field(project, "contract_status_text", "contractStatusText");
  if (preset != null && String(preset).trim() !== "") return String(preset);
  return isOverviewContractComplete(project) ? "All Documents Complete" : "Documents Missing";
}

/** Overview Colours tile value (e.g. Not Sent / Sent / Complete). */
export function getColoursStatusText(project) {
  return field(project, "colours_status", "coloursStatus") || "Not Sent";
}

/** Replace {Contract Status} and {Color Status} with Overview status text. */
export function replaceContractAndColorStatusTokens(text, project) {
  if (text == null) return text;
  let replaced = String(text);
  replaced = replaced.replace(/\{Contract Status\}/g, getContractStatusText(project));
  replaced = replaced.replace(/\{Color Status\}/g, getColoursStatusText(project));
  return replaced;
}

function getContractStatusIndicator(project) {
  if (isOverviewContractComplete(project)) return indicatorGreen();
  const contractStatus = field(project, "contract_status", "contractStatus") || "Not Sent";
  const supportingDocsStatus =
    field(project, "supporting_documents_status", "supportingDocumentsStatus") || "Not Sent";
  if (contractStatus === "Not Sent" && supportingDocsStatus === "Not Sent") return indicatorRed();
  return indicatorOrange();
}

function overviewKindToIndicator(kind) {
  if (kind === "green") return indicatorGreen();
  if (kind === "orange") return indicatorOrange();
  return indicatorRed();
}

function getTownPlanningStatus(project) {
  // Prefer Planning page field; fall back to legacy planning_status for older records.
  const fromPlanningPage = field(project, "planning_town_planning", "planningTownPlanning");
  if (fromPlanningPage != null && String(fromPlanningPage).trim() !== "") {
    return normalizePlanningStatus(fromPlanningPage);
  }
  const legacy = field(project, "planning_status", "planningStatus");
  if (legacy === "No Planning Required" || legacy === "Planning Permit Issued") return "Complete";
  if (legacy === "Planning Required") return "Incomplete";
  return normalizePlanningStatus(legacy);
}

function getTownPlanningStatusIndicator(project) {
  return overviewKindToIndicator(getPlanningRequirementOverviewKind(getTownPlanningStatus(project)));
}

function getBalStatus(project) {
  return normalizePlanningStatus(field(project, "planning_bal", "planningBal"));
}

function getBalStatusIndicator(project) {
  return overviewKindToIndicator(getPlanningRequirementOverviewKind(getBalStatus(project)));
}

/** Energy / Footing: Incomplete → red; Complete → green. */
function hasStampDate(value) {
  return value != null && String(value).trim() !== "";
}

function getMandatoryStatusLabel(receivedAt) {
  return hasStampDate(receivedAt) ? "Complete" : "Incomplete";
}

function getEnergyReportStatus(project) {
  return getMandatoryStatusLabel(
    field(project, "planning_energy_report_received_at", "planningEnergyReportReceivedAt")
  );
}

function getEnergyReportStatusIndicator(project) {
  return overviewKindToIndicator(
    getMandatoryPlanningOverviewKind(
      null,
      field(project, "planning_energy_report_received_at", "planningEnergyReportReceivedAt")
    )
  );
}

function getFootingCertificationStatus(project) {
  return getMandatoryStatusLabel(
    field(project, "planning_footing_certification_received_at", "planningFootingCertificationReceivedAt")
  );
}

function getFootingCertificationStatusIndicator(project) {
  return overviewKindToIndicator(
    getMandatoryPlanningOverviewKind(
      null,
      field(project, "planning_footing_certification_received_at", "planningFootingCertificationReceivedAt")
    )
  );
}

function getBuildingPermitStatus(project) {
  return normalizeBuildingPermitStatus(
    field(project, "building_permit_status", "buildingPermitStatus"),
    field(project, "planning_building_permit_received_at", "planningBuildingPermitReceivedAt")
  );
}

function getBuildingPermitStatusIndicator(project) {
  return overviewKindToIndicator(getBuildingPermitOverviewKind(project));
}

function getSewerConnectionStatus(project) {
  return getSewerConnectionStatusLabel(project);
}

function getSewerConnectionStatusIndicator(project) {
  const kind = getSewerConnectionOverviewKind(project);
  if (kind === "green") return indicatorGreen();
  if (kind === "orange") return indicatorOrange();
  return indicatorRed();
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

export const OVERVIEW_STATUS_HEADINGS = [
  { key: "deposit", label: "Deposit" },
  { key: "concept-drawings", label: "Concept Drawings" },
  { key: "working-drawings", label: "Working Drawings" },
  { key: "site-visit", label: "Site Visit" },
  { key: "colours", label: "Colours" },
  { key: "windows", label: "Windows" },
  { key: "contract", label: "Contract" },
  { key: "survey-soils", label: "Survey & Soils" },
  { key: "town-planning", label: "Town Planning" },
  { key: "bal", label: "BAL" },
  { key: "energy", label: "Energy Report" },
  { key: "footing", label: "Footing Certification" },
  { key: "building-permit", label: "Building Permit" },
  { key: "sewer-connection", label: "Sewer Connection" },
];

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
      key: "concept-drawings",
      label: "Concept Drawings",
      value: getConceptDrawingsStatus(project),
      indicatorStyle: getConceptDrawingsStatusIndicator(project),
      view: "drawings",
    },
    {
      key: "working-drawings",
      label: "Working Drawings",
      value: getWorkingDrawingsStatus(project),
      indicatorStyle: getWorkingDrawingsStatusIndicator(project),
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
      key: "town-planning",
      label: "Town Planning",
      value: getTownPlanningStatus(project),
      indicatorStyle: getTownPlanningStatusIndicator(project),
      view: "planning",
    },
    {
      key: "bal",
      label: "BAL",
      value: getBalStatus(project),
      indicatorStyle: getBalStatusIndicator(project),
      view: "planning",
    },
    {
      key: "energy",
      label: "Energy Report",
      value: getEnergyReportStatus(project),
      indicatorStyle: getEnergyReportStatusIndicator(project),
      view: "planning",
    },
    {
      key: "footing",
      label: "Footing Certification",
      value: getFootingCertificationStatus(project),
      indicatorStyle: getFootingCertificationStatusIndicator(project),
      view: "planning",
    },
    {
      key: "building-permit",
      label: "Building Permit",
      value: getBuildingPermitStatus(project),
      indicatorStyle: getBuildingPermitStatusIndicator(project),
      view: "planning",
    },
    {
      key: "sewer-connection",
      label: "Sewer Connection",
      value: getSewerConnectionStatus(project),
      indicatorStyle: getSewerConnectionStatusIndicator(project),
      view: "planning",
    },
  ];
}
