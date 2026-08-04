import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStateFilter, setStateFilter as saveStateFilter } from "../utils/stateFilter";
import ProjectRectangleCard from "../components/ProjectRectangleCard";
import useAppLogo from "../hooks/useAppLogo.js";
import { ensureUiButtonStylesLoaded } from "../utils/uiButtonStyles.js";
import {
  isCancelledStatus,
  isCompleteStatus,
  isConstructionPhaseStatus,
  isDesignPhaseStatus,
  isHotlistStatus,
  isOnHoldFlag,
  isPermitPhaseStatus,
  isPreEngagementPhaseStatus,
} from "../utils/projectStatus";
import MobileStyledFilterButton, {
  MOBILE_STATE_BUTTON_IDS,
  MOBILE_STATUS_BUTTON_IDS,
  useUiButtonStyleRevision,
} from "./MobileStyledFilterButton";
import "./mobile.css";

const API_URL = "";

const STATE_OPTIONS = ["VIC", "QLD", "All"];

const STATE_OPTION_LABELS = {
  VIC: "VIC",
  QLD: "QLD",
  All: "All States",
};

const STATUS_FILTERS_ROW_1 = [
  { key: "all", label: "All Projects" },
  { key: "preEngagement", label: "Pre-Engagement" },
  { key: "design", label: "Design" },
];

const STATUS_FILTERS_ROW_2 = [
  { key: "permit", label: "Permit" },
  { key: "construction", label: "Construction" },
  { key: "onHold", label: "On Hold" },
];

const STATUS_FILTERS_ROW_3 = [
  { key: "archive", label: "Archive" },
];

function matchesStatusFilter(project, statusFilter) {
  if (isHotlistStatus(project.status)) return false;

  switch (statusFilter) {
    case "all":
      return !isCancelledStatus(project.status) && !isCompleteStatus(project.status);
    case "preEngagement":
      return isPreEngagementPhaseStatus(project.status);
    case "design":
      return isDesignPhaseStatus(project.status);
    case "permit":
      return isPermitPhaseStatus(project.status);
    case "construction":
      return isConstructionPhaseStatus(project.status);
    case "onHold":
      return isOnHoldFlag(project);
    case "archive":
      return isCompleteStatus(project.status) || isCancelledStatus(project.status);
    default:
      return true;
  }
}

export default function MobileProjectsHome({ preview = false, onSelectProject }) {
  const logo = useAppLogo();
  useUiButtonStyleRevision();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    void ensureUiButtonStylesLoaded();
    void fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      setProjects(data);
    } catch (err) {
      console.error("Error fetching projects:", err);
      setError(err.message || "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  function handleStateFilter(next) {
    setStateFilter(next);
    saveStateFilter(next);
  }

  function getFilteredProjects() {
    let filtered = projects.filter((project) => matchesStatusFilter(project, statusFilter));

    if (stateFilter !== "All") {
      filtered = filtered.filter(
        (project) => (project.state || "").toUpperCase() === stateFilter.toUpperCase()
      );
    }

    filtered.sort((a, b) => {
      const suburbA = (a.suburb || "").toLowerCase();
      const suburbB = (b.suburb || "").toLowerCase();
      if (suburbA !== suburbB) return suburbA.localeCompare(suburbB);
      const streetA = (a.street || "").toLowerCase();
      const streetB = (b.street || "").toLowerCase();
      return streetA.localeCompare(streetB);
    });

    return filtered;
  }

  const filteredProjects = getFilteredProjects();

  return (
    <div className={`mobile-shell sgf-mobile-only${preview ? " mobile-shell--preview" : ""}`}>
      <header className="mobile-shell__header">
        {preview ? (
          <span className="mobile-shell__header-back" aria-hidden="true">
            <img src={logo} alt="SGF" style={{ width: 36, height: "auto" }} />
          </span>
        ) : (
          <Link to="/projects" className="mobile-shell__header-back" aria-label="SGF Central home">
            <img src={logo} alt="SGF" style={{ width: 36, height: "auto" }} />
          </Link>
        )}
        <h1 className="mobile-shell__header-title">Projects</h1>
      </header>

      <div className="mobile-shell__content">
        <div className="mobile-shell__filters">
        <div className="mobile-state-filter-row" role="group" aria-label="State filter">
          {STATE_OPTIONS.map((option) => {
            const selected = stateFilter === option;
            return (
              <MobileStyledFilterButton
                key={option}
                styleId={MOBILE_STATE_BUTTON_IDS[option]}
                selected={selected}
                stateKey={option}
                onClick={() => handleStateFilter(option)}
              >
                {STATE_OPTION_LABELS[option]}
              </MobileStyledFilterButton>
            );
          })}
        </div>

        <div className="mobile-status-filters" role="group" aria-label="Status filter">
          <div className="mobile-status-filter-row">
            {STATUS_FILTERS_ROW_1.map(({ key, label }) => {
              const selected = statusFilter === key;
              return (
                <MobileStyledFilterButton
                  key={key}
                  styleId={MOBILE_STATUS_BUTTON_IDS[key]}
                  selected={selected}
                  onClick={() => setStatusFilter(key)}
                >
                  {label}
                </MobileStyledFilterButton>
              );
            })}
          </div>
          <div className="mobile-status-filter-row">
            {STATUS_FILTERS_ROW_2.map(({ key, label }) => {
              const selected = statusFilter === key;
              return (
                <MobileStyledFilterButton
                  key={key}
                  styleId={MOBILE_STATUS_BUTTON_IDS[key]}
                  selected={selected}
                  onClick={() => setStatusFilter(key)}
                >
                  {label}
                </MobileStyledFilterButton>
              );
            })}
          </div>
          <div className="mobile-status-filter-row">
            {STATUS_FILTERS_ROW_3.map(({ key, label }) => {
              const selected = statusFilter === key;
              return (
                <MobileStyledFilterButton
                  key={key}
                  styleId={MOBILE_STATUS_BUTTON_IDS[key]}
                  selected={selected}
                  onClick={() => setStatusFilter(key)}
                >
                  {label}
                </MobileStyledFilterButton>
              );
            })}
          </div>
        </div>
        </div>

        <div className="mobile-shell__body">
        {loading && <p className="mobile-shell__status">Loading projects…</p>}
        {error && (
          <p className="mobile-shell__status mobile-shell__status--error">Error: {error}</p>
        )}
        {!loading && !error && filteredProjects.length === 0 && (
          <p className="mobile-shell__status">No projects found.</p>
        )}
        {!loading && !error && filteredProjects.length > 0 && (
          <div className="mobile-project-list mobile-project-list--grid">
            {filteredProjects.map((project) => (
              <ProjectRectangleCard
                key={project.id}
                project={project}
                fitColumn
                onInteract={preview && onSelectProject ? () => onSelectProject(project) : undefined}
              />
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
