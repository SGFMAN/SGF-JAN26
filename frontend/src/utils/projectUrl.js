/** Build internal project page path using opaque access_token (not numeric id). */
export function projectPath(project, { view, t } = {}) {
  const token =
    typeof project === "string"
      ? project
      : project?.access_token;
  if (!token) return "/projects";
  const params = new URLSearchParams();
  if (view) params.set("view", view);
  if (t != null) params.set("t", String(t));
  const qs = params.toString();
  return `/project/${token}${qs ? `?${qs}` : ""}`;
}

/** Build client portal project page path. */
export function portalProjectPath(project, { view, t } = {}) {
  const token =
    typeof project === "string"
      ? project
      : project?.access_token;
  if (!token) return "/portal";
  const params = new URLSearchParams();
  if (view) params.set("view", view);
  if (t != null) params.set("t", String(t));
  const qs = params.toString();
  return `/portal/projects/${token}${qs ? `?${qs}` : ""}`;
}
