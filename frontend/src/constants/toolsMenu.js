export const TOOLS_PAGE_PATH = "/tools";

export const TOOLS_MENU_LINKS = [
  { to: "/email-generator", label: "Email Generator", access: "admin" },
  { to: "/maps", label: "Maps", access: "admin" },
  { to: "/apply-fields", label: "Apply Fields", access: "admin" },
  { to: "/planner", label: "Planner", access: "admin" },
  { to: "/quick-concept", label: "Quick Concept", access: "quickconcept" },
  { to: "/archicad-viewer", label: "Archicad 3D Viewer", access: "admin" },
  { to: "/dan", label: "Dan", access: "admin" },
  { to: "/parts", label: "Parts", access: "admin" },
];

/** Admin sees every tool. Quick Concept on its own shows only that tool. */
export function visibleToolsLinks({ isAdmin = false, hasQuickConcept = false } = {}) {
  return TOOLS_MENU_LINKS.filter((link) => {
    if (link.access === "quickconcept") return hasQuickConcept || isAdmin;
    return isAdmin;
  });
}

export function isToolsPath(path) {
  const p = String(path || "");
  if (p === TOOLS_PAGE_PATH || p.startsWith(`${TOOLS_PAGE_PATH}/`)) return true;
  return TOOLS_MENU_LINKS.some(({ to }) => p === to || p.startsWith(`${to}/`));
}

export function isToolsLinkActive(path, to) {
  const p = String(path || "");
  return p === to || p.startsWith(`${to}/`);
}
