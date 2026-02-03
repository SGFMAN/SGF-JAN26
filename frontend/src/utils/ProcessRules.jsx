// Process Rules for project workflow
// These rules define dependencies and order of operations

export const PROCESS_RULES = {
  buildingPermit: {
    name: "Building Permit Submission",
    description: "We can't make the submission for the building permit until we have:",
    requirements: [
      {
        field: "drawings_status",
        value: "Working Drawings Approved",
        label: "Working drawings approved by the client",
        check: (project) => project?.drawings_status === "Working Drawings Approved"
      },
      {
        field: "colours_status",
        value: "Complete",
        label: "Colours supplied to us by the client",
        check: (project) => project?.colours_status === "Complete"
      },
      {
        field: "window_status",
        value: "Ordered",
        label: "Windows Ordered",
        check: (project) => project?.window_status === "Ordered" || project?.window_status === "Complete"
      },
      {
        field: "site_visit_status",
        value: "Complete",
        label: "We have completed a site visit",
        check: (project) => project?.site_visit_status === "Complete"
      },
      {
        field: "contract_status",
        value: "Complete",
        label: "The client has signed their contract",
        check: (project) => project?.contract_status === "Complete"
      },
      {
        field: "supporting_documents_status",
        value: "Complete",
        label: "The client has supplied their supporting documents",
        check: (project) => project?.supporting_documents_status === "Complete"
      },
      {
        field: "deposit",
        value: "Full Deposit",
        label: "The full deposit has been paid",
        check: (project) => {
          if (!project?.deposit || !project?.project_cost) return false;
          const depositStr = project.deposit.toString().replace(/[^0-9]/g, "");
          const depositNum = parseInt(depositStr) || 0;
          const projectCostStr = project.project_cost.toString().replace(/[^0-9]/g, "");
          const projectCostNum = parseInt(projectCostStr) || 0;
          const fullDeposit = Math.floor(projectCostNum / 20);
          return depositNum >= fullDeposit && fullDeposit > 0;
        }
      },
      {
        field: "planning_status",
        value: "Planning Permit Issued",
        label: "We have a planning permit (if required)",
        check: (project) => {
          const status = project?.planning_status || "Not Selected";
          return status === "Planning Permit Issued" || status === "No Planning Required";
        }
      },
      {
        field: "energy_report_status",
        value: "Complete",
        label: "We have received a 7 star energy report",
        check: (project) => project?.energy_report_status === "Complete"
      },
      {
        field: "footing_certification_status",
        value: "Complete",
        label: "We have received foot certification",
        check: (project) => project?.footing_certification_status === "Complete"
      }
    ]
  },
  contract: {
    name: "Master Builder's Contract",
    description: "Master Builder's Contract will be sent out soon if we haven't already",
    requirements: [
      {
        field: "contract_status",
        value: "Sent",
        label: "Master Builder's Contract has been sent",
        check: (project) => {
          const status = project?.contract_status || "Not Sent";
          return status === "Sent" || status === "Complete";
        }
      }
    ]
  },
  windows: {
    name: "Windows Ordering",
    description: "We need approved working drawings and colours provided by client before we can order windows",
    requirements: [
      {
        field: "drawings_status",
        value: "Working Drawings Approved",
        label: "Working drawings approved by the client",
        check: (project) => project?.drawings_status === "Working Drawings Approved"
      },
      {
        field: "colours_status",
        value: "Complete",
        label: "Colours supplied to us by the client",
        check: (project) => project?.colours_status === "Complete"
      }
    ]
  }
};

// Get status of a requirement
export function getRequirementStatus(requirement, project) {
  return requirement.check(project);
}

// Get all unmet requirements for a rule
export function getUnmetRequirements(rule, project) {
  return rule.requirements.filter(req => !getRequirementStatus(req, project));
}

// Get all met requirements for a rule
export function getMetRequirements(rule, project) {
  return rule.requirements.filter(req => getRequirementStatus(req, project));
}
