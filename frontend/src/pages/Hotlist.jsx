import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import NewProject from "./NewProject";
import NewProject2 from "./NewProject2";
import NewProject3 from "./NewProject3";
import NewProject4 from "./NewProject4";
import { isUserAdmin } from "../utils/auth";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";

const API_URL = "";

export default function Hotlist() {
  const [hotlistItems, setHotlistItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isNewItemOpen, setIsNewItemOpen] = useState(false);
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSoldFlowOpen, setIsSoldFlowOpen] = useState(false);
  const [soldItemId, setSoldItemId] = useState(null);
  const [currentModal, setCurrentModal] = useState(1); // 1 = NewProject, 2 = NewProject2, 3 = NewProject3, 4 = NewProject4
  const [createdProjectId, setCreatedProjectId] = useState(null);
  const [agreementSentItems, setAgreementSentItems] = useState(new Set());
  const [formData, setFormData] = useState({
    street: "",
    suburb: "",
    state: "",
    clientName: "",
    email: "",
    phone: "",
    projectCost: "",
    deposit: "",
    stream: "",
    salesperson: "",
    proposalFile: null,
    customDeposit: "",
  });

  useEffect(() => {
    checkAdminStatus();
    fetchHotlist();
  }, []);

  async function checkAdminStatus() {
    const admin = await isUserAdmin();
    setIsAdmin(admin);
  }

  async function fetchHotlist() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/hotlist`);
      if (!response.ok) {
        throw new Error(`Failed to fetch hotlist: ${response.statusText}`);
      }
      const data = await response.json();
      setHotlistItems(data);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching hotlist:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleNewItemClick() {
    setFormData({
      street: "",
      suburb: "",
      state: "",
      clientName: "",
      email: "",
      phone: "",
      projectCost: "",
      deposit: "",
      stream: "",
      salesperson: "",
      proposalFile: null,
      customDeposit: "",
    });
    setCurrentModal(1);
    setIsNewItemOpen(true);
  }

  function handleEditItemClick(item) {
    setEditingItem(item);
    setFormData({
      street: item.street || "",
      suburb: item.suburb || "",
      state: item.state || "",
      clientName: item.client_name || "",
      email: item.email || "",
      phone: item.phone || "",
      projectCost: "",
      deposit: "",
      stream: "",
      salesperson: "",
      proposalFile: null,
      customDeposit: "",
    });
    setCurrentModal(1);
    setIsEditItemOpen(true);
  }

  function handleFormDataChange(newData) {
    setFormData(newData);
  }

  function handleModalNext() {
    if (currentModal === 1) {
      setCurrentModal(2);
    } else if (currentModal === 2) {
      if (isNewItemOpen) {
        // For new items, only need modals 1 and 2
        handleCreateHotlistItem();
      } else if (isEditItemOpen) {
        // For editing, also only need modals 1 and 2
        handleUpdateHotlistItem();
      } else if (isSoldFlowOpen) {
        // For sold flow, continue to modal 3
        setCurrentModal(3);
      }
    } else if (currentModal === 3) {
      setCurrentModal(4);
    } else if (currentModal === 4) {
      // This is handled by NewProject4's handleCreateProject
    }
  }

  function handleModalBack() {
    if (currentModal === 2) {
      setCurrentModal(1);
    } else if (currentModal === 3) {
      setCurrentModal(2);
    } else if (currentModal === 4) {
      setCurrentModal(3);
    }
  }

  function handleModalClose() {
    const wasSoldFlow = isSoldFlowOpen;
    const projectId = createdProjectId;
    
    setIsNewItemOpen(false);
    setIsEditItemOpen(false);
    setIsSoldFlowOpen(false);
    setEditingItem(null);
    setSoldItemId(null);
    setCurrentModal(1);
    setFormData({
      street: "",
      suburb: "",
      state: "",
      clientName: "",
      email: "",
      phone: "",
      projectCost: "",
      deposit: "",
      stream: "",
      salesperson: "",
      proposalFile: null,
      customDeposit: "",
    });
    
    // Navigate to project if we just completed a sold flow
    if (wasSoldFlow && projectId) {
      setTimeout(() => {
        window.location.href = `/project/${projectId}`;
      }, 100);
    }
    
    setCreatedProjectId(null);
  }

  async function handleCreateHotlistItem() {
    try {
      const response = await fetch(`${API_URL}/api/hotlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          street: formData.street || null,
          suburb: formData.suburb || null,
          state: formData.state || null,
          client_name: formData.clientName || null,
          email: formData.email || null,
          phone: formData.phone || null,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(errorText);
      }

      await fetchHotlist();
      handleModalClose();
    } catch (err) {
      console.error("Error creating hotlist item:", err);
      alert("Error creating hotlist item: " + err.message);
    }
  }

  async function handleUpdateHotlistItem() {
    if (!editingItem?.id) return;

    try {
      const response = await fetch(`${API_URL}/api/hotlist/${editingItem.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          street: formData.street || null,
          suburb: formData.suburb || null,
          state: formData.state || null,
          client_name: formData.clientName || null,
          email: formData.email || null,
          phone: formData.phone || null,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(errorText);
      }

      await fetchHotlist();
      handleModalClose();
    } catch (err) {
      console.error("Error updating hotlist item:", err);
      alert("Error updating hotlist item: " + err.message);
    }
  }

  async function handleDeleteItem(id) {
    if (!confirm("Are you sure you want to delete this hotlist item?")) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/hotlist/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(errorText);
      }

      await fetchHotlist();
    } catch (err) {
      console.error("Error deleting hotlist item:", err);
      alert("Error deleting hotlist item: " + err.message);
    }
  }

  async function handleAgreementSentClick(item) {
    // Mark this item as having agreement sent
    setAgreementSentItems(prev => new Set(prev).add(item.id));
  }

  function handleEmailClick(item) {
    if (!item.email) {
      alert("No email address available for this client.");
      return;
    }

    const projectAddress = `${item.street || ""}, ${item.suburb || ""}`.trim() || "Project";
    const clientName = item.client_name || "Client";
    const subject = encodeURIComponent(projectAddress);
    const body = encodeURIComponent(`Hi ${clientName}\n\n`);
    
    const mailtoLink = `mailto:${item.email}?subject=${subject}&body=${body}`;
    window.location.href = mailtoLink;
  }

  async function handleSoldClick(item) {
    setSoldItemId(item.id);
    setFormData({
      street: item.street || "",
      suburb: item.suburb || "",
      state: item.state || "",
      clientName: item.client_name || "",
      email: item.email || "",
      phone: item.phone || "",
      projectCost: "",
      deposit: "",
      stream: "",
      salesperson: "",
      proposalFile: null,
      customDeposit: "",
    });
    setCurrentModal(3); // Start with modal 3 (Upload Proposal)
    setIsSoldFlowOpen(true);
  }

  async function handleCreateProjectFromSold(formData) {
    if (!soldItemId) return;

    try {
      // First upgrade the hotlist item to a project
      const upgradeResponse = await fetch(`${API_URL}/api/hotlist/${soldItemId}/sold`, {
        method: "POST",
      });

      if (!upgradeResponse.ok) {
        const errorText = await upgradeResponse.text().catch(() => upgradeResponse.statusText);
        throw new Error(errorText);
      }

      const upgradeResult = await upgradeResponse.json();
      const newProject = upgradeResult.project;

      // Now update the project with the additional data from modals 3 and 4
      const projectName = `${formData.street || ""}, ${formData.suburb || ""}`.trim() || "New Project";
      
      const updateData = {
        name: projectName,
        project_cost: formData.projectCost || null,
        deposit: formData.deposit || null,
        stream: formData.stream || null,
        salesperson: formData.salesperson || null,
      };

      const updateResponse = await fetch(`${API_URL}/api/projects/${newProject.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!updateResponse.ok) {
        console.error("Failed to update project with additional data");
      }

      // Return the project so NewProject4 can handle folder creation and file upload
      await fetchHotlist();
      
      // Store the project ID for navigation after modal closes
      setCreatedProjectId(newProject.id);
      
      // Return the updated project
      return newProject;
    } catch (err) {
      console.error("Error creating project from sold item:", err);
      alert("Error creating project: " + err.message);
      throw err;
    }
  }

  // Sort hotlist items alphabetically by suburb, then street
  const sortedItems = [...hotlistItems].sort((a, b) => {
    const suburbA = (a.suburb || "").toLowerCase();
    const suburbB = (b.suburb || "").toLowerCase();
    if (suburbA !== suburbB) {
      return suburbA.localeCompare(suburbB);
    }
    const streetA = (a.street || "").toLowerCase();
    const streetB = (b.street || "").toLowerCase();
    return streetA.localeCompare(streetB);
  });

  return (
    <>
      <style>
        {`
          @keyframes flame-flicker {
            0% {
              transform: scale(0.8) rotate(0deg) scaleX(1);
            }
            11.11% {
              transform: scale(1.0) rotate(-8deg) scaleX(-1);
            }
            22.22% {
              transform: scale(1.2) rotate(8deg) scaleX(1);
            }
            33.33% {
              transform: scale(0.85) rotate(-6deg) scaleX(-1);
            }
            44.44% {
              transform: scale(1.05) rotate(0deg) scaleX(1);
            }
            55.55% {
              transform: scale(1.15) rotate(6deg) scaleX(-1);
            }
            66.66% {
              transform: scale(0.9) rotate(-4deg) scaleX(1);
            }
            77.77% {
              transform: scale(1.1) rotate(4deg) scaleX(-1);
            }
            88.88% {
              transform: scale(0.95) rotate(-2deg) scaleX(1);
            }
            100% {
              transform: scale(1.0) rotate(2deg) scaleX(-1);
            }
          }
          @keyframes flame-background {
            0% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(1);
            }
            25% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(1);
            }
            25.01% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(-1);
            }
            50% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(-1);
            }
            50.01% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(1);
            }
            75% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(1);
            }
            75.01% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(-1);
            }
            100% {
              transform: translate(calc(-50% + 24px), calc(-50% + 18px)) scale(1.3) rotate(0deg) scaleX(-1);
            }
          }
        `}
      </style>
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
          margin: "32px auto 14px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          boxSizing: "border-box",
          justifyContent: "center",
          position: "relative",
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
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <span
              style={{
                fontSize: "2.2rem",
                display: "inline-block",
                animation: "flame-background 1.2s ease-in-out infinite",
                position: "absolute",
                zIndex: 0,
              }}
            >
              🔥
            </span>
            <span
              style={{
                fontSize: "1.8rem",
                display: "inline-block",
                animation: "flame-flicker 2.4s ease-in-out infinite",
                position: "relative",
                zIndex: 1,
              }}
            >
              🔥
            </span>
          </span>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: WHITE,
              letterSpacing: "1px",
            }}
          >
            Hot List
          </h1>
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <span
              style={{
                fontSize: "2.2rem",
                display: "inline-block",
                animation: "flame-background 1.2s ease-in-out infinite",
                animationDelay: "0.6s",
                position: "absolute",
                zIndex: 0,
              }}
            >
              🔥
            </span>
            <span
              style={{
                fontSize: "1.8rem",
                display: "inline-block",
                animation: "flame-flicker 2.4s ease-in-out infinite",
                animationDelay: "1.2s",
                position: "relative",
                zIndex: 1,
              }}
            >
              🔥
            </span>
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={handleNewItemClick}
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
            + New Address
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
            to="/hotlist"
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
            Hot List
          </Link>
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
                lineHeight: "1.4",
                display: "block",
              }}
            >
              Settings
            </Link>
          )}
        </div>

        {/* Section 3: Project List */}
        <div
          className="project-list"
          style={{
            flex: 1,
            background: SECTION_GREY,
            borderRadius: "16px",
            padding: "32px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            minHeight: "758px",
            boxSizing: "border-box",
          }}
        >
          {loading ? (
            <div style={{ color: MONUMENT, fontSize: "1rem" }}>Loading...</div>
          ) : error ? (
            <div style={{ color: "#d32f2f", fontSize: "1rem" }}>Error: {error}</div>
          ) : sortedItems.length === 0 ? (
            <div style={{ color: MONUMENT, fontSize: "1rem" }}>No hotlist items yet. Click "+ New Address" to add one.</div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              {sortedItems.map((item) => {
                const displayName = `${item.street || ""}, ${item.suburb || ""}`.trim() || "Unnamed Address";
                const isAgreementSent = agreementSentItems.has(item.id);
                return (
                  <div
                    key={item.id}
                    style={{
                      background: isAgreementSent ? "#2196F3" : WHITE,
                      borderRadius: "10px",
                      padding: "8px 16px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    }}
                  >
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: "1rem",
                          fontWeight: 600,
                          color: isAgreementSent ? WHITE : MONUMENT,
                        }}
                      >
                        {displayName}
                      </span>
                      {item.state && (
                        <>
                          <span style={{ color: isAgreementSent ? "rgba(255,255,255,0.7)" : "#ccc" }}>|</span>
                          <span
                            style={{
                              fontSize: "0.9rem",
                              color: isAgreementSent ? "rgba(255,255,255,0.9)" : "#666",
                            }}
                          >
                            {item.state}
                          </span>
                        </>
                      )}
                      {item.client_name && (
                        <>
                          <span style={{ color: isAgreementSent ? "rgba(255,255,255,0.7)" : "#ccc" }}>|</span>
                          <span
                            style={{
                              fontSize: "0.9rem",
                              color: isAgreementSent ? "rgba(255,255,255,0.9)" : "#666",
                            }}
                          >
                            {item.client_name}
                          </span>
                        </>
                      )}
                      {item.email && (
                        <>
                          <span style={{ color: isAgreementSent ? "rgba(255,255,255,0.7)" : "#ccc" }}>|</span>
                          <span
                            style={{
                              fontSize: "0.9rem",
                              color: isAgreementSent ? "rgba(255,255,255,0.8)" : "#888",
                            }}
                          >
                            {item.email}
                          </span>
                        </>
                      )}
                      {item.phone && (
                        <>
                          <span style={{ color: isAgreementSent ? "rgba(255,255,255,0.7)" : "#ccc" }}>|</span>
                          <span
                            style={{
                              fontSize: "0.9rem",
                              color: isAgreementSent ? "rgba(255,255,255,0.8)" : "#888",
                            }}
                          >
                            {item.phone}
                          </span>
                        </>
                      )}
                    </div>
                    {isAdmin && (
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        {!isAgreementSent && (
                          <button
                            onClick={() => handleAgreementSentClick(item)}
                            style={{
                              background: "#2196F3",
                              color: WHITE,
                              border: "none",
                              borderRadius: "8px",
                              padding: "8px 16px",
                              fontSize: "0.9rem",
                              fontWeight: 500,
                              cursor: "pointer",
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#1976D2")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "#2196F3")}
                          >
                            Agreement Sent
                          </button>
                        )}
                        <button
                          onClick={() => handleSoldClick(item)}
                          style={{
                            background: "#33cc33",
                            color: WHITE,
                            border: "none",
                            borderRadius: "8px",
                            padding: "8px 16px",
                            fontSize: "0.9rem",
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "background 0.2s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#2bb32b")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "#33cc33")}
                        >
                          Sold
                        </button>
                        <button
                          onClick={() => handleEmailClick(item)}
                          style={{
                            background: "#FF9800",
                            color: WHITE,
                            border: "none",
                            borderRadius: "8px",
                            padding: "8px 16px",
                            fontSize: "0.9rem",
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "background 0.2s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#F57C00")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "#FF9800")}
                        >
                          Email
                        </button>
                        <button
                          onClick={() => handleEditItemClick(item)}
                          style={{
                            background: MONUMENT,
                            color: WHITE,
                            border: "none",
                            borderRadius: "8px",
                            padding: "8px 16px",
                            fontSize: "0.9rem",
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "background 0.2s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          style={{
                            background: "#d32f2f",
                            color: WHITE,
                            border: "none",
                            borderRadius: "8px",
                            padding: "8px 16px",
                            fontSize: "0.9rem",
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "background 0.2s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#b71c1c")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "#d32f2f")}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {isNewItemOpen && (
        <>
          {currentModal === 1 && (
            <NewProject
              isOpen={true}
              onClose={handleModalClose}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onNext={handleModalNext}
            />
          )}
          {currentModal === 2 && (
            <NewProject2
              isOpen={true}
              onClose={handleModalClose}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onBack={handleModalBack}
              onNext={handleModalNext}
            />
          )}
        </>
      )}

      {isEditItemOpen && (
        <>
          {currentModal === 1 && (
            <NewProject
              isOpen={true}
              onClose={handleModalClose}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onNext={handleModalNext}
            />
          )}
          {currentModal === 2 && (
            <NewProject2
              isOpen={true}
              onClose={handleModalClose}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onBack={handleModalBack}
              onNext={handleModalNext}
            />
          )}
        </>
      )}

      {isSoldFlowOpen && (
        <>
          {currentModal === 3 && (
            <NewProject3
              isOpen={true}
              onClose={handleModalClose}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onBack={handleModalBack}
              onNext={handleModalNext}
            />
          )}
          {currentModal === 4 && (
            <NewProject4
              isOpen={true}
              onClose={handleModalClose}
              formData={formData}
              onFormDataChange={handleFormDataChange}
              onBack={handleModalBack}
              onCreate={handleCreateProjectFromSold}
            />
          )}
        </>
      )}
      </div>
    </>
  );
}
