import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import * as THREE from "three";
import grassImage from "../images/grass.jpg";
import { COLORBOND_COLOURS } from "../constants/colorbondColours";
import logo from "../images/logo.png";
import ThreeDVis from "./ThreeDVis";

const MONUMENT = "#323233";
const WHITE = "#fff";
const API_URL = "";

const ROOF_STYLE_OPTIONS = ["Select", "Affordable", "Superior", "Skillion"];
const WINDOW_FRAME_COLOUR_OPTIONS = ["Select", "Monument", "Paperbark", "White", "Primrose", "Black", "Surfmist", "Woodland Grey"];
const WINDOW_SURROUND_COLOUR_OPTIONS = ["Select", ...COLORBOND_COLOURS.map(c => c.name)];

const BUILDING_PARTS = [
  { key: "roof", label: "Roof" },
  { key: "cladding", label: "Cladding" },
  { key: "baseboards", label: "Baseboards" },
  { key: "fasciaGutter", label: "Fascia & Gutter" },
  { key: "balustrade", label: "Balustrade" },
  { key: "frontDoor", label: "Front Door" },
  { key: "windowFrames", label: "Window Frames" },
  { key: "windowSurrounds", label: "Window Surrounds" },
];

export default function ThreeDVisPortal() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [roofColour, setRoofColour] = useState("Select");
  const [claddingColour, setCladdingColour] = useState("Select");
  const [baseboardsColour, setBaseboardsColour] = useState("Select");
  const [roofStyle, setRoofStyle] = useState("Select");
  const [fasciaGutterColour, setFasciaGutterColour] = useState("Select");
  const [balustradeColour, setBalustradeColour] = useState("Select");
  const [frontDoorColour, setFrontDoorColour] = useState("Select");
  const [windowFramesColour, setWindowFramesColour] = useState("Select");
  const [windowSurroundsColour, setWindowSurroundsColour] = useState("Select");
  const [selectedBuildingPart, setSelectedBuildingPart] = useState("roof");
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState("");

  // Load project data
  useEffect(() => {
    async function fetchProject() {
      try {
        const response = await fetch(`${API_URL}/api/projects/${projectId}`);
        if (!response.ok) {
          throw new Error("Project not found");
        }
        const projectData = await response.json();
        setProject(projectData);
        
        const name = projectData?.street && projectData?.suburb 
          ? `${projectData.street}, ${projectData.suburb}`.trim() 
          : projectData?.name || "";
        setProjectName(name);
        
        // Load current colour values
        setRoofColour(projectData.roof_colour || "Select");
        setCladdingColour(projectData.cladding_colour || "Select");
        setBaseboardsColour(projectData.baseboards_colour || "Select");
        setRoofStyle(projectData.roof_style || "Select");
        setFasciaGutterColour(projectData.fascia_gutter_colour || "Select");
        setBalustradeColour(projectData.balustrade_colour || "Select");
        setFrontDoorColour(projectData.front_door_colour || "Select");
        setWindowFramesColour(projectData.window_frames_colour || "Select");
        setWindowSurroundsColour(projectData.window_surrounds_colour || "Select");
      } catch (error) {
        console.error("Error fetching project:", error);
        setError("Project not found");
      }
    }
    
    if (projectId) {
      fetchProject();
    }
  }, [projectId]);

  // Save function
  async function saveField(fieldName, value) {
    if (!projectId) {
      setError("Invalid project ID");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          [fieldName]: value === "Select" ? null : value,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save");
      }

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (error) {
      console.error("Error saving field:", error);
      setError(error.message || "Failed to save. Please try again.");
    }
  }

  // Handlers for each field
  async function handleRoofColourChange(e) {
    const newValue = e.target.value;
    setRoofColour(newValue);
    await saveField("roof_colour", newValue);
  }

  async function handleCladdingColourChange(e) {
    const newValue = e.target.value;
    setCladdingColour(newValue);
    await saveField("cladding_colour", newValue);
  }

  async function handleBaseboardsColourChange(e) {
    const newValue = e.target.value;
    setBaseboardsColour(newValue);
    await saveField("baseboards_colour", newValue);
  }

  async function handleRoofStyleChange(e) {
    const newValue = e.target.value;
    setRoofStyle(newValue);
    await saveField("roof_style", newValue);
  }

  async function handleFasciaGutterColourChange(e) {
    const newValue = e.target.value;
    setFasciaGutterColour(newValue);
    await saveField("fascia_gutter_colour", newValue);
  }

  async function handleBalustradeColourChange(e) {
    const newValue = e.target.value;
    setBalustradeColour(newValue);
    await saveField("balustrade_colour", newValue);
  }

  async function handleFrontDoorColourChange(e) {
    const newValue = e.target.value;
    setFrontDoorColour(newValue);
    await saveField("front_door_colour", newValue);
  }

  async function handleWindowFramesColourChange(e) {
    const newValue = e.target.value;
    setWindowFramesColour(newValue);
    await saveField("window_frames_colour", newValue);
  }

  async function handleWindowSurroundsColourChange(e) {
    const newValue = e.target.value;
    setWindowSurroundsColour(newValue);
    await saveField("window_surrounds_colour", newValue);
  }

  // Helper function to get available colours for a building part
  const getAvailableColours = (partKey) => {
    if (partKey === "windowFrames") {
      return WINDOW_FRAME_COLOUR_OPTIONS.filter(opt => opt !== "Select").map(opt => {
        const colour = opt === "Black" 
          ? COLORBOND_COLOURS.find(c => c.name === "Night Sky")
          : COLORBOND_COLOURS.find(c => c.name === opt);
        if (colour) {
          return { ...colour, displayName: opt };
        }
        return null;
      }).filter(Boolean);
    } else {
      return COLORBOND_COLOURS.map(c => ({ ...c, displayName: c.name }));
    }
  };

  // Helper function to get current selected colour for a building part
  const getCurrentColour = (partKey) => {
    let colour;
    switch (partKey) {
      case "roof": colour = roofColour || "Select"; break;
      case "cladding": colour = claddingColour || "Select"; break;
      case "baseboards": colour = baseboardsColour || "Select"; break;
      case "fasciaGutter": colour = fasciaGutterColour || "Select"; break;
      case "balustrade": colour = balustradeColour || "Select"; break;
      case "frontDoor": colour = frontDoorColour || "Select"; break;
      case "windowFrames": colour = windowFramesColour || "Select"; break;
      case "windowSurrounds": colour = windowSurroundsColour || "Select"; break;
      default: colour = "Select";
    }
    if (partKey === "windowFrames" && colour === "Black") {
      return "Night Sky";
    }
    return colour;
  };

  // Handler for when a colour is clicked
  const handleColourClick = async (colourName) => {
    const valueToSave = (selectedBuildingPart === "windowFrames" && colourName === "Night Sky") ? "Black" : colourName;
    
    switch (selectedBuildingPart) {
      case "roof":
        await handleRoofColourChange({ target: { value: valueToSave } });
        break;
      case "cladding":
        await handleCladdingColourChange({ target: { value: valueToSave } });
        break;
      case "baseboards":
        await handleBaseboardsColourChange({ target: { value: valueToSave } });
        break;
      case "fasciaGutter":
        await handleFasciaGutterColourChange({ target: { value: valueToSave } });
        break;
      case "balustrade":
        await handleBalustradeColourChange({ target: { value: valueToSave } });
        break;
      case "frontDoor":
        await handleFrontDoorColourChange({ target: { value: valueToSave } });
        break;
      case "windowFrames":
        await handleWindowFramesColourChange({ target: { value: valueToSave } });
        break;
      case "windowSurrounds":
        await handleWindowSurroundsColourChange({ target: { value: valueToSave } });
        break;
    }
  };

  // Helper to get hex color from RGB
  const getColourHex = (r, g, b) => {
    return `#${[r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('')}`;
  };

  // Wrapper functions for ThreeDVis component
  async function saveColoursFromProjectPage(roof, cladding, baseboards) {
    if (!projectId) return;
    
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/update-colours`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roof_colour: roof === "Select" ? null : roof,
          cladding_colour: cladding === "Select" ? null : cladding,
          baseboards_colour: baseboards === "Select" ? null : baseboards,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save colours");
      }
    } catch (error) {
      console.error("Error saving colours:", error);
    }
  }

  if (!project) {
    return (
      <div style={{ minHeight: "100vh", background: MONUMENT, display: "flex", alignItems: "center", justifyContent: "center", color: WHITE }}>
        {error || "Loading..."}
      </div>
    );
  }

  const availableColours = getAvailableColours(selectedBuildingPart);
  const currentColour = getCurrentColour(selectedBuildingPart);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: MONUMENT,
        display: "flex",
        flexDirection: "column",
        padding: "20px",
        color: WHITE,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <img
          src={logo}
          alt="SGF Central"
          style={{
            maxWidth: "200px",
            marginBottom: "16px",
          }}
        />
        <h1 style={{ fontSize: "1.8rem", marginBottom: "8px", color: WHITE }}>
          Select Your Colours
        </h1>
        {projectName && (
          <p style={{ fontSize: "1rem", marginBottom: "16px", color: "#ffffff99" }}>
            Project: {projectName}
          </p>
        )}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div
          style={{
            background: "#ff6b6b",
            color: WHITE,
            padding: "12px 20px",
            borderRadius: "8px",
            marginBottom: "20px",
            fontSize: "0.9rem",
            textAlign: "center",
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
            marginBottom: "20px",
            fontSize: "0.9rem",
            textAlign: "center",
          }}
        >
          Colours saved successfully!
        </div>
      )}

      {/* Main Content */}
      <div style={{ display: "flex", gap: "20px", flex: 1, minHeight: 0 }}>
        {/* Left Side - Colour Selector (1/3 of width) */}
        <div style={{ width: "30%", minWidth: "280px", display: "flex", flexDirection: "column" }}>
          <div style={{ background: "#42464d", borderRadius: "12px", padding: "24px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Roof Style */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "1rem", color: WHITE, fontWeight: 500 }}>
                Roof Style
              </label>
              <select
                value={roofStyle}
                onChange={handleRoofStyleChange}
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
                {ROOF_STYLE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            {/* Building Part Selector */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "1rem", color: WHITE, fontWeight: 500 }}>
                Building Part
              </label>
              <select
                value={selectedBuildingPart}
                onChange={(e) => setSelectedBuildingPart(e.target.value)}
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
                {BUILDING_PARTS.map((part) => (
                  <option key={part.key} value={part.key}>
                    {part.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Colour Grid */}
            <div style={{ flex: 1, overflowY: "auto", paddingRight: "8px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
                  gap: "12px",
                }}
              >
                {availableColours.map((colour, index) => {
                  const hex = getColourHex(colour.r, colour.g, colour.b);
                  const isSelected = colour.name === currentColour;
                  return (
                    <div
                      key={index}
                      onClick={() => handleColourClick(colour.name)}
                      style={{
                        cursor: "pointer",
                        padding: "12px",
                        borderRadius: "8px",
                        background: isSelected ? "#4D93D9" : "transparent",
                        border: isSelected ? "2px solid #4D93D9" : "1px solid #666",
                        transition: "all 0.2s",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "8px",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = "#999";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = "#666";
                        }
                      }}
                    >
                      <div
                        style={{
                          width: "50px",
                          height: "50px",
                          borderRadius: "4px",
                          backgroundColor: hex,
                          border: "1px solid #ccc",
                        }}
                      />
                      <div style={{ fontSize: "0.75rem", color: WHITE, textAlign: "center" }}>
                        {colour.displayName || colour.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - 3D Visualiser (2/3 of width, 1:1 aspect ratio) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, alignItems: "center", justifyContent: "center" }}>
          <div style={{ 
            background: "#42464d", 
            borderRadius: "12px", 
            padding: "16px", 
            width: "100%",
            maxWidth: "100%",
            display: "flex", 
            flexDirection: "column", 
            alignItems: "center",
            justifyContent: "center"
          }}>
            {/* 3D Visualiser - Maintain 1:1 aspect ratio */}
            <div style={{ 
              width: "100%", 
              aspectRatio: "1 / 1",
              position: "relative", 
              overflow: "hidden",
              borderRadius: "8px",
              maxWidth: "100%"
            }}>
              <style>{`
                .three-d-vis-portal-wrapper > div {
                  padding: 0 !important;
                }
                .three-d-vis-portal-wrapper > div > div:first-child > div:first-child {
                  display: none !important;
                }
                .three-d-vis-portal-wrapper > div > div:first-child > div:last-child > button {
                  display: none !important;
                }
                .three-d-vis-portal-wrapper > div > div:first-child > div:last-child {
                  width: 100% !important;
                  max-width: 100% !important;
                  height: 100% !important;
                  margin-top: 0 !important;
                }
                .three-d-vis-portal-wrapper > div > div:first-child > div:last-child > div {
                  width: 100% !important;
                  height: 100% !important;
                }
                .three-d-vis-portal-wrapper canvas {
                  width: 100% !important;
                  height: 100% !important;
                  display: block !important;
                }
              `}</style>
              <div className="three-d-vis-portal-wrapper" style={{ 
                position: "absolute", 
                top: 0, 
                left: 0, 
                width: "100%", 
                height: "100%"
              }}>
                <ThreeDVis
                  project={project}
                  onBack={null}
                  onUpdate={() => {}}
                  roofColour={roofColour}
                  claddingColour={claddingColour}
                  baseboardsColour={baseboardsColour}
                  setRoofColour={setRoofColour}
                  setCladdingColour={setCladdingColour}
                  setBaseboardsColour={setBaseboardsColour}
                  saveColoursFromProjectPage={saveColoursFromProjectPage}
                  roofStyle={roofStyle}
                  setRoofStyle={setRoofStyle}
                  handleRoofStyleChange={handleRoofStyleChange}
                  fasciaGutterColour={fasciaGutterColour}
                  setFasciaGutterColour={setFasciaGutterColour}
                  handleFasciaGutterColourChange={handleFasciaGutterColourChange}
                  balustradeColour={balustradeColour}
                  setBalustradeColour={setBalustradeColour}
                  handleBalustradeColourChange={handleBalustradeColourChange}
                  frontDoorColour={frontDoorColour}
                  setFrontDoorColour={setFrontDoorColour}
                  handleFrontDoorColourChange={handleFrontDoorColourChange}
                  windowFramesColour={windowFramesColour}
                  setWindowFramesColour={setWindowFramesColour}
                  handleWindowFramesColourChange={handleWindowFramesColourChange}
                  windowSurroundsColour={windowSurroundsColour}
                  setWindowSurroundsColour={setWindowSurroundsColour}
                  handleWindowSurroundsColourChange={handleWindowSurroundsColourChange}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
