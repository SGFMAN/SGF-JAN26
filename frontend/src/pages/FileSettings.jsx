import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const WHITE = "#fff";
const API_URL = "";

export default function FileSettings() {
  // VIC Settings
  const [rootDirectory, setRootDirectory] = useState("");
  const [createFolders, setCreateFolders] = useState(true);
  const [colourAttachmentsVic, setColourAttachmentsVic] = useState("");
  
  // QLD Settings
  const [rootDirectoryQld, setRootDirectoryQld] = useState("");
  const [createFoldersQld, setCreateFoldersQld] = useState(true);
  const [colourAttachmentsQld, setColourAttachmentsQld] = useState("");
  
  const [loading, setLoading] = useState(true);
  const valuesRef = useRef({ rootDirectory, createFolders, rootDirectoryQld, createFoldersQld, colourAttachmentsVic, colourAttachmentsQld });

  useEffect(() => {
    valuesRef.current = { rootDirectory, createFolders, rootDirectoryQld, createFoldersQld, colourAttachmentsVic, colourAttachmentsQld };
  }, [rootDirectory, createFolders, rootDirectoryQld, createFoldersQld, colourAttachmentsVic, colourAttachmentsQld]);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/settings`);
      if (!response.ok) {
        throw new Error("Failed to fetch settings");
      }
      const data = await response.json();
      setRootDirectory(data.root_directory || "");
      setCreateFolders(data.create_folders === "true" || data.create_folders === true);
      setRootDirectoryQld(data.root_directory_qld || "");
      setCreateFoldersQld(data.create_folders_qld === "true" || data.create_folders_qld === true);
      setColourAttachmentsVic(data.colour_attachments_vic || "");
      setColourAttachmentsQld(data.colour_attachments_qld || "");
    } catch (error) {
      console.error("Error fetching settings:", error);
      setRootDirectory("");
      setCreateFolders(true);
      setRootDirectoryQld("");
      setCreateFoldersQld(true);
      setColourAttachmentsVic("");
      setColourAttachmentsQld("");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    try {
      const payload = {
        root_directory: valuesRef.current.rootDirectory || null,
        create_folders: valuesRef.current.createFolders === true || valuesRef.current.createFolders === "true",
        root_directory_qld: valuesRef.current.rootDirectoryQld || null,
        create_folders_qld: valuesRef.current.createFoldersQld === true || valuesRef.current.createFoldersQld === "true",
        colour_attachments_vic: (valuesRef.current.colourAttachmentsVic || "").trim() || null,
        colour_attachments_qld: (valuesRef.current.colourAttachmentsQld || "").trim() || null,
      };
      console.log("Saving settings with payload:", payload);
      console.log("colour_attachments_vic value:", valuesRef.current.colourAttachmentsVic, "trimmed:", (valuesRef.current.colourAttachmentsVic || "").trim());
      const response = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Failed to save settings:", errorData.error || response.statusText);
        alert(`Failed to save settings: ${errorData.error || response.statusText}`);
      } else {
        const savedData = await response.json().catch(() => null);
        console.log("Successfully saved settings:", savedData);
        console.log("Saved colour_attachments_vic:", savedData?.colour_attachments_vic);
        console.log("Saved colour_attachments_qld:", savedData?.colour_attachments_qld);
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      alert(`Error saving settings: ${error.message}`);
    }
  }


  function handleRootDirectoryChange(e) {
    const newValue = e.target.value;
    setRootDirectory(newValue);
    valuesRef.current.rootDirectory = newValue;
  }

  // QLD handlers
  function handleRootDirectoryQldChange(e) {
    const newValue = e.target.value;
    setRootDirectoryQld(newValue);
    valuesRef.current.rootDirectoryQld = newValue;
  }


  function handleColourAttachmentsVicChange(e) {
    const newValue = e.target.value;
    setColourAttachmentsVic(newValue);
    valuesRef.current.colourAttachmentsVic = newValue;
  }

  function handleColourAttachmentsQldChange(e) {
    const newValue = e.target.value;
    setColourAttachmentsQld(newValue);
    valuesRef.current.colourAttachmentsQld = newValue;
  }

  async function handleColourAttachmentsVicBlur() {
    await saveSettings();
  }

  async function handleColourAttachmentsQldBlur() {
    await saveSettings();
  }

  async function handleCreateFoldersQldChange(e) {
    const newValue = e.target.checked;
    setCreateFoldersQld(newValue);
    valuesRef.current.createFoldersQld = newValue;
    try {
      const response = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root_directory: valuesRef.current.rootDirectory || null,
          create_folders: valuesRef.current.createFolders,
          root_directory_qld: valuesRef.current.rootDirectoryQld || null,
          create_folders_qld: newValue,
          colour_attachments_vic: (valuesRef.current.colourAttachmentsVic || "").trim() || null,
          colour_attachments_qld: (valuesRef.current.colourAttachmentsQld || "").trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Failed to save checkbox setting:", errorData.error || response.statusText);
        setCreateFoldersQld(!newValue);
        valuesRef.current.createFoldersQld = !newValue;
      }
    } catch (error) {
      console.error("Error saving checkbox setting:", error);
      setCreateFoldersQld(!newValue);
      valuesRef.current.createFoldersQld = !newValue;
    }
  }

  async function handleBlurQld() {
    await saveSettings();
  }


  async function handleCreateFoldersChange(e) {
    const newValue = e.target.checked;
    setCreateFolders(newValue);
    valuesRef.current.createFolders = newValue;
    try {
      const response = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root_directory: valuesRef.current.rootDirectory || null,
          create_folders: newValue,
          root_directory_qld: valuesRef.current.rootDirectoryQld || null,
          create_folders_qld: valuesRef.current.createFoldersQld === true || valuesRef.current.createFoldersQld === "true",
          colour_attachments_vic: (valuesRef.current.colourAttachmentsVic || "").trim() || null,
          colour_attachments_qld: (valuesRef.current.colourAttachmentsQld || "").trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Failed to save checkbox setting:", errorData.error || response.statusText);
        // Revert on error
        setCreateFolders(!newValue);
        valuesRef.current.createFolders = !newValue;
      } else {
        const savedData = await response.json().catch(() => null);
        console.log("Successfully saved checkbox setting:", savedData);
      }
    } catch (error) {
      console.error("Error saving checkbox setting:", error);
      // Revert on error
      setCreateFolders(!newValue);
      valuesRef.current.createFolders = !newValue;
    }
  }

  async function handleBlur() {
    await saveSettings();
  }


  if (loading) {
    return (
      <div style={{ color: MONUMENT }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", padding: "24px 32px", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      {/* 2 Column Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "24px", width: "100%" }}>
        {/* Column 1: VIC Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: 0, color: MONUMENT }}>
            VIC Settings
          </h2>
          
          {/* VIC File Settings */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "#4D93D9", padding: "16px", borderRadius: "8px" }}>
            <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
              File Settings
            </h3>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Root Directory
              </label>
              <input
                type="text"
                name="rootDirectory"
                value={rootDirectory}
                onChange={handleRootDirectoryChange}
                onBlur={handleBlur}
                placeholder="C:\Projects"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
              />
            </div>
          </div>
          
          {/* VIC Colour Attachments */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "#4D93D9", padding: "16px", borderRadius: "8px" }}>
            <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
              Colour Attachments
            </h3>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Location Path
              </label>
              <input
                type="text"
                name="colourAttachmentsVic"
                value={colourAttachmentsVic}
                onChange={handleColourAttachmentsVicChange}
                onBlur={handleColourAttachmentsVicBlur}
                placeholder="e.g. Z:\1.SGF PROJECT MANAGEMENT\COLOURS\VIC"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        {/* Column 2: QLD Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: 0, color: MONUMENT }}>
            QLD Settings
          </h2>
          
          {/* QLD File Settings */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "#D54358", padding: "16px", borderRadius: "8px" }}>
            <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
              File Settings
            </h3>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Root Directory
              </label>
              <input
                type="text"
                name="rootDirectoryQld"
                value={rootDirectoryQld}
                onChange={handleRootDirectoryQldChange}
                onBlur={handleBlurQld}
                placeholder="C:\Projects"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
              />
            </div>
          </div>
          
          {/* QLD Colour Attachments */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "#D54358", padding: "16px", borderRadius: "8px" }}>
            <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
              Colour Attachments
            </h3>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Location Path
              </label>
              <input
                type="text"
                name="colourAttachmentsQld"
                value={colourAttachmentsQld}
                onChange={handleColourAttachmentsQldChange}
                onBlur={handleColourAttachmentsQldBlur}
                placeholder="e.g. Z:\1.SGF PROJECT MANAGEMENT\COLOURS\QLD"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
                autoComplete="off"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
