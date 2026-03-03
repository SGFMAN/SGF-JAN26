import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const WHITE = "#fff";
const API_URL = "";

const COLOUR_OPTIONS = ["Select", "Monument", "Paperbark", "Wallaby"];

export default function ColoursPortal() {
  const { projectId } = useParams();
  const [projectName, setProjectName] = useState("");
  const [roofColour, setRoofColour] = useState("Select");
  const [claddingColour, setCladdingColour] = useState("Select");
  const [baseboardsColour, setBaseboardsColour] = useState("Select");
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Fetch project data
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
        
        // Load current colour values
        setRoofColour(project.roof_colour || "Select");
        setCladdingColour(project.cladding_colour || "Select");
        setBaseboardsColour(project.baseboards_colour || "Select");
      } catch (error) {
        console.error("Error fetching project:", error);
        setError("Project not found");
      }
    }
    
    if (projectId) {
      fetchProject();
    }
  }, [projectId]);

  async function handleSave() {
    if (!projectId) {
      setError("Invalid project ID");
      return;
    }

    setIsSaving(true);
    setError("");
    setIsSaved(false);

    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/update-colours`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roof_colour: roofColour === "Select" ? null : roofColour,
          cladding_colour: claddingColour === "Select" ? null : claddingColour,
          baseboards_colour: baseboardsColour === "Select" ? null : baseboardsColour,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save colours");
      }

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000); // Hide success message after 3 seconds
    } catch (error) {
      console.error("Error saving colours:", error);
      setError(error.message || "Failed to save colours. Please try again.");
    } finally {
      setIsSaving(false);
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
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <img
            src={logo}
            alt="SGF Central"
            style={{
              maxWidth: "200px",
            }}
          />
        </div>

        <div
          style={{
            background: "#42464d",
            borderRadius: "12px",
            padding: "32px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
          }}
        >
          <h1 style={{ fontSize: "1.8rem", marginBottom: "12px", color: WHITE, textAlign: "center" }}>
            Select Your Colours
          </h1>
          {projectName && (
            <p style={{ fontSize: "1rem", marginBottom: "32px", color: "#ffffff99", textAlign: "center" }}>
              Project: {projectName}
            </p>
          )}

          {error && (
            <div
              style={{
                background: "#ff6b6b",
                color: WHITE,
                padding: "12px 20px",
                borderRadius: "8px",
                marginBottom: "24px",
                fontSize: "0.9rem",
              }}
            >
              {error}
            </div>
          )}

          {isSaved && (
            <div
              style={{
                background: "#28a745",
                color: WHITE,
                padding: "12px 20px",
                borderRadius: "8px",
                marginBottom: "24px",
                fontSize: "0.9rem",
              }}
            >
              Colours saved successfully!
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Roof */}
            <div>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "1rem", color: WHITE, fontWeight: 500 }}>
                Roof
              </label>
              <select
                value={roofColour}
                onChange={(e) => setRoofColour(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                {COLOUR_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {/* Cladding */}
            <div>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "1rem", color: WHITE, fontWeight: 500 }}>
                Cladding
              </label>
              <select
                value={claddingColour}
                onChange={(e) => setCladdingColour(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                {COLOUR_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {/* Baseboards */}
            <div>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "1rem", color: WHITE, fontWeight: 500 }}>
                Baseboards
              </label>
              <select
                value={baseboardsColour}
                onChange={(e) => setBaseboardsColour(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                {COLOUR_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSave}
              disabled={isSaving}
              style={{
                width: "100%",
                background: "#4D93D9",
                color: WHITE,
                border: "none",
                borderRadius: "8px",
                padding: "16px 32px",
                fontSize: "1.2rem",
                fontWeight: 500,
                cursor: isSaving ? "not-allowed" : "pointer",
                transition: "background 0.2s",
                opacity: isSaving ? 0.6 : 1,
                marginTop: "8px",
              }}
              onMouseEnter={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.background = "#3d7bc9";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.background = "#4D93D9";
                }
              }}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
