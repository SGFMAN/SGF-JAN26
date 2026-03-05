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
        height: "100vh",
        width: "100vw",
        background: MONUMENT,
        display: "flex",
        flexDirection: "column",
        padding: "16px 24px",
        color: WHITE,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexShrink: 0, position: "relative" }}>
        {/* Logo - Top Left */}
        <div style={{ flex: "0 0 auto" }}>
          <img
            src={logo}
            alt="SGF Central"
            style={{
              maxWidth: "150px",
              height: "auto",
            }}
          />
        </div>
        
        {/* Heading - Top Center */}
        <div style={{ 
          position: "absolute", 
          left: "50%", 
          transform: "translateX(-50%)",
          textAlign: "center"
        }}>
          <h1 style={{ fontSize: "1.8rem", margin: 0, color: WHITE }}>
            Select Your Colours
          </h1>
          {projectName && (
            <p style={{ fontSize: "1rem", margin: "4px 0 0 0", color: "#ffffff99" }}>
              Project: {projectName}
            </p>
          )}
        </div>
        
        {/* Spacer to balance layout */}
        <div style={{ flex: "0 0 auto", width: "150px" }}></div>
      </div>

      {/* Error/Success Messages */}
      {(error || isSaved) && (
        <div style={{ flexShrink: 0, marginBottom: "12px" }}>
          {error && (
            <div
              style={{
                background: "#ff6b6b",
                color: WHITE,
                padding: "12px 20px",
                borderRadius: "8px",
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
                fontSize: "0.9rem",
                textAlign: "center",
              }}
            >
              Colours saved successfully!
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <div style={{ display: "flex", gap: "24px", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Left Side - Colour Selector (25% of width) */}
        <div style={{ width: "25%", minWidth: "300px", display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ 
            background: WHITE, 
            borderRadius: "8px", 
            padding: "24px", 
            height: "100%", 
            display: "flex", 
            flexDirection: "column", 
            overflow: "hidden"
          }}>
            {/* Roof Style */}
            <div style={{ marginBottom: "12px", flexShrink: 0 }}>
              <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "4px", fontWeight: "500" }}>
                Roof Style
              </div>
              <select
                value={roofStyle}
                onChange={handleRoofStyleChange}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "0.9rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: "pointer",
                  border: "1px solid #ddd",
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
            <div style={{ marginBottom: "12px", flexShrink: 0 }}>
              <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "4px", fontWeight: "500" }}>
                Building Part
              </div>
              <select
                value={selectedBuildingPart}
                onChange={(e) => setSelectedBuildingPart(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "0.9rem",
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

            {/* Colour Grid - Scrollable */}
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: "8px",
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
                        padding: "8px",
                        borderRadius: "8px",
                        backgroundColor: isSelected ? "#f0f0f0" : "transparent",
                        border: isSelected ? "2px solid #ff0000" : "1px solid #ddd",
                        transition: "all 0.2s",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = "#f9f9f9";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }
                      }}
                    >
                      <div
                        style={{
                          width: "60px",
                          height: "60px",
                          borderRadius: "4px",
                          backgroundColor: hex,
                          border: "1px solid #ccc",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ fontSize: "0.85rem", fontWeight: 500, color: MONUMENT, textAlign: "center" }}>
                        {colour.displayName || colour.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - 3D Visualiser (75% of width) */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ 
            padding: "24px", 
            height: "100%", 
            display: "flex", 
            flexDirection: "column", 
            overflow: "hidden"
          }}>
            <div style={{ display: "flex", gap: "24px", flex: 1, minHeight: 0 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div style={{ flex: 1, display: "flex", gap: "12px", alignItems: "flex-start", minHeight: 0 }}>
                  <div style={{ height: "100%", width: "100%", overflow: "hidden" }}>
                    <style>{`
                      .three-d-vis-portal-wrapper {
                        height: 100% !important;
                        width: 100% !important;
                      }
                      .three-d-vis-portal-wrapper > div {
                        padding: 0 !important;
                        height: 100% !important;
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
                      height: "100%", 
                      width: "100%"
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
        </div>
      </div>
    </div>
  );
}
