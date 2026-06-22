import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useAppLogo from "../hooks/useAppLogo.js";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

export default function ApproveConcept() {
  const logo = useAppLogo();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Fetch project name
    async function fetchProject() {
      try {
        const response = await fetch(`${API_URL}/api/projects/${projectId}`);
        if (!response.ok) {
          throw new Error("Project not found");
        }
        const project = await response.json();
        const name = project?.street && project?.suburb 
          ? `${project.street}, ${project.suburb}`.trim() 
          : project?.name || "";
        setProjectName(name);
      } catch (error) {
        console.error("Error fetching project:", error);
        setError("Project not found");
      }
    }
    
    if (projectId) {
      fetchProject();
    }
  }, [projectId]);

  async function handleConfirm() {
    if (!projectId) {
      setError("Invalid project ID");
      return;
    }

    setIsApproving(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/approve-concept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to approve concept");
      }

      setIsApproved(true);
    } catch (error) {
      console.error("Error approving concept:", error);
      setError(error.message || "Failed to approve concept. Please try again.");
    } finally {
      setIsApproving(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: MONUMENT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        color: WHITE,
      }}
    >
      <div
        style={{
          maxWidth: "600px",
          width: "100%",
          textAlign: "center",
        }}
      >
        {/* Logo */}
        <img
          src={logo}
          alt="SGF Central"
          style={{
            maxWidth: "200px",
            marginBottom: "40px",
          }}
        />

        {isApproved ? (
          <>
            <h1 style={{ fontSize: "2rem", marginBottom: "20px", color: WHITE }}>
              Concept Approved
            </h1>
            <p style={{ fontSize: "1.2rem", marginBottom: "40px", color: "var(--sgf-page-text)" }}>
              Thank you for confirming your concept approval for {projectName || "this project"}.
            </p>
            <p style={{ fontSize: "1rem", color: "var(--sgf-page-text)" }}>
              Your approval has been recorded and the team has been notified.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: "2rem", marginBottom: "20px", color: WHITE }}>
              Confirm Concept Approval
            </h1>
            {projectName && (
              <p style={{ fontSize: "1.2rem", marginBottom: "40px", color: "var(--sgf-page-text)" }}>
                Project: {projectName}
              </p>
            )}
            <p style={{ fontSize: "1rem", marginBottom: "40px", color: "var(--sgf-page-text)" }}>
              Please confirm that you approve the concept drawings for this project.
            </p>

            {error && (
              <div
                style={{
                  background: "#ff6b6b",
                  color: WHITE,
                  padding: "12px 20px",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  fontSize: "0.9rem",
                }}
              >
                {error}
              </div>
            )}

            <button
              onClick={handleConfirm}
              disabled={isApproving}
              style={{
                background: "#4D93D9",
                color: PAGE_TEXT,
                border: "none",
                borderRadius: "8px",
                padding: "16px 48px",
                fontSize: "1.2rem",
                fontWeight: 500,
                cursor: isApproving ? "not-allowed" : "pointer",
                transition: "background 0.2s",
                opacity: isApproving ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isApproving) {
                  e.currentTarget.style.background = "#3d7bc9";
                }
              }}
              onMouseLeave={(e) => {
                if (!isApproving) {
                  e.currentTarget.style.background = "#4D93D9";
                }
              }}
            >
              {isApproving ? "Confirming..." : "Confirm"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
