import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

export default function FileSettings() {
  // VIC Settings
  const [rootDirectory, setRootDirectory] = useState("");
  const [createFolders, setCreateFolders] = useState(true);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpUserSecondary, setSmtpUserSecondary] = useState("");
  const [smtpPassSecondary, setSmtpPassSecondary] = useState("");
  const [testProjectName, setTestProjectName] = useState("");
  const [colourAttachmentsVic, setColourAttachmentsVic] = useState("");
  
  // QLD Settings
  const [rootDirectoryQld, setRootDirectoryQld] = useState("");
  const [createFoldersQld, setCreateFoldersQld] = useState(true);
  const [smtpUserQld, setSmtpUserQld] = useState("");
  const [smtpPassQld, setSmtpPassQld] = useState("");
  const [testProjectNameQld, setTestProjectNameQld] = useState("");
  const [colourAttachmentsQld, setColourAttachmentsQld] = useState("");
  
  const [isCreatingTestFolder, setIsCreatingTestFolder] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingFolderPath, setPendingFolderPath] = useState("");
  const [pendingState, setPendingState] = useState("VIC"); // Track which state (VIC/QLD) for test folder
  const [loading, setLoading] = useState(true);
  const valuesRef = useRef({ rootDirectory, createFolders, smtpUser, smtpPass, smtpUserSecondary, smtpPassSecondary, rootDirectoryQld, createFoldersQld, smtpUserQld, smtpPassQld, colourAttachmentsVic, colourAttachmentsQld });

  useEffect(() => {
    valuesRef.current = { rootDirectory, createFolders, smtpUser, smtpPass, smtpUserSecondary, smtpPassSecondary, rootDirectoryQld, createFoldersQld, smtpUserQld, smtpPassQld, colourAttachmentsVic, colourAttachmentsQld };
  }, [rootDirectory, createFolders, smtpUser, smtpPass, smtpUserSecondary, smtpPassSecondary, rootDirectoryQld, createFoldersQld, smtpUserQld, smtpPassQld, colourAttachmentsVic, colourAttachmentsQld]);

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
      setSmtpUser(data.smtp_user || "");
      setSmtpPass(data.smtp_pass || "");
      setSmtpUserSecondary(data.smtp_user_secondary || "");
      setSmtpPassSecondary(data.smtp_pass_secondary || "");
      setRootDirectoryQld(data.root_directory_qld || "");
      setCreateFoldersQld(data.create_folders_qld === "true" || data.create_folders_qld === true);
      setSmtpUserQld(data.smtp_user_qld || "");
      setSmtpPassQld(data.smtp_pass_qld || "");
      setColourAttachmentsVic(data.colour_attachments_vic || "");
      setColourAttachmentsQld(data.colour_attachments_qld || "");
    } catch (error) {
      console.error("Error fetching settings:", error);
      setRootDirectory("");
      setCreateFolders(true);
      setSmtpUser("");
      setSmtpPass("");
      setSmtpUserSecondary("");
      setSmtpPassSecondary("");
      setRootDirectoryQld("");
      setCreateFoldersQld(true);
      setSmtpUserQld("");
      setSmtpPassQld("");
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
        smtp_user: (valuesRef.current.smtpUser || "").trim() || null,
        smtp_pass: valuesRef.current.smtpPass || null,
        smtp_user_secondary: (valuesRef.current.smtpUserSecondary || "").trim() || null,
        smtp_pass_secondary: valuesRef.current.smtpPassSecondary || null,
        root_directory_qld: valuesRef.current.rootDirectoryQld || null,
        create_folders_qld: valuesRef.current.createFoldersQld === true || valuesRef.current.createFoldersQld === "true",
        smtp_user_qld: (valuesRef.current.smtpUserQld || "").trim() || null,
        smtp_pass_qld: valuesRef.current.smtpPassQld || null,
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

  async function saveSmtpSettings() {
    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root_directory: valuesRef.current.rootDirectory || null,
          create_folders: valuesRef.current.createFolders === true || valuesRef.current.createFolders === "true",
          smtp_user: (valuesRef.current.smtpUser || "").trim() || null,
          smtp_pass: valuesRef.current.smtpPass || null,
          smtp_user_secondary: (valuesRef.current.smtpUserSecondary || "").trim() || null,
          smtp_pass_secondary: valuesRef.current.smtpPassSecondary || null,
          root_directory_qld: valuesRef.current.rootDirectoryQld || null,
          create_folders_qld: valuesRef.current.createFoldersQld === true || valuesRef.current.createFoldersQld === "true",
          smtp_user_qld: (valuesRef.current.smtpUserQld || "").trim() || null,
          smtp_pass_qld: valuesRef.current.smtpPassQld || null,
          colour_attachments_vic: (valuesRef.current.colourAttachmentsVic || "").trim() || null,
          colour_attachments_qld: (valuesRef.current.colourAttachmentsQld || "").trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save SMTP settings");
      }
      alert("SMTP settings saved");
    } catch (e) {
      console.error("Save SMTP:", e);
      alert(e.message || "Failed to save SMTP settings");
    }
  }

  function handleRootDirectoryChange(e) {
    const newValue = e.target.value;
    setRootDirectory(newValue);
    valuesRef.current.rootDirectory = newValue;
  }

  function handleSmtpUserChange(e) {
    const v = e.target.value;
    setSmtpUser(v);
    valuesRef.current.smtpUser = v;
  }

  function handleSmtpPassChange(e) {
    const v = e.target.value;
    setSmtpPass(v);
    valuesRef.current.smtpPass = v;
  }

  function handleSmtpUserSecondaryChange(e) {
    const v = e.target.value;
    setSmtpUserSecondary(v);
    valuesRef.current.smtpUserSecondary = v;
  }

  function handleSmtpPassSecondaryChange(e) {
    const v = e.target.value;
    setSmtpPassSecondary(v);
    valuesRef.current.smtpPassSecondary = v;
  }

  // QLD handlers
  function handleRootDirectoryQldChange(e) {
    const newValue = e.target.value;
    setRootDirectoryQld(newValue);
    valuesRef.current.rootDirectoryQld = newValue;
  }

  function handleSmtpUserQldChange(e) {
    const v = e.target.value;
    setSmtpUserQld(v);
    valuesRef.current.smtpUserQld = v;
  }

  function handleSmtpPassQldChange(e) {
    const v = e.target.value;
    setSmtpPassQld(v);
    valuesRef.current.smtpPassQld = v;
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
          smtp_user: (valuesRef.current.smtpUser || "").trim() || null,
          smtp_pass: valuesRef.current.smtpPass || null,
          smtp_user_secondary: (valuesRef.current.smtpUserSecondary || "").trim() || null,
          smtp_pass_secondary: valuesRef.current.smtpPassSecondary || null,
          root_directory_qld: valuesRef.current.rootDirectoryQld || null,
          create_folders_qld: newValue,
          smtp_user_qld: (valuesRef.current.smtpUserQld || "").trim() || null,
          smtp_pass_qld: valuesRef.current.smtpPassQld || null,
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

  async function saveSmtpSettingsQld() {
    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root_directory: valuesRef.current.rootDirectory || null,
          create_folders: valuesRef.current.createFolders === true || valuesRef.current.createFolders === "true",
          smtp_user: (valuesRef.current.smtpUser || "").trim() || null,
          smtp_pass: valuesRef.current.smtpPass || null,
          smtp_user_secondary: (valuesRef.current.smtpUserSecondary || "").trim() || null,
          smtp_pass_secondary: valuesRef.current.smtpPassSecondary || null,
          root_directory_qld: valuesRef.current.rootDirectoryQld || null,
          create_folders_qld: valuesRef.current.createFoldersQld === true || valuesRef.current.createFoldersQld === "true",
          smtp_user_qld: (valuesRef.current.smtpUserQld || "").trim() || null,
          smtp_pass_qld: valuesRef.current.smtpPassQld || null,
          colour_attachments_vic: (valuesRef.current.colourAttachmentsVic || "").trim() || null,
          colour_attachments_qld: (valuesRef.current.colourAttachmentsQld || "").trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save SMTP settings");
      }
      alert("QLD SMTP settings saved");
    } catch (e) {
      console.error("Save SMTP:", e);
      alert(e.message || "Failed to save QLD SMTP settings");
    }
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
          smtp_user: (valuesRef.current.smtpUser || "").trim() || null,
          smtp_pass: valuesRef.current.smtpPass || null,
          root_directory_qld: valuesRef.current.rootDirectoryQld || null,
          create_folders_qld: valuesRef.current.createFoldersQld === true || valuesRef.current.createFoldersQld === "true",
          smtp_user_qld: (valuesRef.current.smtpUserQld || "").trim() || null,
          smtp_pass_qld: valuesRef.current.smtpPassQld || null,
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

  function handleMakeTestFolderClick(state = "VIC") {
    const rootDir = state === "VIC" ? rootDirectory : rootDirectoryQld;
    const testName = state === "VIC" ? testProjectName : testProjectNameQld;
    
    if (!rootDir) {
      alert(`Please set a ${state} root directory first`);
      return;
    }

    if (!testName.trim()) {
      alert(`Please enter a ${state} test project name`);
      return;
    }

    const year = "2026";
    const projectName = testName.trim();
    
    // Format: rootDirectory\YEAR\STATE\SUBURB - STREET
    const folderPath = `${rootDir}\\${year}\\${state}\\${projectName}`;
    
    setPendingFolderPath(folderPath);
    setPendingState(state);
    setShowConfirmModal(true);
  }

  async function handleConfirmCreateFolder() {
    setShowConfirmModal(false);
    setIsCreatingTestFolder(true);
    
    try {
      const response = await fetch(`${API_URL}/api/folders/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: pendingFolderPath,
          rootDirectory: pendingState === "VIC" ? rootDirectory : rootDirectoryQld,
          year: "2026",
          state: pendingState,
        }),
      });

      let responseData;
      try {
        responseData = await response.json();
      } catch (parseError) {
        console.error("Error parsing response:", parseError);
        const text = await response.text();
        console.error("Response text:", text);
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      if (!response.ok) {
        throw new Error(responseData.error || `Failed to create test folder: ${response.status} ${response.statusText}`);
      }

      console.log("Folder creation response:", responseData);
      alert(`Test folder created successfully!\n\nPath: ${pendingFolderPath}\n\nCheck the file system to verify.`);
      setTestProjectName(""); // Clear the input after success
      setPendingFolderPath("");
    } catch (error) {
      console.error("Error creating test folder:", error);
      alert(`Error: ${error.message || "Failed to create test folder"}\n\nCheck the browser console for more details.`);
    } finally {
      setIsCreatingTestFolder(false);
    }
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
      {/* 4 Column Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px", width: "100%" }}>
        {/* VIC Settings Heading */}
        <div style={{ gridColumn: "span 2", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: "24px", color: MONUMENT }}>
            VIC Settings
          </h2>
        </div>
        
        {/* QLD Settings Heading */}
        <div style={{ gridColumn: "span 2", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: "24px", color: MONUMENT }}>
            QLD Settings
          </h2>
        </div>

        {/* Column 1: VIC File Settings */}
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
          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.9rem",
                color: "#32323399",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={createFolders}
                onChange={handleCreateFoldersChange}
                style={{
                  width: "18px",
                  height: "18px",
                  cursor: "pointer",
                }}
              />
              Create project folders and copy template structure
            </label>
          </div>
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
              Test Project Name (SUBURB - STREET)
            </label>
            <input
              type="text"
              value={testProjectName}
              onChange={(e) => setTestProjectName(e.target.value)}
              placeholder="e.g. SUBURB - STREET"
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
          <button
            type="button"
            onClick={() => handleMakeTestFolderClick("VIC")}
            disabled={isCreatingTestFolder || !rootDirectory || !testProjectName.trim()}
            style={{
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              color: WHITE,
              background: isCreatingTestFolder || !rootDirectory || !testProjectName.trim() ? "#999" : MONUMENT,
              border: "none",
              borderRadius: "8px",
              cursor: isCreatingTestFolder || !rootDirectory || !testProjectName.trim() ? "not-allowed" : "pointer",
              width: "100%",
            }}
          >
            {isCreatingTestFolder ? "Creating..." : "Make Test Folder"}
          </button>
          
          {/* VIC Colour Attachments Section */}
          <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "#4D93D9", padding: "16px", borderRadius: "8px" }}>
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

        {/* Column 2: VIC SMTP Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "#4D93D9", padding: "16px", borderRadius: "8px" }}>
          <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
            SMTP - Primary
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
              SMTP User
            </label>
            <input
              type="text"
              value={smtpUser}
              onChange={handleSmtpUserChange}
              placeholder="e.g. info@superiorgrannyflats.com.au"
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
            />
          </div>
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
              SMTP Pass
            </label>
            <input
              type="password"
              value={smtpPass}
              onChange={handleSmtpPassChange}
              placeholder="App password"
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
            />
          </div>
          {/* SMTP - Secondary */}
          <h3 style={{ fontSize: "1rem", marginTop: "24px", marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
            SMTP - Secondary
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
              SMTP User
            </label>
            <input
              type="text"
              value={smtpUserSecondary}
              onChange={handleSmtpUserSecondaryChange}
              placeholder="e.g. info@superiorgrannyflats.com.au"
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
            />
          </div>
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
              SMTP Pass
            </label>
            <input
              type="password"
              value={smtpPassSecondary}
              onChange={handleSmtpPassSecondaryChange}
              placeholder="App password"
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
            />
          </div>
          <button
            type="button"
            onClick={saveSmtpSettings}
            style={{
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              color: WHITE,
              background: MONUMENT,
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              width: "100%",
              marginTop: "16px",
            }}
          >
            Save SMTP
          </button>
        </div>

        {/* Column 3: QLD File Settings */}
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
          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.9rem",
                color: "#32323399",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={createFoldersQld}
                onChange={handleCreateFoldersQldChange}
                style={{
                  width: "18px",
                  height: "18px",
                  cursor: "pointer",
                }}
              />
              Create project folders and copy template structure
            </label>
          </div>
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
              Test Project Name (SUBURB - STREET)
            </label>
            <input
              type="text"
              value={testProjectNameQld}
              onChange={(e) => setTestProjectNameQld(e.target.value)}
              placeholder="e.g. SUBURB - STREET"
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
          <button
            type="button"
            onClick={() => handleMakeTestFolderClick("QLD")}
            disabled={isCreatingTestFolder || !rootDirectoryQld || !testProjectNameQld.trim()}
            style={{
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              color: WHITE,
              background: isCreatingTestFolder || !rootDirectoryQld || !testProjectNameQld.trim() ? "#999" : MONUMENT,
              border: "none",
              borderRadius: "8px",
              cursor: isCreatingTestFolder || !rootDirectoryQld || !testProjectNameQld.trim() ? "not-allowed" : "pointer",
              width: "100%",
            }}
          >
            {isCreatingTestFolder ? "Creating..." : "Make Test Folder"}
          </button>
          
          {/* QLD Colour Attachments Section */}
          <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "#D54358", padding: "16px", borderRadius: "8px" }}>
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

        {/* Column 4: QLD SMTP Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "#D54358", padding: "16px", borderRadius: "8px" }}>
          <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
            SMTP (email sending)
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
              SMTP User
            </label>
            <input
              type="text"
              value={smtpUserQld}
              onChange={handleSmtpUserQldChange}
              placeholder="e.g. info@superiorgrannyflats.com.au"
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
            />
          </div>
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
              SMTP Pass
            </label>
            <input
              type="password"
              value={smtpPassQld}
              onChange={handleSmtpPassQldChange}
              placeholder="App password"
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
            />
          </div>
          <button
            type="button"
            onClick={saveSmtpSettingsQld}
            style={{
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              color: WHITE,
              background: MONUMENT,
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Save SMTP
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
          onClick={() => setShowConfirmModal(false)}
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
            <h3
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                marginTop: 0,
                marginBottom: "24px",
                color: MONUMENT,
              }}
            >
              Confirm Test Folder Creation
            </h3>
            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "8px",
                  fontWeight: 500,
                }}
              >
                The following folder will be created:
              </div>
              <div
                style={{
                  background: WHITE,
                  padding: "16px",
                  borderRadius: "8px",
                  fontSize: "1rem",
                  color: MONUMENT,
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  border: `2px solid ${MONUMENT}`,
                }}
              >
                {pendingFolderPath}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  setPendingFolderPath("");
                }}
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
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateFolder}
                style={{
                  background: MONUMENT,
                  color: WHITE,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.17s",
                }}
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
