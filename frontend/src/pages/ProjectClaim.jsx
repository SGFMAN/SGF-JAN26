import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isUserAdmin } from "../utils/auth";
import { isDraftspersonAssigned } from "../utils/draftspersonSentinel";
import { isDesignPhaseStatus } from "../utils/projectStatus";
import ProjectRectangleCard from "../components/ProjectRectangleCard";
import logo from "../images/logo.png";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

const linkInactive = {
  background: "transparent",
  color: UI.textSecondary,
  border: "none",
  borderRadius: "10px",
  padding: "8px 8px",
  fontSize: "0.95rem",
  fontWeight: 500,
  textAlign: "center",
  textDecoration: "none",
  letterSpacing: "0.5px",
  cursor: "pointer",
  transition: "background 0.18s, color 0.15s",
  marginBottom: "0px",
  lineHeight: "1.4",
  display: "block",
};

const linkActive = {
  ...linkInactive,
  background: WHITE,
  color: MONUMENT,
  outline: `2px solid ${UI.outline}`,
  boxShadow: "0 2px 4px rgba(50,50,51,.04)",
};

function normalizeState(projectState) {
  return (projectState || "").toString().trim().toUpperCase();
}

/** State column must be QLD (not inferred from stream). */
function isStrictQLD(project) {
  const state = normalizeState(project.state || project.state_code);
  return state === "QLD" || state === "QUEENSLAND";
}

function isDraftspersonUnassigned(project) {
  return !isDraftspersonAssigned(project?.draftsperson);
}

function filterEligibleDraftspersonUsers(allUsers) {
  return allUsers.filter((user) => {
    if (!user.positions || !Array.isArray(user.positions)) return false;
    return user.positions.some((position) => {
      const positionName = position.name ? position.name.toLowerCase() : "";
      return positionName === "architectural draftsperson" || positionName === "architectural graduate";
    });
  });
}

