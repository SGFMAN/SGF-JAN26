import React, { useState, useEffect } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

export default function NewProject_4_FoldersOption({ isOpen, onClose, formData, onFormDataChange, onBack, onYes, onNo }) {
  const [folderPath, setFolderPath] = useState("");
  const [rootDirectory, setRootDirectory] = useState("");
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (isOpen) {
      calculateFolderPath();
      // Reset creating state when modal opens
      setIsCreating(false);
      setProgress(0);
      setStatusMessage("");
    }
  }, [isOpen, formData]);

  async function calculateFolderPath() {
    setLoading(true);
    try {
      const settingsResponse = await fetch(`${API_URL}/api/settings`);
      if (!settingsResponse.ok) {
        throw new Error("Failed to fetch settings");
      }
      const settings = await settingsResponse.json();
      const state = (formData.state || "").toUpperCase();
      
      // Get root directory based on state
      let rootDir = "";
      if (state === "VIC") {
        rootDir = settings.root_directory || "";
      } else if (state === "QLD") {
        rootDir = settings.root_directory_qld || "";
      } else {
        rootDir = settings.root_directory || "";
      }
      
      setRootDirectory(rootDir);
      
      // Calculate folder path
      const currentYear = new Date().getFullYear().toString();
      const suburb = (formData.suburb || "").toUpperCase().replace(/[/\\]/g, "_");
      const street = (formData.street || "").replace(/[/\\]/g, "_");
      
      if (rootDir && state && suburb && street) {
        const path = `${rootDir}\\${currentYear}\\${state}\\${suburb} - ${street}`;
        setFolderPath(path);
      } else {
        setFolderPath("Path cannot be calculated - missing required information");
      }
    } catch (error) {
      console.error("Error calculating folder path:", error);
      setFolderPath("Error calculating path");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  async function handleYes() {
    if (!folderPath || folderPath.includes("cannot be calculated") || folderPath.includes("Error")) {
      alert("Cannot create folders: Invalid folder path. Please check your address information.");
      return;
    }

    setIsCreating(true);
    setProgress(0);
    setStatusMessage("Preparing to create folders...");

    try {
      // Get settings for root directory, year, and state
      const settingsResponse = await fetch(`${API_URL}/api/settings`);
      if (!settingsResponse.ok) {
        throw new Error("Failed to fetch settings");
      }
      const settings = await settingsResponse.json();
      const state = (formData.state || "").toUpperCase();
      const currentYear = new Date().getFullYear().toString();

      // Get root directory based on state
      let rootDir = "";
      if (state === "VIC") {
        rootDir = settings.root_directory || "";
      } else if (state === "QLD") {
        rootDir = settings.root_directory_qld || "";
      } else {
        rootDir = settings.root_directory || "";
      }

      if (!rootDir) {
        throw new Error("Root directory is not set. Please configure it in File Settings.");
      }

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev < 90) {
            return prev + 5;
          }
          return prev;
        });
      }, 200);

      setProgress(10);
      setStatusMessage("Creating folder structure...");

      // Create folders and copy template
      const folderResponse = await fetch(`${API_URL}/api/folders/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: folderPath,
          rootDirectory: rootDir,
          year: currentYear,
          state: state,
        }),
      });

      clearInterval(progressInterval);
      setProgress(95);
      setStatusMessage("Finalizing...");

      if (!folderResponse.ok) {
        const errorData = await folderResponse.json().catch(() => ({ error: "Failed to create folder" }));
        const errorMsg = errorData.error || "Failed to create project folder";
        throw new Error(errorMsg);
      }

      setProgress(100);
      setStatusMessage("Folders created successfully!");

      // Store folder path and createFolders flag in formData
      onFormDataChange({ 
        ...formData, 
        createFolders: true,
        folderPath: folderPath 
      });

      // Wait a moment to show completion, then proceed
      await new Promise(resolve => setTimeout(resolve, 500));

      if (onYes) {
        onYes();
      }
    } catch (error) {
      console.error("Error creating folders:", error);
      alert(error.message || "Failed to create project folders");
      setIsCreating(false);
      setProgress(0);
      setStatusMessage("");
    }
  }

  function handleNo() {
    onFormDataChange({ ...formData, createFolders: false });
    if (onNo) {
      onNo();
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          background: SECTION_GREY,
          borderRadius: "18px",
          padding: "32px",
          width: "90%",
          maxWidth: "600px",
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
          Create Project Folders?
        </h2>
        
        {!isCreating ? (
          <>
            <p
              style={{
                fontSize: "1rem",
                color: MONUMENT,
                marginBottom: "24px",
                lineHeight: "1.5",
              }}
            >
              Would you like to create project folders and copy the template structure?
            </p>

            {/* Folder Path Display */}
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Proposed Folder Location
              </label>
              <div
                style={{
                  background: WHITE,
                  padding: "12px",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  color: MONUMENT,
                  wordBreak: "break-all",
                  fontFamily: "monospace",
                  minHeight: "60px",
                  border: "1px solid #ddd",
                }}
              >
                {loading ? (
                  <span style={{ color: "#32323399" }}>Calculating path...</span>
                ) : (
                  folderPath || "Path information not available"
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Progress Section */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.9rem", color: MONUMENT, fontWeight: 500 }}>
                  {statusMessage || "Creating folders..."}
                </span>
                <span style={{ fontSize: "0.9rem", color: MONUMENT, fontWeight: 500 }}>
                  {progress}%
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: "24px",
                  background: WHITE,
                  borderRadius: "12px",
                  overflow: "hidden",
                  border: "1px solid #ddd",
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: MONUMENT,
                    transition: "width 0.3s ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {progress > 15 && (
                    <span style={{ color: WHITE, fontSize: "0.75rem", fontWeight: 500 }}>
                      {progress}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}


        {!isCreating && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <button
              type="button"
              onClick={onBack}
              style={{
                background: "#e0e0e0",
                color: MONUMENT,
                border: "none",
                borderRadius: "10px",
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.17s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#d0d0d0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#e0e0e0";
              }}
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleNo}
              style={{
                background: "#e0e0e0",
                color: MONUMENT,
                border: "none",
                borderRadius: "10px",
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.17s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#d0d0d0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#e0e0e0";
              }}
            >
              No
            </button>
            <button
              type="button"
              onClick={handleYes}
              disabled={loading || !folderPath || folderPath.includes("cannot be calculated") || folderPath.includes("Error")}
              style={{
                background: (loading || !folderPath || folderPath.includes("cannot be calculated") || folderPath.includes("Error")) ? "#ccc" : MONUMENT,
                color: WHITE,
                border: "none",
                borderRadius: "10px",
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: (loading || !folderPath || folderPath.includes("cannot be calculated") || folderPath.includes("Error")) ? "not-allowed" : "pointer",
                transition: "background 0.17s",
              }}
              onMouseEnter={(e) => {
                if (!(loading || !folderPath || folderPath.includes("cannot be calculated") || folderPath.includes("Error"))) {
                  e.currentTarget.style.background = "#1a1a1b";
                }
              }}
              onMouseLeave={(e) => {
                if (!(loading || !folderPath || folderPath.includes("cannot be calculated") || folderPath.includes("Error"))) {
                  e.currentTarget.style.background = MONUMENT;
                }
              }}
            >
              Yes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
