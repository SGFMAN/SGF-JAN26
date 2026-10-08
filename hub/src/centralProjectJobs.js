import { getApiHeaders } from "./auth";

export function missingField(name) {
  return `${name} *`;
}

/** Specs on the Central project: Affordable is a panel roof, Superior is a truss roof. */
export function roofTypeFromSpecs(specs) {
  const value = String(specs || "").trim().toLowerCase();
  if (value === "affordable") return "panel";
  if (value === "superior") return "truss";
  return "undefined";
}

export function roofTypeLabel(roofType) {
  if (roofType === "panel") return "Panel";
  if (roofType === "truss") return "Truss";
  return "undefined";
}

/** Panel and Truss are stored on the project as Affordable and Superior. */
export function specsFromRoofType(roofType) {
  if (roofType === "panel") return "Affordable";
  if (roofType === "truss") return "Superior";
  return null;
}

function stateCode(state) {
  const s = String(state || "").trim().toUpperCase();
  if (s === "VIC" || s === "VICTORIA") return "VIC";
  if (s === "QLD" || s === "QUEENSLAND") return "QLD";
  return s;
}

function missingStage() {
  return {
    key: "need-to-sort",
    label: missingField("Stage"),
    order: 1,
    allowNA: false,
    status: "not_started",
    startDate: null,
    dueDate: null,
    doneDate: null,
    assigneeAccountId: null,
    assigneeName: "",
    late: false,
  };
}

/** Shape a Central project into the job-tracking object, using only columns that exist. */
export function projectToTrackingJob(project) {
  const address = [project.street, project.suburb].filter(Boolean).join(", ") || project.name || "";
  const onHold = project.on_hold === true || project.on_hold === "true" || project.on_hold === "t";
  return {
    id: project.id,
    jobNo: `J${String(project.id).padStart(3, "0")}`,
    address,
    clientName: project.client1_name || project.client_name || "",
    clientPhone: project.client1_phone || project.phone || "",
    clientEmail: project.client1_email || project.email || "",
    jobType: project.classification || "",
    pmUserId: null,
    pmName: "",
    state: stateCode(project.state) || "",
    stages: [missingStage()],
    currentStageLabel: missingField("Stage"),
    currentStageKey: "need-to-sort",
    stagePercent: null,
    gaps: true,
    onHold,
    onHoldReason: project.on_hold_reason || "",
    late: false,
    notStarted: false,
    complete: false,
    archived: false,
    roofType: roofTypeFromSpecs(project.specs),
    sitingCompleted: false,
    contractStatus: project.contract_status || "",
    contractSignedDate: project.contract_complete_date ? String(project.contract_complete_date).slice(0, 10) : null,
    jobInfo: {
      contractValue: missingField("Contract value"),
      targetHandover: missingField("Target handover"),
      permitNumber: missingField("Permit no."),
      buildingSurveyor: missingField("Building surveyor"),
      council: missingField("Council"),
    },
    commencement: {
      contractDate: "",
      dateOfCommencement: "",
      buildingPeriodDays: null,
      emailedAt: null,
      emailedTo: "",
    },
    updatedAt: project.updated_at,
  };
}

export async function loadCentralProjectJobs(region) {
  const res = await fetch("/api/projects", { headers: getApiHeaders() });
  if (!res.ok) throw new Error("Failed to load projects");
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error("Failed to load projects");
  const want = stateCode(region);
  return rows
    .filter((project) => {
      const status = String(project.status || "");
      if (status === "Cancelled" || status === "Hotlist") return false;
      if (want && stateCode(project.state) !== want) return false;
      return true;
    })
    .map(projectToTrackingJob);
}

export async function loadCentralProjectJob(jobId) {
  const jobs = await loadCentralProjectJobs("");
  const job = jobs.find((item) => Number(item.id) === Number(jobId));
  if (!job) throw new Error("Job not found");
  return job;
}
