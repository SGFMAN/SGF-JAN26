import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UI, MENU } from "../utils/uiThemeTokens";
import { getStateFilter } from "../utils/stateFilter";
import {
  isCancelledStatus,
  isCompleteStatus,
  isConstructionPhaseStatus,
  isDesignPhaseStatus,
  isExcludedFromProjectLists,
  isOnHoldFlag,
  isPermitPhaseStatus,
  isPreEngagementPhaseStatus,
} from "../utils/projectStatus";
import { fetchProjectsList } from "../utils/projectsListCache";

/** Shared height so wrapping labels match single-line items. */
const LINK_BASE_STYLE = {
  border: "none",
  borderRadius: "10px",
  padding: "5px 6px",
  fontSize: "0.9rem",
  fontWeight: 500,
  textAlign: "center",
  textDecoration: "none",
  letterSpacing: "0.5px",
  cursor: "pointer",
  transition: "background 0.18s, color 0.15s",
  marginBottom: "0px",
  lineHeight: 1.25,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "6px",
  boxSizing: "border-box",
  minHeight: "2.75em",
  width: "100%",
};

/** Green sidebar group — menu labels are short; status strings stay full elsewhere. */
export const PROJECT_STATUS_MENU_LINKS = [
  { to: "/all-projects", label: "All Projects" },
  { to: "/pre-engagement-phase", label: "Pre-Engagement" },
  { to: "/projects", label: "Design" },
  { to: "/permit-phase", label: "Permit" },
  { to: "/construction-phase", label: "Construction" },
  { to: "/on-hold", label: "On Hold" },
  { to: "/archive", label: "Archive" },
];

function projectMatchesState(project, stateFilter) {
  if (!stateFilter || stateFilter === "All") return true;
  return (project.state || "").toUpperCase() === String(stateFilter).toUpperCase();
}

/** Counts match each list page’s scope filter (then state filter). */
function countForPath(projects, path) {
  switch (path) {
    case "/all-projects":
      return projects.filter(
        (p) =>
          !isExcludedFromProjectLists(p.status) &&
          !isCancelledStatus(p.status) &&
          !isCompleteStatus(p.status)
      ).length;
    case "/pre-engagement-phase":
      return projects.filter((p) => isPreEngagementPhaseStatus(p.status)).length;
    case "/projects":
      return projects.filter((p) => isDesignPhaseStatus(p.status)).length;
    case "/permit-phase":
      return projects.filter((p) => isPermitPhaseStatus(p.status)).length;
    case "/construction-phase":
      return projects.filter((p) => isConstructionPhaseStatus(p.status)).length;
    case "/on-hold":
      return projects.filter((p) => isOnHoldFlag(p) && !isExcludedFromProjectLists(p.status)).length;
    case "/archive":
      return projects.filter(
        (p) => isCompleteStatus(p.status) || isCancelledStatus(p.status)
      ).length;
    default:
      return 0;
  }
}

/**
 * @param {object} props
 * @param {string} [props.activePath]
 * @param {boolean} [props.plain]
 * @param {string} [props.stateFilter] VIC | QLD | All — defaults to saved filter
 */
export default function ProjectStatusSidebarSection({
  activePath = "",
  plain = false,
  stateFilter: stateFilterProp,
}) {
  const [countsByPath, setCountsByPath] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      try {
        const stateFilter = stateFilterProp || getStateFilter();
        const data = await fetchProjectsList({ view: "card" });
        const list = (Array.isArray(data) ? data : []).filter((p) =>
          projectMatchesState(p, stateFilter)
        );
        if (cancelled) return;
        const next = {};
        for (const { to } of PROJECT_STATUS_MENU_LINKS) {
          next[to] = countForPath(list, to);
        }
        setCountsByPath(next);
      } catch {
        // leave previous counts
      }
    }

    loadCounts();
    window.addEventListener("focus", loadCounts);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadCounts);
    };
  }, [stateFilterProp, activePath]);

  const links = PROJECT_STATUS_MENU_LINKS.map(({ to, label }) => {
    const active = activePath === to;
    const count = countsByPath[to];
    const countLabel = typeof count === "number" ? `[${count}]` : "";
    return (
      <Link
        key={to}
        to={to}
        style={{
          ...LINK_BASE_STYLE,
          background: active ? MENU.greenActive : "transparent",
          color: active ? MENU.activeText : UI.textSecondary,
          outline: active ? `1px solid ${UI.outline}` : "none",
          outlineOffset: "-1px",
        }}
      >
        <span style={{ textAlign: "left", minWidth: 0 }}>{label}</span>
        {countLabel ? (
          <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{countLabel}</span>
        ) : null}
      </Link>
    );
  });

  if (plain) {
    return <>{links}</>;
  }

  return (
    <div
      style={{
        background: MENU.green,
        borderRadius: "10px",
        padding: "4px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        border: `1px solid ${UI.outline}`,
      }}
    >
      {links}
    </div>
  );
}
