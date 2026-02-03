import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

// Generate width options from 1200 to 3500 in 100mm increments
const WIDTH_OPTIONS = Array.from({ length: 24 }, (_, i) => String(1200 + i * 100));

const DESIGN_OPTIONS = ["Panel - Left", "Panel - Right", "Wall to Wall"];
const DRAWS_OPTIONS = ["Yes", "No"];
const CEILING_HEIGHT_OPTIONS = ["2400", "2550", "2700"];
const NUMBER_OF_DOORS_OPTIONS = ["1", "2", "3", "4"];
const DOOR_OPTIONS = ["Super White", "Opal", "Mirror", "Flat White"];

export default function Robes({ project, onUpdate }) {
  const fileInputRef = useRef(null);
  const coloursFileInputRef = useRef(null);
  const [numberOfRobes, setNumberOfRobes] = useState(project?.number_of_robes || "");
  const [robeData, setRobeData] = useState(() => {
    if (project?.robe_widths) {
      try {
        const parsed = JSON.parse(project.robe_widths);
        // Check if it's the new format (array of objects) or old format (array of strings)
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (typeof parsed[0] === "object" && parsed[0] !== null) {
            // New format: array of objects
            return parsed;
          } else {
            // Old format: array of strings (widths only), convert to new format
            return parsed.map((width) => ({
              width: width || "",
              design: "",
              draws: "",
              ceiling_height: "",
              number_of_doors: "",
            }));
          }
        }
        return [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const valuesRef = useRef({ numberOfRobes, robeData });

  useEffect(() => {
    valuesRef.current = { numberOfRobes, robeData };
  }, [numberOfRobes, robeData]);

  useEffect(() => {
    if (project) {
      const newNumberOfRobes = project.number_of_robes || "";
      const newRobeData = project.robe_widths
        ? (() => {
            try {
              const parsed = JSON.parse(project.robe_widths);
              if (Array.isArray(parsed) && parsed.length > 0) {
                if (typeof parsed[0] === "object" && parsed[0] !== null) {
                  return parsed;
                } else {
                  // Convert old format to new
                  return parsed.map((width) => ({
                    width: width || "",
                    design: "",
                    draws: "",
                    ceiling_height: "",
                    number_of_doors: "",
                    doors: [],
                  }));
                }
              }
              return [];
            } catch {
              return [];
            }
          })()
        : [];
      
      // Only update if the values actually changed from the server
      if (newNumberOfRobes !== numberOfRobes || JSON.stringify(newRobeData) !== JSON.stringify(robeData)) {
        setNumberOfRobes(newNumberOfRobes);
        setRobeData(newRobeData);
      }
    }
  }, [project]);

  async function saveField(fieldName, value) {
    if (!project?.id) {
      console.error("Cannot save: no project ID");
      return;
    }
    const currentValues = valuesRef.current;
    const projectName = project?.street && project?.suburb 
      ? `${project.street}, ${project.suburb}`.trim() 
      : project?.name || "";
    try {
      const updateData = {
        name: projectName,
        status: project?.status || "",
        stream: project?.stream || null,
        suburb: project?.suburb || null,
        street: project?.street || null,
        state: project?.state || null,
        deposit: project?.deposit || null,
        project_cost: project?.project_cost || null,
        client_name: project?.client_name || null,
        email: project?.email || null,
        phone: project?.phone || null,
        number_of_robes: fieldName === "number_of_robes" ? (value === "" ? null : value) : currentValues.numberOfRobes,
        robe_widths: fieldName === "robe_widths" ? (value === null ? null : JSON.stringify(value)) : (currentValues.robeData.length > 0 ? JSON.stringify(currentValues.robeData) : null),
      };
      
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Error saving field - Status:", response.status, "Error:", errorText);
      } else {
        const savedData = await response.json().catch(() => null);
        console.log("Successfully saved:", savedData);
        if (onUpdate) {
          onUpdate();
        }
      }
    } catch (error) {
      console.error("Error saving field:", error);
    }
  }

  function handleNumberOfRobesChange(e) {
    const newValue = e.target.value;
    const num = parseInt(newValue) || 0;
    
    // Update local state immediately
    setNumberOfRobes(newValue);
    
    // Adjust robeData array to match new number
    const currentData = [...robeData];
    const newData = [...currentData];
    
    // Extend or shrink array to match new number
    while (newData.length < num) {
      newData.push({
        width: "",
        design: "",
        draws: "",
        ceiling_height: "",
        number_of_doors: "",
        doors: [],
      });
    }
    while (newData.length > num) {
      newData.pop();
    }
    
    setRobeData(newData);
    
    // Save both fields
    saveField("number_of_robes", newValue);
    if (newData.length > 0) {
      // Use a small delay to ensure state is updated
      setTimeout(() => {
        saveField("robe_widths", newData);
      }, 100);
    }
  }

  function handleRobeFieldChange(robeIndex, fieldName, value) {
    const newData = [...robeData];
    if (!newData[robeIndex]) {
      newData[robeIndex] = {
        width: "",
        design: "",
        draws: "",
        ceiling_height: "",
        number_of_doors: "",
        doors: [],
      };
    }
    
    // If number_of_doors changed, adjust the doors array
    if (fieldName === "number_of_doors") {
      const numDoors = parseInt(value) || 0;
      const currentDoors = newData[robeIndex].doors || [];
      const newDoors = [...currentDoors];
      
      // Extend or shrink doors array
      while (newDoors.length < numDoors) {
        newDoors.push("");
      }
      while (newDoors.length > numDoors) {
        newDoors.pop();
      }
      
      newData[robeIndex] = {
        ...newData[robeIndex],
        [fieldName]: value,
        doors: newDoors,
      };
    } else {
      newData[robeIndex] = {
        ...newData[robeIndex],
        [fieldName]: value,
      };
    }
    
    setRobeData(newData);
    saveField("robe_widths", newData);
  }

  function handleDoorChange(robeIndex, doorIndex, value) {
    const newData = [...robeData];
    if (!newData[robeIndex]) {
      newData[robeIndex] = {
        width: "",
        design: "",
        draws: "",
        ceiling_height: "",
        number_of_doors: "",
        doors: [],
      };
    }
    const doors = [...(newData[robeIndex].doors || [])];
    doors[doorIndex] = value;
    newData[robeIndex] = {
      ...newData[robeIndex],
      doors: doors,
    };
    setRobeData(newData);
    saveField("robe_widths", newData);
  }

  const numRobes = parseInt(numberOfRobes) || 0;

  function handleEmailClick() {
    const projectName = project?.street && project?.suburb 
      ? `${project.street}, ${project.suburb}`.trim() 
      : project?.name || "Unknown Project";
    
    // Build the body with all robe details
    let body = `${projectName} - Number of robes: ${numRobes}\n`;
    body += `------------------------------------------------\n`;
    
    // Include all robes up to numRobes, even if they have no data
    for (let index = 0; index < numRobes; index++) {
      const robe = robeData[index] || {
        width: "",
        design: "",
        draws: "",
        ceiling_height: "",
        doors: [],
      };
      
      const parts = [];
      parts.push(`Robe ${index + 1}`);
      
      if (robe.width) {
        parts.push(`Door width: ${robe.width}mm`);
      }
      if (robe.design) {
        parts.push(robe.design);
      }
      if (robe.draws) {
        parts.push(`Draws: ${robe.draws}`);
      }
      if (robe.ceiling_height) {
        parts.push(`Ceiling: ${robe.ceiling_height}mm`);
      }
      
      // Add doors
      if (robe.doors && robe.doors.length > 0) {
        robe.doors.forEach((door, doorIndex) => {
          if (door) {
            parts.push(`Door ${doorIndex + 1} - ${door}`);
          }
        });
      }
      
      body += parts.join(" | ") + `\n`;
    }
    
    const mailtoLink = `mailto:ben@superiorgrannyflats.com.au?subject=Robe Order&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoLink;
  }

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        position: "relative",
        minHeight: "100%",
      }}
    >
      <h2 style={{ fontSize: "1.5rem", fontWeight: 600, color: MONUMENT, margin: 0 }}>
        Robes
      </h2>

      {/* 6 Column Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: "16px",
          width: "100%",
          position: "relative",
        }}
      >
        {/* Column 1: Number of Robes */}
        <div
          style={{
            position: "relative",
            paddingRight: numRobes > 0 ? "16px" : "0",
            paddingTop: "40px",
          }}
        >
          {numRobes > 0 && (
            <div
              style={{
                position: "absolute",
                right: "0",
                top: "0",
                bottom: "0",
                width: "2px",
                background: MONUMENT,
              }}
            />
          )}
          <label
            style={{
              display: "block",
              fontSize: "0.9rem",
              color: "#32323399",
              marginBottom: "6px",
              fontWeight: 500,
            }}
          >
            Number of Robes
          </label>
          <select
            value={numberOfRobes}
            onChange={handleNumberOfRobesChange}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: "8px",
              border: `2px solid ${MONUMENT}`,
              fontSize: "1rem",
              color: MONUMENT,
              background: WHITE,
              boxSizing: "border-box",
              cursor: "pointer",
              outline: "none",
            }}
          >
            <option value="">Select...</option>
            {[1, 2, 3, 4, 5].map((num) => (
              <option key={num} value={num}>
                {num}
              </option>
            ))}
          </select>

          {/* Buttons in Column 1 */}
          <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Add to List Button */}
            <button
              onClick={() => {
                // TODO: Implement add to list functionality
                console.log("Add to List clicked");
              }}
              style={{
                width: "100%",
                padding: "12px 24px",
                fontSize: "1rem",
                fontWeight: 600,
                color: WHITE,
                background: MONUMENT,
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "background 0.2s",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
              onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
            >
              Add to List
            </button>

            {/* Email List Button */}
            <button
              onClick={handleEmailClick}
              style={{
                width: "100%",
                padding: "12px 24px",
                fontSize: "1rem",
                fontWeight: 600,
                color: WHITE,
                background: MONUMENT,
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "background 0.2s",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#1a1a1a")}
              onMouseLeave={(e) => (e.currentTarget.style.background = MONUMENT)}
            >
              Email List
            </button>
          </div>
        </div>

        {/* Columns 2-6: Robe columns with headings and fields */}
        {Array.from({ length: 5 }, (_, i) => i).map((colIndex) => {
          const robeIndex = colIndex;
          const showRobe = robeIndex < numRobes;
          const robe = robeData[robeIndex] || {
            width: "",
            design: "",
            draws: "",
            ceiling_height: "",
            number_of_doors: "",
            doors: [],
          };
          const numDoors = parseInt(robe.number_of_doors) || 0;
          const isCustomWidth = robe.width && !WIDTH_OPTIONS.includes(robe.width);
          // Show divider if this robe is shown and there are more robes after it
          const showDivider = showRobe && robeIndex < numRobes - 1;
          
          return (
            <div
              key={colIndex}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                position: "relative",
                paddingRight: showDivider ? "16px" : "0",
              }}
            >
              {showDivider && (
                <div
                  style={{
                    position: "absolute",
                    right: "0",
                    top: "0",
                    bottom: "0",
                    width: "2px",
                    background: MONUMENT,
                  }}
                />
              )}
              {showRobe ? (
                <>
                  {/* Robe Heading */}
                  <h3
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: MONUMENT,
                      margin: 0,
                      paddingBottom: "4px",
                    }}
                  >
                    Robe {robeIndex + 1}
                  </h3>
                  
                  {/* Width Input with Dropdown */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.85rem",
                        color: "#32323399",
                        marginBottom: "6px",
                        fontWeight: 500,
                      }}
                    >
                      Width
                    </label>
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                      <div style={{ position: "relative", flex: "1 1 0", minWidth: 0 }}>
                        <select
                          value={isCustomWidth ? "custom" : robe.width}
                          onChange={(e) => {
                            if (e.target.value === "custom") {
                              handleRobeFieldChange(robeIndex, "width", "");
                            } else {
                              handleRobeFieldChange(robeIndex, "width", e.target.value);
                            }
                          }}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            paddingRight: "40px",
                            borderRadius: "8px",
                            border: `2px solid ${MONUMENT}`,
                            fontSize: "0.9rem",
                            color: MONUMENT,
                            background: WHITE,
                            boxSizing: "border-box",
                            cursor: "pointer",
                            outline: "none",
                            appearance: "none",
                            WebkitAppearance: "none",
                            MozAppearance: "none",
                          }}
                        >
                          <option value="">Select...</option>
                          {WIDTH_OPTIONS.map((widthOption) => (
                            <option key={widthOption} value={widthOption}>
                              {widthOption}mm
                            </option>
                          ))}
                          <option value="custom">Custom...</option>
                        </select>
                        <div
                          style={{
                            position: "absolute",
                            right: "12px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            pointerEvents: "none",
                            color: MONUMENT,
                            fontSize: "0.8rem",
                          }}
                        >
                          ▼
                        </div>
                      </div>
                      {(isCustomWidth || robe.width === "") && (
                        <input
                          type="text"
                          value={robe.width}
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^0-9]/g, "");
                            handleRobeFieldChange(robeIndex, "width", value);
                          }}
                          placeholder="Custom"
                          style={{
                            flex: "1 1 0",
                            minWidth: "80px",
                            padding: "12px 12px",
                            borderRadius: "8px",
                            border: `2px solid ${MONUMENT}`,
                            fontSize: "0.9rem",
                            color: MONUMENT,
                            background: WHITE,
                            boxSizing: "border-box",
                            outline: "none",
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Design and Draws on same line */}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{ flex: "1 1 0", minWidth: 0 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          color: "#32323399",
                          marginBottom: "6px",
                          fontWeight: 500,
                        }}
                      >
                        Design
                      </label>
                      <select
                        value={robe.design}
                        onChange={(e) => handleRobeFieldChange(robeIndex, "design", e.target.value)}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          borderRadius: "8px",
                          border: `2px solid ${MONUMENT}`,
                          fontSize: "0.9rem",
                          color: MONUMENT,
                          background: WHITE,
                          boxSizing: "border-box",
                          cursor: "pointer",
                          outline: "none",
                          appearance: "none",
                          WebkitAppearance: "none",
                          MozAppearance: "none",
                        }}
                      >
                        <option value="">Select...</option>
                        {DESIGN_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: "1 1 0", minWidth: 0 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          color: "#32323399",
                          marginBottom: "6px",
                          fontWeight: 500,
                        }}
                      >
                        Draws
                      </label>
                      <select
                        value={robe.draws}
                        onChange={(e) => handleRobeFieldChange(robeIndex, "draws", e.target.value)}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          borderRadius: "8px",
                          border: `2px solid ${MONUMENT}`,
                          fontSize: "0.9rem",
                          color: MONUMENT,
                          background: WHITE,
                          boxSizing: "border-box",
                          cursor: "pointer",
                          outline: "none",
                          appearance: "none",
                          WebkitAppearance: "none",
                          MozAppearance: "none",
                        }}
                      >
                        <option value="">Select...</option>
                        {DRAWS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Ceiling Height Dropdown with Custom Input */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.85rem",
                        color: "#32323399",
                        marginBottom: "6px",
                        fontWeight: 500,
                      }}
                    >
                      Ceiling Height
                    </label>
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                      <div style={{ position: "relative", flex: "1 1 0", minWidth: 0 }}>
                        <select
                          value={CEILING_HEIGHT_OPTIONS.includes(robe.ceiling_height) ? robe.ceiling_height : "custom"}
                          onChange={(e) => {
                            if (e.target.value === "custom") {
                              handleRobeFieldChange(robeIndex, "ceiling_height", "");
                            } else {
                              handleRobeFieldChange(robeIndex, "ceiling_height", e.target.value);
                            }
                          }}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            paddingRight: "40px",
                            borderRadius: "8px",
                            border: `2px solid ${MONUMENT}`,
                            fontSize: "0.9rem",
                            color: MONUMENT,
                            background: WHITE,
                            boxSizing: "border-box",
                            cursor: "pointer",
                            outline: "none",
                            appearance: "none",
                            WebkitAppearance: "none",
                            MozAppearance: "none",
                          }}
                        >
                          <option value="">Select...</option>
                          {CEILING_HEIGHT_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}mm
                            </option>
                          ))}
                          <option value="custom">Custom...</option>
                        </select>
                        <div
                          style={{
                            position: "absolute",
                            right: "12px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            pointerEvents: "none",
                            color: MONUMENT,
                            fontSize: "0.8rem",
                          }}
                        >
                          ▼
                        </div>
                      </div>
                      {(!CEILING_HEIGHT_OPTIONS.includes(robe.ceiling_height) || robe.ceiling_height === "") && (
                        <input
                          type="text"
                          value={robe.ceiling_height}
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^0-9]/g, "");
                            handleRobeFieldChange(robeIndex, "ceiling_height", value);
                          }}
                          placeholder="Custom"
                          style={{
                            flex: "1 1 0",
                            minWidth: "80px",
                            padding: "12px 12px",
                            borderRadius: "8px",
                            border: `2px solid ${MONUMENT}`,
                            fontSize: "0.9rem",
                            color: MONUMENT,
                            background: WHITE,
                            boxSizing: "border-box",
                            outline: "none",
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Number of Doors Dropdown */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.85rem",
                        color: "#32323399",
                        marginBottom: "6px",
                        fontWeight: 500,
                      }}
                    >
                      Number of Doors
                    </label>
                    <select
                      value={robe.number_of_doors}
                      onChange={(e) => handleRobeFieldChange(robeIndex, "number_of_doors", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        borderRadius: "8px",
                        border: `2px solid ${MONUMENT}`,
                        fontSize: "0.9rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                        cursor: "pointer",
                        outline: "none",
                        appearance: "none",
                        WebkitAppearance: "none",
                        MozAppearance: "none",
                      }}
                    >
                      <option value="">Select...</option>
                      {NUMBER_OF_DOORS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Door Dropdowns - Door 1 and 3 always half width */}
                  {numDoors > 0 && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <div style={{ flex: "1 1 0", minWidth: 0 }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.85rem",
                            color: "#32323399",
                            marginBottom: "6px",
                            fontWeight: 500,
                          }}
                        >
                          Door 1
                        </label>
                        <select
                          value={robe.doors?.[0] || ""}
                          onChange={(e) => handleDoorChange(robeIndex, 0, e.target.value)}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "8px",
                            border: `2px solid ${MONUMENT}`,
                            fontSize: "0.9rem",
                            color: MONUMENT,
                            background: WHITE,
                            boxSizing: "border-box",
                            cursor: "pointer",
                            outline: "none",
                            appearance: "none",
                            WebkitAppearance: "none",
                            MozAppearance: "none",
                          }}
                        >
                          <option value="">Select...</option>
                          {DOOR_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      {numDoors > 1 && (
                        <div style={{ flex: "1 1 0", minWidth: 0 }}>
                          <label
                            style={{
                              display: "block",
                              fontSize: "0.85rem",
                              color: "#32323399",
                              marginBottom: "6px",
                              fontWeight: 500,
                            }}
                          >
                            Door 2
                          </label>
                          <select
                            value={robe.doors?.[1] || ""}
                            onChange={(e) => handleDoorChange(robeIndex, 1, e.target.value)}
                            style={{
                              width: "100%",
                              padding: "12px 16px",
                              borderRadius: "8px",
                              border: `2px solid ${MONUMENT}`,
                              fontSize: "0.9rem",
                              color: MONUMENT,
                              background: WHITE,
                              boxSizing: "border-box",
                              cursor: "pointer",
                              outline: "none",
                              appearance: "none",
                              WebkitAppearance: "none",
                              MozAppearance: "none",
                            }}
                          >
                            <option value="">Select...</option>
                            {DOOR_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                  {numDoors > 2 && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <div style={{ flex: "1 1 0", minWidth: 0 }}>
                        <label
                          style={{
                            display: "block",
                            fontSize: "0.85rem",
                            color: "#32323399",
                            marginBottom: "6px",
                            fontWeight: 500,
                          }}
                        >
                          Door 3
                        </label>
                        <select
                          value={robe.doors?.[2] || ""}
                          onChange={(e) => handleDoorChange(robeIndex, 2, e.target.value)}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "8px",
                            border: `2px solid ${MONUMENT}`,
                            fontSize: "0.9rem",
                            color: MONUMENT,
                            background: WHITE,
                            boxSizing: "border-box",
                            cursor: "pointer",
                            outline: "none",
                            appearance: "none",
                            WebkitAppearance: "none",
                            MozAppearance: "none",
                          }}
                        >
                          <option value="">Select...</option>
                          {DOOR_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      {numDoors > 3 && (
                        <div style={{ flex: "1 1 0", minWidth: 0 }}>
                          <label
                            style={{
                              display: "block",
                              fontSize: "0.85rem",
                              color: "#32323399",
                              marginBottom: "6px",
                              fontWeight: 500,
                            }}
                          >
                            Door 4
                          </label>
                          <select
                            value={robe.doors?.[3] || ""}
                            onChange={(e) => handleDoorChange(robeIndex, 3, e.target.value)}
                            style={{
                              width: "100%",
                              padding: "12px 16px",
                              borderRadius: "8px",
                              border: `2px solid ${MONUMENT}`,
                              fontSize: "0.9rem",
                              color: MONUMENT,
                              background: WHITE,
                              boxSizing: "border-box",
                              cursor: "pointer",
                              outline: "none",
                              appearance: "none",
                              WebkitAppearance: "none",
                              MozAppearance: "none",
                            }}
                          >
                            <option value="">Select...</option>
                            {DOOR_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div /> // Empty space for alignment
              )}
            </div>
          );
        })}
      </div>

      {/* Hidden file input for robe plan PDF */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf"
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || !project?.id) return;

          const formData = new FormData();
          formData.append("file", file);
          formData.append("projectId", project.id.toString());

          try {
            const response = await fetch(`${API_URL}/api/files/locate-robe-plan`, {
              method: "POST",
              body: formData,
            });

            if (response.ok) {
              const result = await response.json();
              console.log("Robe plan PDF saved:", result);
              if (onUpdate) {
                onUpdate();
              }
              // Open the PDF after saving
              const pdfUrl = `${API_URL}/api/files/robe-plan/${project.id}`;
              window.open(pdfUrl, "_blank");
            } else {
              const errorText = await response.text().catch(() => response.statusText);
              console.error("Error saving robe plan PDF:", errorText);
              alert("Error saving robe plan PDF: " + errorText);
            }
          } catch (error) {
            console.error("Error uploading robe plan PDF:", error);
            alert("Error uploading robe plan PDF: " + error.message);
          }

          // Reset input
          e.target.value = "";
        }}
      />

      {/* Hidden file input for robe colours PDF */}
      <input
        type="file"
        ref={coloursFileInputRef}
        accept=".pdf"
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || !project?.id) return;

          const formData = new FormData();
          formData.append("file", file);
          formData.append("projectId", project.id.toString());

          try {
            const response = await fetch(`${API_URL}/api/files/locate-robe-colours`, {
              method: "POST",
              body: formData,
            });

            if (response.ok) {
              const result = await response.json();
              console.log("Robe colours PDF saved:", result);
              if (onUpdate) {
                onUpdate();
              }
              // Open the PDF after saving
              const pdfUrl = `${API_URL}/api/files/robe-colours/${project.id}`;
              window.open(pdfUrl, "_blank");
            } else {
              const errorText = await response.text().catch(() => response.statusText);
              console.error("Error saving robe colours PDF:", errorText);
              alert("Error saving robe colours PDF: " + errorText);
            }
          } catch (error) {
            console.error("Error uploading robe colours PDF:", error);
            alert("Error uploading robe colours PDF: " + error.message);
          }

          // Reset input
          e.target.value = "";
        }}
      />

    </div>
  );
}
