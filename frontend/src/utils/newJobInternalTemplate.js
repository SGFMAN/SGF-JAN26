/**
 * NEW JOB internal email: QLD uses a dedicated template; all other states use the default VIC template.
 */
export function getNewJobInternalTemplateName(project) {
  const state = (project?.state || "").toString().trim().toUpperCase();
  return state === "QLD" ? "NEW JOB - Internal - QLD" : "NEW JOB - Internal";
}