export default function ProjectClaim() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draftspersonUsers, setDraftspersonUsers] = useState([]);
  const [claimModalProject, setClaimModalProject] = useState(null);
  const [selectedDraftspersonName, setSelectedDraftspersonName] = useState("");
  const [savingClaim, setSavingClaim] = useState(false);

  useEffect(() => {
    (async () => setIsAdmin(await isUserAdmin()))();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_URL}/api/users`);
        if (!response.ok) return;
        const allUsers = await response.json();
        if (!cancelled && Array.isArray(allUsers)) {
          const list = filterEligibleDraftspersonUsers(allUsers);
          list.sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));
          setDraftspersonUsers(list);
        }
      } catch (e) {
        console.error("ProjectClaim users fetch:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${API_URL}/api/projects`);
        if (!response.ok) {
          throw new Error(`Failed to fetch projects: ${response.statusText}`);
        }
        const data = await response.json();
        if (!cancelled) {
          setProjects(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          console.error("ProjectClaim fetch:", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (claimModalProject) {
      document.body.style.overflow = "hidden";
      const onKey = (e) => {
        if (e.key === "Escape") closeClaimModal();
      };
      document.addEventListener("keydown", onKey);
      return () => {
        document.body.style.overflow = "";
        document.removeEventListener("keydown", onKey);
      };
    }
    return undefined;
  }, [claimModalProject]);

  const claimProjects = useMemo(() => {
    return projects
      .filter(
        (p) =>
          isStrictQLD(p) &&
          isDesignPhaseStatus(p.status) &&
          isDraftspersonUnassigned(p)
      )
      .sort((a, b) => {
        const sa = (a.suburb || "").toLowerCase();
        const sb = (b.suburb || "").toLowerCase();
        if (sa !== sb) return sa.localeCompare(sb);
        const ta = (a.street || "").toLowerCase();
        const tb = (b.street || "").toLowerCase();
        return ta.localeCompare(tb);
      });
  }, [projects]);

  function openClaimModal(project) {
    setClaimModalProject(project);
    setSelectedDraftspersonName("");
  }

  function closeClaimModal() {
    setClaimModalProject(null);
    setSelectedDraftspersonName("");
  }

  async function handleConfirmClaim() {
    if (!claimModalProject?.id || !selectedDraftspersonName) return;
    const nameToSave = String(selectedDraftspersonName).trim();
    if (!nameToSave) return;

    const project = claimModalProject;
    const projectName =
      project.name ||
      [project.street, project.suburb].filter((x) => (x || "").trim()).join(", ").trim() ||
      "";

    setSavingClaim(true);
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          status: project.status || "Design Phase",
          draftsperson: nameToSave,
        }),
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        throw new Error(errText || "Update failed");
      }
      setProjects((prev) =>
        prev.map((p) =>
          p.id === project.id ? { ...p, draftsperson: nameToSave } : p
        )
      );
      closeClaimModal();
    } catch (e) {
      console.error("Claim draftsperson save:", e);
      alert(`Could not save draftsperson: ${e.message || "Unknown error"}`);
    } finally {
      setSavingClaim(false);
    }
  }

  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        minHeight: "100vh",
        width: "100vw",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          margin: "32px auto 24px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 32px",
          boxSizing: "border-box",
        }}
      >
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img src={logo} alt="SGF Logo" style={{ width: "120px", height: "auto" }} />
        </Link>
        <div style={{ display: "flex", alignItems: "center", flexDirection: "column", gap: "6px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: WHITE,
              letterSpacing: "1px",
            }}
          >
            Project Claim!
          </h1>
          <p style={{ margin: 0, fontSize: "0.95rem", color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
            QLD · Design Phase · draftsperson open — {loading ? "…" : claimProjects.length} shown
          </p>
        </div>
      </div>

      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "50px auto 32px auto",
          gap: "32px",
          alignItems: "flex-start",
        }}
      >
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            minHeight: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "32px 12px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "18px",
            color: MONUMENT,
            overflowY: "auto",
          }}
        >
          <Link to="/managers/site-visit-manager" style={linkInactive}>
            Site Visit Manager
          </Link>
          <Link to="/managers/contract-manager" style={linkInactive}>
            Contract Manager
          </Link>
          <Link to="/managers/colour-manager" style={linkInactive}>
            Colour Manager
          </Link>
          <Link to="/managers/status-manager" style={linkInactive}>
            Status Manager
          </Link>
          {isAdmin && (
            <Link to="/managers/drawing-manager" style={linkInactive}>
              Drawing Manager
            </Link>
          )}
          <Link to="/managers/qp-manager" style={linkInactive}>
            QP Manager
          </Link>
          <Link to="/managers/project-claim" style={linkActive}>
            Project Claim!
          </Link>
          <div style={{ flex: 1 }} />
          <Link to="/projects" style={linkInactive}>
            ← Back to Main
          </Link>
        </div>

        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minWidth: 0,
            minHeight: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "20px 18px",
            boxSizing: "border-box",
            overflow: "auto",
            color: MONUMENT,
          }}
        >
          {loading && <p style={{ color: UI.textMuted, margin: 0 }}>Loading projects…</p>}
          {error && (
            <p style={{ color: "#cc3333", margin: 0 }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && claimProjects.length === 0 && (
            <p style={{ color: UI.textMuted, margin: 0 }}>
              No projects match (QLD state, Design Phase, draftsperson not set).
            </p>
          )}
          {!loading && !error && claimProjects.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(11, minmax(0, 1fr))",
                gap: "8px",
                alignItems: "start",
              }}
            >
              {claimProjects.map((project) => (
                <div key={project.id} style={{ minWidth: 0, width: "100%" }}>
                  <ProjectRectangleCard
                    project={project}
                    fitColumn
                    onInteract={() => openClaimModal(project)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {claimModalProject && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={closeClaimModal}
        >
          <div
            style={{
              backgroundColor: WHITE,
              padding: "24px",
              borderRadius: "8px",
              minWidth: "360px",
              maxWidth: "90%",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 8px 0", fontSize: "1.2rem", color: MONUMENT }}>
              Assign draftsperson
            </h2>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.9rem", color: "#555" }}>
              {(claimModalProject.suburb || "").toUpperCase()} — {claimModalProject.street || "No address"}
            </p>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem", color: MONUMENT }}>
              Architectural Draftsperson / Graduate
            </label>
            <select
              value={selectedDraftspersonName}
              onChange={(e) => setSelectedDraftspersonName(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: "1rem",
                border: "1px solid #ccc",
                borderRadius: "4px",
                boxSizing: "border-box",
                marginBottom: "20px",
                color: MONUMENT,
              }}
            >
              <option value="">Select name…</option>
              {draftspersonUsers.map((u) => (
                <option key={u.id} value={u.name || ""}>
                  {u.name}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={closeClaimModal}
                disabled={savingClaim}
                style={{
                  padding: "8px 16px",
                  fontSize: "0.9rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  backgroundColor: WHITE,
                  color: MONUMENT,
                  cursor: savingClaim ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClaim}
                disabled={savingClaim || !selectedDraftspersonName}
                style={{
                  padding: "8px 16px",
                  fontSize: "0.9rem",
                  border: "none",
                  borderRadius: "4px",
                  backgroundColor: MONUMENT,
                  color: WHITE,
                  cursor: savingClaim || !selectedDraftspersonName ? "not-allowed" : "pointer",
                  opacity: savingClaim || !selectedDraftspersonName ? 0.6 : 1,
                }}
              >
                {savingClaim ? "Saving…" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
