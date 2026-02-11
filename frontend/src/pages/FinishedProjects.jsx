import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import NewProject from "./NewProject";
import NewProject2 from "./NewProject2";
import NewProject3 from "./NewProject3";
import NewProject4 from "./NewProject4";
import { isUserAdmin } from "../utils/auth";
import logo from "../images/logo.png";

// COLORBOND® Classic Monument (very dark, almost black-grey)
const MONUMENT = "#323233";
// A bit lighter version for sections
const SECTION_GREY = "#a1a1a3"; // Moderately lightened version
const LIGHT_MONUMENT = "#42464d"; // More blue and slightly lighter version of monument
const WHITE = "#fff";

const API_URL = "";

export default function FinishedProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newProjectStep, setNewProjectStep] = useState(1);
  const [newProjectFormData, setNewProjectFormData] = useState({
    suburb: "",
    street: "",
    state: "",
    stream: "",
    deposit: "",
    customDeposit: "",
    projectCost: "",
    salesperson: "",
    clientName: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    // Check admin status first so buttons show up quickly
    checkAdminStatus();
    fetchProjects();
  }, []);

  async function checkAdminStatus() {
    const admin = await isUserAdmin();
    setIsAdmin(admin);
  }

  async function fetchProjects() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      const data = await response.json();
      console.log("Projects from API:", data);
      setProjects(data);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
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
      {/* Section 1: Heading */}
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
        <img
          src={logo}
          alt="SGF Logo"
          style={{
            width: "120px",
            height: "auto",
            position: "absolute",
            left: "40px",
          }}
        />
        <div style={{ display: "flex", alignItems: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: WHITE,
              letterSpacing: "1px",
            }}
          >
            Finished Projects
          </h1>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsNewProjectOpen(true)}
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              background: "#33cc33",
              color: WHITE,
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#2bb32b")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#33cc33")}
          >
            + New Project
          </button>
        )}
      </div>

      {/* Sections 2 & 3 */}
      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "50px auto 0 auto",
          gap: "32px",
        }}
      >
        {/* Section 2: Menu */}
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "32px 12px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "18px",
            color: MONUMENT,
          }}
        >
          {/* Menu Buttons */}
          <Link
            to="/projects"
            style={{
              background: "transparent",
              color: "#404049",
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
            }}
          >
            In Design
          </Link>
          <Link
            to="/in-construction"
            style={{
              background: "transparent",
              color: "#404049",
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
            }}
          >
            In Construction
          </Link>
          <Link
            to="/finished-projects"
            style={{
              background: WHITE,
              color: MONUMENT,
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
              outline: `2px solid ${MONUMENT}`,
              boxShadow: "0 2px 4px rgba(50,50,51,.04)",
              display: "block",
            }}
          >
            Finished Projects
          </Link>
          <Link
            to="/managers"
            style={{
              background: "transparent",
              color: "#404049",
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
            }}
          >
            Managers
          </Link>
          {isAdmin && (
            <Link
              to="/settings"
              style={{
                background: "transparent",
                color: "#404049",
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
                display: "block",
              }}
            >
              Settings
            </Link>
          )}
          {isAdmin && (
            <Link
              to="/apply-fields"
              style={{
                background: "transparent",
                color: "#404049",
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
                display: "block",
              }}
            >
              Apply Fields
            </Link>
          )}
        </div>
        {/* Section 3: Projects */}
        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: "758px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "24px 32px",
            boxSizing: "border-box",
            overflow: "auto",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, marginBottom: "16px" }}>
            Finished Projects {(() => {
              const finishedProjects = projects.filter((project) => (project.status === "Complete" || project.status === "Cancelled") && project.status !== "Hotlist");
              return finishedProjects.length > 0 ? `(${finishedProjects.length} total)` : "";
            })()}
          </h2>
          
          {/* Search Bar */}
          <div style={{ marginBottom: "20px", marginTop: 0 }}>
            <label
              style={{
                display: "block",
                fontSize: "0.9rem",
                color: "#32323399",
                marginBottom: "6px",
                marginTop: 0,
                fontWeight: 500,
              }}
            >
              Search
            </label>
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                maxWidth: "420px",
                padding: "12px 16px",
                borderRadius: "8px",
                border: `2px solid ${MONUMENT}`,
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          {loading && <p style={{ color: "#32323399" }}>Loading projects...</p>}
          {error && (
            <p style={{ color: "#cc3333" }}>
              Error: {error}
            </p>
          )}
          {!loading && !error && (() => {
            const finishedProjects = projects.filter((project) => (project.status === "Complete" || project.status === "Cancelled") && project.status !== "Hotlist");
            if (finishedProjects.length === 0) {
              return <p style={{ color: "#32323399" }}>No finished projects found.</p>;
            }
            return null;
          })()}
          {!loading && !error && projects.length > 0 && (() => {
            // Filter to only show projects with "Complete" or "Cancelled" status (exclude Hotlist)
            const finishedProjects = projects.filter((project) => (project.status === "Complete" || project.status === "Cancelled") && project.status !== "Hotlist");
            
            // Filter projects based on search query
            let filteredProjects = searchQuery.trim()
              ? finishedProjects.filter((project) => {
                  const query = searchQuery.toLowerCase();
                  const suburb = (project.suburb || "").toLowerCase();
                  const street = (project.street || "").toLowerCase();
                  const name = (project.name || "").toLowerCase();
                  return suburb.includes(query) || street.includes(query) || name.includes(query);
                })
              : finishedProjects;

            // Sort alphabetically by suburb, then by street
            filteredProjects.sort((a, b) => {
              const suburbA = (a.suburb || "").toLowerCase();
              const suburbB = (b.suburb || "").toLowerCase();
              if (suburbA !== suburbB) {
                return suburbA.localeCompare(suburbB);
              }
              const streetA = (a.street || "").toLowerCase();
              const streetB = (b.street || "").toLowerCase();
              return streetA.localeCompare(streetB);
            });

            if (filteredProjects.length === 0) {
              return <p style={{ color: "#32323399" }}>No projects match your search.</p>;
            }

            return (
              <div
                className="projects-grid"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "20px",
                  alignItems: "flex-start",
                }}
              >
                {filteredProjects.map((project) => {
                  // Classification mapping - all grey
                  const classificationMap = {
                    "Small Second Dwelling": { acronym: "SSD", color: "#a1a1a3" }, // Grey
                    "Dependant Persons Unit": { acronym: "DPU", color: "#a1a1a3" }, // Grey
                    "Detached Extension": { acronym: "DEX", color: "#a1a1a3" }, // Grey
                    "Dwelling": { acronym: "DWE", color: "#a1a1a3" }, // Grey
                    "Home Office / Studio": { acronym: "STU", color: "#a1a1a3" }, // Grey
                    "Dwelling & DPU": { acronym: "D&DPU", color: "#a1a1a3" }, // Grey
                    "Dwelling & SSD": { acronym: "D&SSD", color: "#a1a1a3" }, // Grey
                    "SSD & DPU": { acronym: "SSD&DPU", color: "#a1a1a3" }, // Grey
                    "Dual Occ": { acronym: "DOC", color: "#a1a1a3" }, // Grey
                  };
                  const classificationInfo = project.classification ? classificationMap[project.classification] : null;

                  // Stream mapping - colored by stream type
                  const streamMap = {
                    "SGF - VIC": { acronym: "VIC", color: "#4D93D9" }, // Blue
                    "SGF - QLD": { acronym: "QLD", color: "#D54358" }, // Red
                    "Dual Dwelling": { acronym: "DD", color: "#92D050" }, // Green
                    "ATA": { acronym: "ATA", color: "#92D050" }, // Green
                    "Pumped on Property": { acronym: "POP", color: "#92D050" }, // Green
                    "Pumped On Property": { acronym: "POP", color: "#92D050" }, // Green (handle both variations)
                    "Henderson": { acronym: "HEN", color: "#92D050" }, // Green
                    "Creat Cash Flow": { acronym: "CCF", color: "#92D050" }, // Green
                    "Create Cash Flow": { acronym: "CCF", color: "#92D050" }, // Green (handle both variations)
                    "Maple Group": { acronym: "MAP", color: "#92D050" }, // Green
                  };
                  const streamInfo = project.stream ? streamMap[project.stream] : null;

                  return (
                    <Link
                      key={project.id}
                      to={`/project/${project.id}`}
                      style={{
                        textDecoration: "none",
                        display: "block",
                      }}
                    >
                      <div
                        style={{
                          background: MONUMENT,
                          borderRadius: "8px",
                          width: "200px",
                          height: "100px",
                          color: SECTION_GREY,
                          cursor: "pointer",
                          transition: "opacity 0.2s",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          alignItems: "center",
                          position: "relative",
                          overflow: "hidden",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                      >
                      {/* Cancelled Diagonal Band */}
                      {project.status === "Cancelled" && (
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%) rotate(-45deg)",
                            width: "280px",
                            height: "40px",
                            background: "#cc0000",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 10,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                          }}
                        >
                          <span
                            style={{
                              color: WHITE,
                              fontWeight: 700,
                              fontSize: "1.1rem",
                              letterSpacing: "2px",
                              textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                            }}
                          >
                            CANCELLED
                          </span>
                        </div>
                      )}
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "1.1rem",
                          textAlign: "center",
                          marginBottom: "4px",
                          width: "100%",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          flex: 1,
                          flexDirection: "column",
                          gap: "4px",
                          position: "relative",
                          zIndex: project.status === "Cancelled" ? 1 : "auto",
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: "1.1rem", color: "#ffffff" }}>
                          {(project.suburb || "Unknown Suburb").toUpperCase()}
                        </div>
                        <div style={{ fontSize: "0.95rem", color: "#ffffff", fontWeight: 400 }}>
                          {project.street || "No address"}
                        </div>
                      </div>
                      <div style={{ fontSize: "0.9rem", color: "#323233cc", textAlign: "center", position: "relative", zIndex: project.status === "Cancelled" ? 1 : "auto" }}>
                        Status: {project.status}
                      </div>
                      {/* Stream Acronym - Left Bottom */}
                      {streamInfo && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: "8px",
                            left: "8px",
                            fontSize: "0.85rem",
                            fontWeight: 700,
                            color: streamInfo.color,
                            zIndex: (project.status === "Cancelled") ? 11 : 5,
                            textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                          }}
                        >
                          {streamInfo.acronym}
                        </div>
                      )}
                      {/* Classification Acronym - Right Bottom */}
                      {classificationInfo && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: "8px",
                            right: "8px",
                            fontSize: "0.85rem",
                            fontWeight: 700,
                            color: classificationInfo.color,
                            zIndex: (project.status === "Cancelled") ? 11 : 5,
                            textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                          }}
                        >
                          {classificationInfo.acronym}
                        </div>
                      )}
                    </div>
                  </Link>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* New Project Modals */}
      <NewProject
        isOpen={isNewProjectOpen && newProjectStep === 1}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onNext={() => setNewProjectStep(2)}
      />
      <NewProject2
        isOpen={isNewProjectOpen && newProjectStep === 2}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onBack={() => setNewProjectStep(1)}
        onNext={() => setNewProjectStep(3)}
      />
      <NewProject3
        isOpen={isNewProjectOpen && newProjectStep === 3}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onBack={() => setNewProjectStep(2)}
        onNext={() => setNewProjectStep(4)}
      />
      <NewProject4
        isOpen={isNewProjectOpen && newProjectStep === 4}
        onClose={() => {
          setIsNewProjectOpen(false);
          setNewProjectStep(1);
          setNewProjectFormData({
            suburb: "",
            street: "",
            state: "",
            stream: "",
            deposit: "",
            customDeposit: "",
            projectCost: "",
            salesperson: "",
            clientName: "",
            email: "",
            phone: "",
          });
          // Refresh the projects list after creating a new project
          fetchProjects();
        }}
        formData={newProjectFormData}
        onFormDataChange={setNewProjectFormData}
        onBack={() => setNewProjectStep(3)}
      />
    </div>
  );
}
