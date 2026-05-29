function buildProjectQuery({ view, planningSection, t } = {}) {
  const params = new URLSearchParams();
  if (view) params.set("view", view);
  if (planningSection) params.set("planningSection", planningSection);
  if (t != null) params.set("t", String(t));
  return params.toString();
}

/** Build internal project page path using opaque access_token (not numeric id). */
export function projectPath(project, { view, planningSection, t } = {}) {
  const token =
    typeof project === "string"
      ? project
      : project?.access_token;
  if (!token) return "/projects";
  const qs = buildProjectQuery({ view, planningSection, t });
  return `/project/${token}${qs ? `?${qs}` : ""}`;
}

/** Build client portal project page path. */
export function portalProjectPath(project, { view, planningSection, t } = {}) {
  const token =
    typeof project === "string"
      ? project
      : project?.access_token;
  if (!token) return "/portal";
  const qs = buildProjectQuery({ view, planningSection, t });
  return `/portal/projects/${token}${qs ? `?${qs}` : ""}`;
}
