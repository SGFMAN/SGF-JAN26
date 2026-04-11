import React, { useState, useEffect } from "react";
import { isDesignPhaseStatus, isHotlistStatus, isCancelledStatus } from "../utils/projectStatus";
import { Link } from "react-router-dom";
import { getStateFilter, setStateFilter as saveStateFilter } from "../utils/stateFilter";
import { isUserAdmin } from "../utils/auth";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const API_URL = "";

// SubStatus Detail options based on SubStatus
const SUBSTATUS_DETAIL_OPTIONS = {
  "Town Planning": [
    "Further Information Required",
    "Section 50 Advertising",
    "Planning Permit Received – Waiting Flood Consent",
    "Waiting Arborist Report",
    "Planner on Leave",
    "Waiting Hydraulic Engineer Assessment"
  ],
  "VicSmart": [
    "Waiting Hydraulic Engineer Assessment"
  ],
  "Waiting": [
    "Covenant Removal",
    "Deposit Balance",
    "Hydraulic Engineering",
    "Vince Assessment",
    "PIC",
    "Engineering",
    "Approved Working Drawings",
    "Approved Concept Drawings",
    "Signed Contract and Docs",
    "Septic Permit",
    "JCA & Soil"
  ],
  "Other": []
};

export default function StatusManager() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stateFilter, setStateFilter] = useState(getStateFilter());
  const [customSubstatuses, setCustomSubstatuses] = useState([]); // Track custom "Other" values
  const [customSubstatusDetails, setCustomSubstatusDetails] = useState({}); // Track custom details per substatus: { "Town Planning": ["Custom Detail 1", ...] }
  const [deletedSubstatuses, setDeletedSubstatuses] = useState(new Set()); // Track deleted base substatuses
  const [deletedDetails, setDeletedDetails] = useState({}); // Track deleted base details per substatus: { "Town Planning": Set(["Detail 1", ...]) }
  const [showEditModal, setShowEditModal] = useState(false);
  const [editModalType, setEditModalType] = useState(null); // "substatus" or "detail"
  const [pendingProjectId, setPendingProjectId] = useState(null);
  const [pendingSubstatus, setPendingSubstatus] = useState(null);
  const [editingItem, setEditingItem] = useState(null); // Item being edited: { value: "...", isBase: true/false }
  const [newItemInput, setNewItemInput] = useState("");
  const [showAllStatuses, setShowAllStatuses] = useState(true); // Toggle between all statuses and earliest incomplete
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchProjects();
    fetchSubstatuses();
    (async () => setIsAdmin(await isUserAdmin()))();
  }, []);

  // Fetch substatuses and details from backend
  async function fetchSubstatuses() {
    try {
      const response = await fetch(`${API_URL}/api/substatuses`);
      if (response.ok) {
        const data = await response.json();
        // Organize by substatus
        const detailsBySubstatus = {};
        data.forEach(item => {
          if (item.substatus && item.detail) {
            if (!detailsBySubstatus[item.substatus]) {
              detailsBySubstatus[item.substatus] = [];
            }
            // Only add if not already in the base options
            const baseOptions = SUBSTATUS_DETAIL_OPTIONS[item.substatus] || [];
            if (!baseOptions.includes(item.detail)) {
              detailsBySubstatus[item.substatus].push(item.detail);
            }
          }
        });
        setCustomSubstatusDetails(detailsBySubstatus);
      }
    } catch (err) {
      console.error("Error fetching substatuses:", err);
    }
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
      // Design Phase projects only (by status).
      const designPhaseProjects = data.filter((project) => {
        if (isHotlistStatus(project.status) || isCancelledStatus(project.status)) return false;
        return isDesignPhaseStatus(project.status);
      });
      // Sort alphabetically by suburb
      designPhaseProjects.sort((a, b) => {
        const suburbA = (a.suburb || "").toUpperCase();
        const suburbB = (b.suburb || "").toUpperCase();
        return suburbA.localeCompare(suburbB);
      });
      setProjects(designPhaseProjects);
      
      // Update custom substatuses from all projects
      const customValues = new Set();
      data.forEach(project => {
        if (project.substatus && 
            project.substatus !== "Town Planning" && 
            project.substatus !== "VicSmart" && 
            project.substatus !== "Waiting" && 
            project.substatus !== "Edit" &&
            project.substatus !== "") {
          customValues.add(project.substatus);
        }
      });
      setCustomSubstatuses(Array.from(customValues));
    } catch (err) {
      setError(err.message);
      console.error("Error fetching projects:", err);
    } finally {
      setLoading(false);
    }
  }

  // SubStatus options - includes custom values
  const getSubstatusOptions = () => {
    const baseOptions = ["Town Planning", "VicSmart", "Waiting"];
    // Filter out deleted base options
    const availableBaseOptions = baseOptions.filter(opt => !deletedSubstatuses.has(opt));
    // Add custom substatuses that aren't already in the base list
    const allCustom = customSubstatuses.filter(custom => !baseOptions.includes(custom));
    return [...availableBaseOptions, ...allCustom, "Edit"];
  };

  // Get effective value with default
  function getEffectiveValue(project, fieldName, defaultValue) {
    const value = project[fieldName];
    if (!value || value === null || value === undefined || value === "") {
      return defaultValue || "";
    }
    return value;
  }

  // Get available detail options for a given substatus
  function getDetailOptions(substatus) {
    if (!substatus || substatus === "") return ["Edit"];
    const baseOptions = SUBSTATUS_DETAIL_OPTIONS[substatus] || [];
    const customOptions = customSubstatusDetails[substatus] || [];
    // Filter out deleted base details
    const deletedForSubstatus = deletedDetails[substatus] || new Set();
    const availableBaseOptions = baseOptions.filter(opt => !deletedForSubstatus.has(opt));
    // Always include "Edit" at the end
    return [...availableBaseOptions, ...customOptions, "Edit"];
  }

  // Save field update
  async function saveField(projectId, fieldName, value, updateLocalState = true) {
    try {
      // Get the project to preserve other fields
      const project = projects.find(p => p.id === projectId);
      if (!project) return;

      // Update local state optimistically
      if (updateLocalState) {
        setProjects(prevProjects => 
          prevProjects.map(p => 
            p.id === projectId ? { ...p, [fieldName]: value === "" ? null : value } : p
          )
        );
      }

      const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "";
      
      // Build update data
      let updateData = {
        name: projectName,
        status: project.status || null,
        [fieldName]: value === "" ? null : value,
      };
      
      // If updating substatus or substatus_detail, always send both so backend can calculate combined field
      if (fieldName === "substatus" || fieldName === "substatus_detail") {
        const currentSubstatus = fieldName === "substatus" ? value : (project.substatus || "");
        const currentDetail = fieldName === "substatus_detail" ? value : (project.substatus_detail || "");
        
        // Always include both fields so backend can calculate combined
        updateData.substatus = currentSubstatus === "" ? null : currentSubstatus;
        updateData.substatus_detail = currentDetail === "" ? null : currentDetail;
        
        // Save substatus to substatuses table if it's a new custom one
        if (fieldName === "substatus" && value && 
            value !== "Town Planning" && 
            value !== "VicSmart" && 
            value !== "Waiting" && 
            value !== "Edit") {
          try {
            await fetch(`${API_URL}/api/substatuses`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ substatus: value, detail: null }),
            });
          } catch (e) {
            console.error("Error saving substatus to table:", e);
          }
        }
        
        // Save substatus_detail to substatuses table if both exist
        if (currentSubstatus && currentDetail && currentSubstatus !== "Edit" && currentDetail !== "Edit") {
          try {
            await fetch(`${API_URL}/api/substatuses`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ substatus: currentSubstatus, detail: currentDetail }),
            });
          } catch (e) {
            console.error("Error saving substatus detail to table:", e);
          }
        }
      }
      
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Failed to save field:", errorData.error || response.statusText);
        // Revert on error by refetching
        await fetchProjects();
        return;
      }

      // Don't refetch on success - we've already updated local state
    } catch (error) {
      console.error("Error saving field:", error);
      // Revert on error by refetching
      await fetchProjects();
    }
  }

  // Handle substatus change
  async function handleSubStatusChange(projectId, newValue) {
    if (newValue === "Edit") {
      // Show edit modal for substatus
      setPendingProjectId(projectId);
      setEditModalType("substatus");
      setEditingItem(null);
      setNewItemInput("");
      setShowEditModal(true);
      // Don't save "Edit" - wait for user to select/edit or cancel
      return;
    }
    
    await saveField(projectId, "substatus", newValue, true);
    // Clear substatus_detail if the new substatus doesn't support details
    const detailOptions = getDetailOptions(newValue);
    if (detailOptions.length === 0) {
      await saveField(projectId, "substatus_detail", "", true);
    }
    // If it's a custom value (not in standard list), add it to custom list
    if (newValue && 
        newValue !== "Town Planning" && 
        newValue !== "VicSmart" && 
        newValue !== "Waiting" && 
        newValue !== "Edit" &&
        !customSubstatuses.includes(newValue)) {
      setCustomSubstatuses(prev => [...prev, newValue]);
    }
  }

  // Get all substatus options for edit modal
  function getAllSubstatusOptions() {
    const baseOptions = ["Town Planning", "VicSmart", "Waiting"];
    const customOptions = customSubstatuses.filter(custom => !baseOptions.includes(custom));
    // Filter out deleted base options, all options are editable/deletable
    const availableBaseOptions = baseOptions.filter(opt => !deletedSubstatuses.has(opt));
    return [
      ...availableBaseOptions.map(opt => ({ value: opt, isBase: false })),
      ...customOptions.map(opt => ({ value: opt, isBase: false }))
    ];
  }

  // Get all detail options for edit modal
  function getAllDetailOptions(substatus) {
    if (!substatus) return [];
    const baseOptions = SUBSTATUS_DETAIL_OPTIONS[substatus] || [];
    const customOptions = customSubstatusDetails[substatus] || [];
    // Filter out deleted base details, all options are editable/deletable
    const deletedForSubstatus = deletedDetails[substatus] || new Set();
    const availableBaseOptions = baseOptions.filter(opt => !deletedForSubstatus.has(opt));
    return [
      ...availableBaseOptions.map(opt => ({ value: opt, isBase: false })),
      ...customOptions.map(opt => ({ value: opt, isBase: false }))
    ];
  }

  // Handle adding new item
  async function handleAddItem() {
    const trimmedValue = newItemInput.trim();
    if (!trimmedValue) return;

    if (editModalType === "substatus") {
      // Add new substatus
      try {
        await fetch(`${API_URL}/api/substatuses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ substatus: trimmedValue, detail: null }),
        });
      } catch (e) {
        console.error("Error saving substatus to table:", e);
      }
      
      if (!customSubstatuses.includes(trimmedValue)) {
        setCustomSubstatuses(prev => [...prev, trimmedValue]);
      }
      // Update project with new substatus
      if (pendingProjectId) {
        setProjects(prevProjects => 
          prevProjects.map(p => 
            p.id === pendingProjectId ? { ...p, substatus: trimmedValue, substatus_detail: null } : p
          )
        );
        await saveField(pendingProjectId, "substatus", trimmedValue, false);
        await saveField(pendingProjectId, "substatus_detail", "", false);
      }
    } else if (editModalType === "detail" && pendingSubstatus) {
      // Add new detail
      try {
        await fetch(`${API_URL}/api/substatuses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ substatus: pendingSubstatus, detail: trimmedValue }),
        });
      } catch (e) {
        console.error("Error saving detail to table:", e);
      }
      
      setCustomSubstatusDetails(prev => {
        const current = prev[pendingSubstatus] || [];
        if (!current.includes(trimmedValue)) {
          return { ...prev, [pendingSubstatus]: [...current, trimmedValue] };
        }
        return prev;
      });
      
      // Update project with new detail
      if (pendingProjectId) {
        setProjects(prevProjects => 
          prevProjects.map(p => 
            p.id === pendingProjectId ? { ...p, substatus_detail: trimmedValue } : p
          )
        );
        await saveField(pendingProjectId, "substatus_detail", trimmedValue, false);
      }
    }
    
    setNewItemInput("");
  }

  // Handle editing item
  function handleEditItem(item) {
    setEditingItem(item);
    setNewItemInput(item.value);
  }

  // Handle saving edited item
  async function handleSaveEdit() {
    if (!editingItem || !newItemInput.trim()) return;
    const trimmedValue = newItemInput.trim();
    
    if (editModalType === "substatus") {
      // Update substatus (all options are editable)
      try {
        // First, update all projects using this substatus
        const projectsToUpdate = projects.filter(p => p.substatus === editingItem.value);
        for (const project of projectsToUpdate) {
          await saveField(project.id, "substatus", trimmedValue, false);
        }
        
        // Update custom list
        const baseOptions = ["Town Planning", "VicSmart", "Waiting"];
        const isBaseOption = baseOptions.includes(editingItem.value);
        
        if (isBaseOption) {
          // If editing a base option, add the new value to custom list
          if (!customSubstatuses.includes(trimmedValue)) {
            setCustomSubstatuses(prev => [...prev, trimmedValue]);
          }
        } else {
          // If editing a custom option, update the custom list
          setCustomSubstatuses(prev => {
            const filtered = prev.filter(v => v !== editingItem.value);
            if (!filtered.includes(trimmedValue)) {
              return [...filtered, trimmedValue];
            }
            return filtered;
          });
        }
        
        // Update current project if it matches
        if (pendingProjectId) {
          const project = projects.find(p => p.id === pendingProjectId);
          if (project && project.substatus === editingItem.value) {
            setProjects(prevProjects => 
              prevProjects.map(p => 
                p.id === pendingProjectId ? { ...p, substatus: trimmedValue } : p
              )
            );
            await saveField(pendingProjectId, "substatus", trimmedValue, false);
          }
        }
      } catch (e) {
        console.error("Error updating substatus:", e);
      }
    } else if (editModalType === "detail" && pendingSubstatus) {
      // Update detail (all options are editable)
      try {
        // Update all projects using this detail
        const projectsToUpdate = projects.filter(p => 
          p.substatus === pendingSubstatus && p.substatus_detail === editingItem.value
        );
        for (const project of projectsToUpdate) {
          await saveField(project.id, "substatus_detail", trimmedValue, false);
        }
        
        // Update custom details
        const baseOptions = SUBSTATUS_DETAIL_OPTIONS[pendingSubstatus] || [];
        const isBaseOption = baseOptions.includes(editingItem.value);
        
        if (isBaseOption) {
          // If editing a base option, add the new value to custom list
          setCustomSubstatusDetails(prev => {
            const current = prev[pendingSubstatus] || [];
            if (!current.includes(trimmedValue)) {
              return { ...prev, [pendingSubstatus]: [...current, trimmedValue] };
            }
            return prev;
          });
        } else {
          // If editing a custom option, update the custom list
          setCustomSubstatusDetails(prev => {
            const current = prev[pendingSubstatus] || [];
            const filtered = current.filter(v => v !== editingItem.value);
            if (!filtered.includes(trimmedValue)) {
              return { ...prev, [pendingSubstatus]: [...filtered, trimmedValue] };
            }
            return { ...prev, [pendingSubstatus]: filtered };
          });
        }
        
        // Update current project if it matches
        if (pendingProjectId) {
          const project = projects.find(p => p.id === pendingProjectId);
          if (project && project.substatus_detail === editingItem.value) {
            setProjects(prevProjects => 
              prevProjects.map(p => 
                p.id === pendingProjectId ? { ...p, substatus_detail: trimmedValue } : p
              )
            );
            await saveField(pendingProjectId, "substatus_detail", trimmedValue, false);
          }
        }
      } catch (e) {
        console.error("Error updating detail:", e);
      }
    }
    
    setEditingItem(null);
    setNewItemInput("");
  }

  // Handle deleting item
  async function handleDeleteItem(item) {
    // All options are deletable now
    if (editModalType === "substatus") {
      // Delete substatus
      try {
        // Clear from projects using this substatus
        const projectsToUpdate = projects.filter(p => p.substatus === item.value);
        for (const project of projectsToUpdate) {
          await saveField(project.id, "substatus", "", false);
        }
        
        // Check if it's a base option
        const baseOptions = ["Town Planning", "VicSmart", "Waiting"];
        if (baseOptions.includes(item.value)) {
          // Mark as deleted
          setDeletedSubstatuses(prev => new Set([...prev, item.value]));
        } else {
          // Remove from custom list
          setCustomSubstatuses(prev => prev.filter(v => v !== item.value));
        }
        
        // Clear current project if it matches
        if (pendingProjectId) {
          const project = projects.find(p => p.id === pendingProjectId);
          if (project && project.substatus === item.value) {
            setProjects(prevProjects => 
              prevProjects.map(p => 
                p.id === pendingProjectId ? { ...p, substatus: "", substatus_detail: "" } : p
              )
            );
            await saveField(pendingProjectId, "substatus", "", false);
            await saveField(pendingProjectId, "substatus_detail", "", false);
          }
        }
      } catch (e) {
        console.error("Error deleting substatus:", e);
      }
    } else if (editModalType === "detail" && pendingSubstatus) {
      // Delete detail
      try {
        // Clear from projects using this detail
        const projectsToUpdate = projects.filter(p => 
          p.substatus === pendingSubstatus && p.substatus_detail === item.value
        );
        for (const project of projectsToUpdate) {
          await saveField(project.id, "substatus_detail", "", false);
        }
        
        // Check if it's a base option
        const baseOptions = SUBSTATUS_DETAIL_OPTIONS[pendingSubstatus] || [];
        if (baseOptions.includes(item.value)) {
          // Mark as deleted
          setDeletedDetails(prev => {
            const current = prev[pendingSubstatus] || new Set();
            return { ...prev, [pendingSubstatus]: new Set([...current, item.value]) };
          });
        } else {
          // Remove from custom list
          setCustomSubstatusDetails(prev => {
            const current = prev[pendingSubstatus] || [];
            return { ...prev, [pendingSubstatus]: current.filter(v => v !== item.value) };
          });
        }
        
        // Clear current project if it matches
        if (pendingProjectId) {
          const project = projects.find(p => p.id === pendingProjectId);
          if (project && project.substatus_detail === item.value) {
            setProjects(prevProjects => 
              prevProjects.map(p => 
                p.id === pendingProjectId ? { ...p, substatus_detail: "" } : p
              )
            );
            await saveField(pendingProjectId, "substatus_detail", "", false);
          }
        }
      } catch (e) {
        console.error("Error deleting detail:", e);
      }
    }
  }

  // Handle cancel edit modal
  function handleCancelEdit() {
    // Reset dropdown if needed
    if (pendingProjectId) {
      const project = projects.find(p => p.id === pendingProjectId);
      if (project) {
        // Don't reset - just close modal
      }
    }
    setShowEditModal(false);
    setEditModalType(null);
    setPendingProjectId(null);
    setPendingSubstatus(null);
    setEditingItem(null);
    setNewItemInput("");
  }

  // Generate email list
  function handleEmailList() {
    // Get current date in format: DD/MM/YYYY
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    
    // Build email body with project list
    const emailBody = projects.map(project => {
      const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "Unnamed Project";
      const substatus = project.substatus || "";
      return `${projectName} - ${substatus || ""}`;
    }).join('\n');
    
    // Create mailto link
    const subject = encodeURIComponent(`Weekly Update - ${dateStr}`);
    const body = encodeURIComponent(emailBody);
    const mailtoLink = `mailto:?subject=${subject}&body=${body}`;
    
    // Open email client
    window.location.href = mailtoLink;
  }

  // Handle substatus detail change
  async function handleSubStatusDetailChange(projectId, newValue, substatus) {
    if (newValue === "Edit") {
      // Show edit modal for detail
      setPendingProjectId(projectId);
      setPendingSubstatus(substatus);
      setEditModalType("detail");
      setEditingItem(null);
      setNewItemInput("");
      setShowEditModal(true);
      // Don't save "Edit" - wait for user to select/edit or cancel
      return;
    }
    
    await saveField(projectId, "substatus_detail", newValue, true);
    
    // If it's a custom detail (not in base options), add it to custom list
    if (newValue && substatus) {
      const baseOptions = SUBSTATUS_DETAIL_OPTIONS[substatus] || [];
      if (!baseOptions.includes(newValue) && newValue !== "Edit") {
        setCustomSubstatusDetails(prev => {
          const current = prev[substatus] || [];
          if (!current.includes(newValue)) {
            return { ...prev, [substatus]: [...current, newValue] };
          }
          return prev;
        });
      }
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
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img
            src={logo}
            alt="SGF Logo"
            style={{
              width: "120px",
              height: "auto",
            }}
          />
        </Link>
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
            Status Manager
          </h1>
        </div>
        <div
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            display: "flex",
            gap: "10px",
            alignItems: "center",
          }}
        >
          {/* State Filter Buttons */}
          <button
            onClick={() => {
              const newFilter = "VIC";
              setStateFilter(newFilter);
              saveStateFilter(newFilter);
            }}
            style={{
              background: stateFilter === "VIC" ? "#4D93D9" : WHITE,
              color: stateFilter === "VIC" ? WHITE : MONUMENT,
              border: `2px solid ${stateFilter === "VIC" ? "#4D93D9" : MONUMENT}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "VIC") {
                e.currentTarget.style.background = "#f0f0f0";
              }
            }}
            onMouseLeave={(e) => {
              if (stateFilter !== "VIC") {
                e.currentTarget.style.background = WHITE;
              }
            }}
          >
            VIC Only
          </button>
          <button
            onClick={() => {
              const newFilter = "QLD";
              setStateFilter(newFilter);
              saveStateFilter(newFilter);
            }}
            style={{
              background: stateFilter === "QLD" ? "#D54358" : WHITE,
              color: stateFilter === "QLD" ? WHITE : MONUMENT,
              border: `2px solid ${stateFilter === "QLD" ? "#D54358" : MONUMENT}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "QLD") {
                e.currentTarget.style.background = "#f0f0f0";
              }
            }}
            onMouseLeave={(e) => {
              if (stateFilter !== "QLD") {
                e.currentTarget.style.background = WHITE;
              }
            }}
          >
            QLD Only
          </button>
          <button
            onClick={() => {
              const newFilter = "All";
              setStateFilter(newFilter);
              saveStateFilter(newFilter);
            }}
            style={{
              background: stateFilter === "All" ? MONUMENT : WHITE,
              color: stateFilter === "All" ? WHITE : MONUMENT,
              border: `2px solid ${MONUMENT}`,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (stateFilter !== "All") {
                e.currentTarget.style.background = "#f0f0f0";
              }
            }}
            onMouseLeave={(e) => {
              if (stateFilter !== "All") {
                e.currentTarget.style.background = WHITE;
              }
            }}
          >
            All Projects
          </button>
        </div>
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
            overflowY: "auto",
          }}
        >
          {/* Menu Buttons */}
          <Link
            to="/managers/site-visit-manager"
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
            Site Visit Manager
          </Link>
          <Link
            to="/managers/contract-manager"
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
            Contract Manager
          </Link>
          <Link
            to="/managers/colour-manager"
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
            Colour Manager
          </Link>
          <Link
            to="/managers/status-manager"
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
            Status Manager
          </Link>
          {isAdmin && (
            <Link
              to="/managers/drawing-manager"
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
              Drawing Manager
            </Link>
          )}
          <Link
            to="/managers/qp-manager"
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
            QP Manager
          </Link>
          <div style={{ flex: 1 }} />
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
            ← Back to Main
          </Link>
        </div>

        {/* Section 3: Content */}
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
            position: "relative",
          }}
        >
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: MONUMENT }}>
              Loading projects...
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#cc3333" }}>
              Error: {error}
            </div>
          ) : (
            <>
              {/* Filter projects by state */}
              {(() => {
                const filteredProjects = stateFilter !== "All" 
                  ? projects.filter(project => {
                      const projectState = (project.state || "").toUpperCase();
                      return projectState === stateFilter.toUpperCase();
                    })
                  : projects;
                
                if (filteredProjects.length === 0) {
                  return (
                    <div style={{ textAlign: "center", padding: "40px", color: MONUMENT }}>
                      No Design Phase projects found.
                    </div>
                  );
                }
                
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {/* Email List Button and Toggle */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginBottom: "8px" }}>
                      <button
                        onClick={() => setShowAllStatuses(!showAllStatuses)}
                        style={{
                          padding: "10px 20px",
                          borderRadius: "8px",
                          border: "none",
                          background: showAllStatuses ? MONUMENT : SECTION_GREY,
                          color: showAllStatuses ? WHITE : MONUMENT,
                          fontSize: "0.9rem",
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "background 0.2s",
                        }}
                        onMouseOver={(e) => {
                          if (showAllStatuses) {
                            e.target.style.background = "#222";
                          } else {
                            e.target.style.background = "#b0b0b0";
                          }
                        }}
                        onMouseOut={(e) => {
                          if (showAllStatuses) {
                            e.target.style.background = MONUMENT;
                          } else {
                            e.target.style.background = SECTION_GREY;
                          }
                        }}
                      >
                        {showAllStatuses ? "Show Next" : "Show All"}
                      </button>
                      <button
                        onClick={handleEmailList}
                        style={{
                          padding: "10px 20px",
                          borderRadius: "8px",
                          border: "none",
                          background: MONUMENT,
                          color: WHITE,
                          fontSize: "0.9rem",
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "background 0.2s",
                        }}
                        onMouseOver={(e) => (e.target.style.background = "#222")}
                        onMouseOut={(e) => (e.target.style.background = MONUMENT)}
                      >
                        Email List
                      </button>
                    </div>
                    {/* Header Row */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 11fr",
                        gap: "16px",
                        padding: "12px 16px",
                        background: MONUMENT,
                        color: WHITE,
                        borderRadius: "8px",
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        position: "sticky",
                        top: "0px",
                        zIndex: 10,
                      }}
                    >
                      <div>Project</div>
                      {showAllStatuses ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: "4px" }}>
                          <div style={{ textAlign: "center", fontSize: "0.75rem" }}>Deposit</div>
                          <div style={{ textAlign: "center", fontSize: "0.75rem" }}>Drawings</div>
                          <div style={{ textAlign: "center", fontSize: "0.75rem" }}>Site Visit</div>
                          <div style={{ textAlign: "center", fontSize: "0.75rem" }}>Colour</div>
                          <div style={{ textAlign: "center", fontSize: "0.75rem" }}>Window</div>
                          <div style={{ textAlign: "center", fontSize: "0.75rem" }}>Contract</div>
                          <div style={{ textAlign: "center", fontSize: "0.75rem" }}>Survey</div>
                          <div style={{ textAlign: "center", fontSize: "0.75rem" }}>Planning</div>
                          <div style={{ textAlign: "center", fontSize: "0.75rem" }}>Energy</div>
                          <div style={{ textAlign: "center", fontSize: "0.75rem" }}>Footing</div>
                          <div style={{ textAlign: "center", fontSize: "0.75rem" }}>Building</div>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: "4px" }}>
                          <div style={{ textAlign: "center", fontSize: "0.75rem" }}>Next Status</div>
                          <div></div>
                          <div></div>
                          <div></div>
                          <div></div>
                          <div></div>
                          <div></div>
                          <div></div>
                          <div></div>
                          <div></div>
                          <div></div>
                        </div>
                      )}
                    </div>
                    {/* Project Rows */}
                    {filteredProjects.map((project) => {
                const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "Unnamed Project";
                
                // Status color functions (same as Overview.jsx)
                const COLOR_RED = "#cc3333";
                const COLOR_ORANGE = "#ff8800";
                const COLOR_GREEN = "#33cc33";
                
                const getDepositStatusColor = () => {
                  if (!project.deposit || !project.project_cost) return COLOR_RED;
                  const depositStr = project.deposit.toString().replace(/[^0-9]/g, "");
                  const depositNum = parseInt(depositStr) || 0;
                  const fullDeposit = Math.floor(parseInt(project.project_cost.toString().replace(/[^0-9]/g, "")) / 20) || 0;
                  return depositNum >= fullDeposit && fullDeposit > 0 ? COLOR_GREEN : COLOR_RED;
                };
                
                const getDrawingsStatusColor = () => {
                  const status = project.drawings_status || "Not Assigned";
                  if (status === "Concept Stage" || status === "Working Drawing Stage") return COLOR_ORANGE;
                  if (status === "Drawings Complete") return COLOR_GREEN;
                  return COLOR_RED;
                };
                
                const getSiteVisitStatusColor = () => {
                  const status = project.site_visit_status || "Not Complete";
                  if (status === "Booked") return COLOR_ORANGE;
                  if (status === "Complete") return COLOR_GREEN;
                  return COLOR_RED;
                };
                
                const getColoursStatusColor = () => {
                  const status = project.colours_status || "Not Sent";
                  if (status === "Sent") return COLOR_ORANGE;
                  if (status === "Complete") return COLOR_GREEN;
                  return COLOR_RED;
                };
                
                const getWindowStatusColor = () => {
                  const status = project.window_status || "Not Ordered";
                  if (status === "Ordered") return COLOR_ORANGE;
                  if (status === "Complete") return COLOR_GREEN;
                  return COLOR_RED;
                };
                
                const getContractStatusColor = () => {
                  const contractStatus = project.contract_status || "Not Sent";
                  const supportingDocsStatus = project.supporting_documents_status || "Not Sent";
                  const waterDeclStatus = project.water_declaration_status || "Not Required";
                  if (contractStatus === "Complete" && supportingDocsStatus === "Complete" && 
                      (waterDeclStatus === "Complete" || waterDeclStatus === "Not Required")) {
                    return COLOR_GREEN;
                  }
                  if (contractStatus === "Sent") return COLOR_ORANGE;
                  return COLOR_RED;
                };
                
                const getSurveySoilsStatusColor = () => {
                  const surveyStatus = project.survey_status || "Not Booked";
                  const soilStatus = project.soil_status || "Not Booked";
                  if (surveyStatus === "Not Booked" && soilStatus === "Not Booked") return COLOR_RED;
                  if (surveyStatus === "Complete" && soilStatus === "Complete") return COLOR_GREEN;
                  return COLOR_ORANGE;
                };
                
                const getPlanningPermitStatusColor = () => {
                  const status = project.planning_status || "Not Selected";
                  if (status === "No Planning Required" || status === "Planning Permit Issued") return COLOR_GREEN;
                  return COLOR_RED;
                };
                
                const getEnergyReportStatusColor = () => {
                  const status = project.energy_report_status || "Not Submitted";
                  if (status === "Complete") return COLOR_GREEN;
                  if (status === "Sent") return COLOR_ORANGE;
                  return COLOR_RED;
                };
                
                const getFootingCertificationStatusColor = () => {
                  const status = project.footing_certification_status || "Not Submitted";
                  if (status === "Complete") return COLOR_GREEN;
                  if (status === "Sent") return COLOR_ORANGE;
                  return COLOR_RED;
                };
                
                const getBuildingPermitStatusColor = () => {
                  const status = project.building_permit_status || "Not Submitted";
                  if (status === "Complete") return COLOR_GREEN;
                  if (status === "Sent") return COLOR_ORANGE;
                  return COLOR_RED;
                };

                // Find the earliest incomplete status
                const getEarliestIncompleteStatus = () => {
                  const statuses = [
                    { name: "Deposit", color: getDepositStatusColor(), getColor: getDepositStatusColor },
                    { name: "Drawings", color: getDrawingsStatusColor(), getColor: getDrawingsStatusColor },
                    { name: "Site Visit", color: getSiteVisitStatusColor(), getColor: getSiteVisitStatusColor },
                    { name: "Colour", color: getColoursStatusColor(), getColor: getColoursStatusColor },
                    { name: "Window", color: getWindowStatusColor(), getColor: getWindowStatusColor },
                    { name: "Contract", color: getContractStatusColor(), getColor: getContractStatusColor },
                    { name: "Survey", color: getSurveySoilsStatusColor(), getColor: getSurveySoilsStatusColor },
                    { name: "Planning", color: getPlanningPermitStatusColor(), getColor: getPlanningPermitStatusColor },
                    { name: "Energy", color: getEnergyReportStatusColor(), getColor: getEnergyReportStatusColor },
                    { name: "Footing", color: getFootingCertificationStatusColor(), getColor: getFootingCertificationStatusColor },
                    { name: "Building", color: getBuildingPermitStatusColor(), getColor: getBuildingPermitStatusColor },
                  ];
                  
                  // Find the first status that is not green (complete)
                  for (const status of statuses) {
                    if (status.color !== COLOR_GREEN) {
                      return status;
                    }
                  }
                  
                  // If all are complete, return the last one
                  return statuses[statuses.length - 1];
                };

                const earliestIncomplete = getEarliestIncompleteStatus();

                return (
                  <div
                    key={project.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 11fr",
                      gap: "16px",
                      padding: "12px 16px",
                      background: WHITE,
                      borderRadius: "8px",
                      color: MONUMENT,
                      fontSize: "0.9rem",
                      alignItems: "center",
                    }}
                  >
                    <Link
                      to={`/project/${project.id}`}
                      style={{
                        textDecoration: "none",
                        color: MONUMENT,
                        fontWeight: 500,
                        display: "block",
                      }}
                    >
                      {projectName}
                    </Link>
                    {showAllStatuses ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: "4px" }}>
                      {/* Deposit Status */}
                      <div
                        style={{
                          width: "100%",
                          height: "24px",
                          borderRadius: "4px",
                          background: getDepositStatusColor(),
                          border: "1px solid white",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: WHITE,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                        title="Deposit Status"
                      >
                        Deposit
                      </div>
                      {/* Drawings Status */}
                      <div
                        style={{
                          width: "100%",
                          height: "24px",
                          borderRadius: "4px",
                          background: getDrawingsStatusColor(),
                          border: "1px solid white",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: WHITE,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                        title="Drawings Status"
                      >
                        Drawings
                      </div>
                      {/* Site Visit Status */}
                      <div
                        style={{
                          width: "100%",
                          height: "24px",
                          borderRadius: "4px",
                          background: getSiteVisitStatusColor(),
                          border: "1px solid white",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: WHITE,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                        title="Site Visit Status"
                      >
                        Site Visit
                      </div>
                      {/* Colour Status */}
                      <div
                        style={{
                          width: "100%",
                          height: "24px",
                          borderRadius: "4px",
                          background: getColoursStatusColor(),
                          border: "1px solid white",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: WHITE,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                        title="Colour Status"
                      >
                        Colour
                      </div>
                      {/* Window Status */}
                      <div
                        style={{
                          width: "100%",
                          height: "24px",
                          borderRadius: "4px",
                          background: getWindowStatusColor(),
                          border: "1px solid white",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: WHITE,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                        title="Window Status"
                      >
                        Window
                      </div>
                      {/* Contract Status */}
                      <div
                        style={{
                          width: "100%",
                          height: "24px",
                          borderRadius: "4px",
                          background: getContractStatusColor(),
                          border: "1px solid white",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: WHITE,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                        title="Contract Status"
                      >
                        Contract
                      </div>
                      {/* Survey & Soils Status */}
                      <div
                        style={{
                          width: "100%",
                          height: "24px",
                          borderRadius: "4px",
                          background: getSurveySoilsStatusColor(),
                          border: "1px solid white",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: WHITE,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                        title="Survey & Soils Status"
                      >
                        Survey
                      </div>
                      {/* Planning Permit Status */}
                      <div
                        style={{
                          width: "100%",
                          height: "24px",
                          borderRadius: "4px",
                          background: getPlanningPermitStatusColor(),
                          border: "1px solid white",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: WHITE,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                        title="Planning Permit Status"
                      >
                        Planning
                      </div>
                      {/* Energy Report Status */}
                      <div
                        style={{
                          width: "100%",
                          height: "24px",
                          borderRadius: "4px",
                          background: getEnergyReportStatusColor(),
                          border: "1px solid white",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: WHITE,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                        title="Energy Report Status"
                      >
                        Energy
                      </div>
                      {/* Footing Certification Status */}
                      <div
                        style={{
                          width: "100%",
                          height: "24px",
                          borderRadius: "4px",
                          background: getFootingCertificationStatusColor(),
                          border: "1px solid white",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: WHITE,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                        title="Footing Certification Status"
                      >
                        Footing
                      </div>
                      {/* Building Permit Status */}
                      <div
                        style={{
                          width: "100%",
                          height: "24px",
                          borderRadius: "4px",
                          background: getBuildingPermitStatusColor(),
                          border: "1px solid white",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: WHITE,
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                        title="Building Permit Status"
                      >
                        Building
                      </div>
                    </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gap: "4px" }}>
                        <div
                          style={{
                            width: "100%",
                            height: "24px",
                            borderRadius: "4px",
                            background: earliestIncomplete.color,
                            border: "1px solid white",
                            boxSizing: "border-box",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: WHITE,
                            fontSize: "0.75rem",
                            fontWeight: 500,
                          }}
                          title={`${earliestIncomplete.name} Status`}
                        >
                          {earliestIncomplete.name}
                        </div>
                        <div></div>
                        <div></div>
                        <div></div>
                        <div></div>
                        <div></div>
                        <div></div>
                        <div></div>
                        <div></div>
                        <div></div>
                        <div></div>
                      </div>
                    )}
                  </div>
                    );
                  })}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* Edit Modal for SubStatus or SubStatusDetail */}
      {showEditModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            pointerEvents: "auto",
          }}
          onClick={handleCancelEdit}
        >
          <div
            style={{
              background: SECTION_GREY,
              borderRadius: "18px",
              padding: "32px",
              width: "90%",
              maxWidth: "600px",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                marginTop: 0,
                marginBottom: "24px",
                color: MONUMENT,
              }}
            >
              {editModalType === "substatus" ? "Edit SubStatus" : `Edit SubStatus Detail${pendingSubstatus ? ` (${pendingSubstatus})` : ""}`}
            </h2>
            
            {/* List of existing options */}
            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  marginBottom: "12px",
                  color: MONUMENT,
                }}
              >
                Existing Options:
              </div>
              <div
                style={{
                  maxHeight: "300px",
                  overflowY: "auto",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  background: WHITE,
                }}
              >
                {(editModalType === "substatus" ? getAllSubstatusOptions() : getAllDetailOptions(pendingSubstatus)).map((item, index) => (
                  <div
                    key={index}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      borderBottom: index < (editModalType === "substatus" ? getAllSubstatusOptions() : getAllDetailOptions(pendingSubstatus)).length - 1 ? "1px solid #eee" : "none",
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "#f5f5f5")}
                    onMouseOut={(e) => (e.currentTarget.style.background = WHITE)}
                    onClick={async () => {
                      // Select this option
                      if (editModalType === "substatus" && pendingProjectId) {
                        await saveField(pendingProjectId, "substatus", item.value, true);
                        const detailOptions = getDetailOptions(item.value);
                        if (detailOptions.length === 0) {
                          await saveField(pendingProjectId, "substatus_detail", "", true);
                        }
                      } else if (editModalType === "detail" && pendingProjectId && pendingSubstatus) {
                        await saveField(pendingProjectId, "substatus_detail", item.value, true);
                      }
                      handleCancelEdit();
                    }}
                  >
                    <span style={{ flex: 1, color: MONUMENT, fontWeight: 400 }}>
                      {item.value}
                    </span>
                    <div style={{ display: "flex", gap: "8px" }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditItem(item);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          border: "1px solid #ddd",
                          background: WHITE,
                          color: MONUMENT,
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "background 0.2s",
                        }}
                        onMouseOver={(e) => (e.target.style.background = "#f5f5f5")}
                        onMouseOut={(e) => (e.target.style.background = WHITE)}
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Are you sure you want to delete "${item.value}"?`)) {
                            handleDeleteItem(item);
                          }
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          border: "1px solid #ddd",
                          background: WHITE,
                          color: "#cc3333",
                          fontSize: "0.85rem",
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "background 0.2s",
                        }}
                        onMouseOver={(e) => (e.target.style.background = "#ffe6e6")}
                        onMouseOut={(e) => (e.target.style.background = WHITE)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add/Edit input */}
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.95rem",
                  marginBottom: "10px",
                  fontWeight: 500,
                  color: MONUMENT,
                }}
              >
                {editingItem ? `Edit "${editingItem.value}":` : "Add New:"}
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={newItemInput}
                  onChange={(e) => setNewItemInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (editingItem) {
                        handleSaveEdit();
                      } else {
                        handleAddItem();
                      }
                    } else if (e.key === "Escape") {
                      handleCancelEdit();
                    }
                  }}
                  placeholder={editingItem ? "Enter new value..." : `Enter new ${editModalType === "substatus" ? "SubStatus" : "Detail"}...`}
                  autoFocus
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    borderRadius: "8px",
                    border: "1px solid #ddd",
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    fontWeight: 500,
                    boxSizing: "border-box",
                  }}
                />
                {editingItem ? (
                  <button
                    onClick={handleSaveEdit}
                    disabled={!newItemInput.trim()}
                    style={{
                      padding: "12px 24px",
                      borderRadius: "8px",
                      border: "none",
                      background: newItemInput.trim() ? MONUMENT : "#ccc",
                      color: WHITE,
                      fontSize: "0.95rem",
                      fontWeight: 500,
                      cursor: newItemInput.trim() ? "pointer" : "not-allowed",
                      transition: "background 0.2s",
                    }}
                    onMouseOver={(e) => {
                      if (newItemInput.trim()) {
                        e.target.style.background = "#222";
                      }
                    }}
                    onMouseOut={(e) => {
                      if (newItemInput.trim()) {
                        e.target.style.background = MONUMENT;
                      }
                    }}
                  >
                    Save
                  </button>
                ) : (
                  <button
                    onClick={handleAddItem}
                    disabled={!newItemInput.trim()}
                    style={{
                      padding: "12px 24px",
                      borderRadius: "8px",
                      border: "none",
                      background: newItemInput.trim() ? MONUMENT : "#ccc",
                      color: WHITE,
                      fontSize: "0.95rem",
                      fontWeight: 500,
                      cursor: newItemInput.trim() ? "pointer" : "not-allowed",
                      transition: "background 0.2s",
                    }}
                    onMouseOver={(e) => {
                      if (newItemInput.trim()) {
                        e.target.style.background = "#222";
                      }
                    }}
                    onMouseOut={(e) => {
                      if (newItemInput.trim()) {
                        e.target.style.background = MONUMENT;
                      }
                    }}
                  >
                    Add
                  </button>
                )}
                {editingItem && (
                  <button
                    onClick={() => {
                      setEditingItem(null);
                      setNewItemInput("");
                    }}
                    style={{
                      padding: "12px 24px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      background: WHITE,
                      color: MONUMENT,
                      fontSize: "0.95rem",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                    onMouseOver={(e) => (e.target.style.background = "#f5f5f5")}
                    onMouseOut={(e) => (e.target.style.background = WHITE)}
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </div>

            {/* Close button */}
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={handleCancelEdit}
                style={{
                  padding: "10px 24px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  background: WHITE,
                  color: MONUMENT,
                  fontSize: "0.95rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseOver={(e) => (e.target.style.background = "#f5f5f5")}
                onMouseOut={(e) => (e.target.style.background = WHITE)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
