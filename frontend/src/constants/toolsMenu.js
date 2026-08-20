export const TOOLS_PAGE_PATH = "/tools";

export const TOOLS_MENU_LINKS = [
  { to: "/email-generator", label: "Email Generator" },
  { to: "/maps", label: "Maps" },
  { to: "/apply-fields", label: "Apply Fields" },
  { to: "/planner", label: "Planner" },
];

export function isToolsPath(path) {
  const p = String(path || "");
  if (p === TOOLS_PAGE_PATH || p.startsWith(`${TOOLS_PAGE_PATH}/`)) return true;
  return TOOLS_MENU_LINKS.some(({ to }) => p === to || p.startsWith(`${to}/`));
}

export function isToolsLinkActive(path, to) {
  const p = String(path || "");
  return p === to || p.startsWith(`${to}/`);
}
