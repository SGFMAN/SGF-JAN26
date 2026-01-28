import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

export default function FileSettings() {
  const [rootDirectory, setRootDirectory] = useState("");
  const [createFolders, setCreateFolders] = useState(true);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [testProjectName, setTestProjectName] = useState("");
  const [isCreatingTestFolder, setIsCreatingTestFolder] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingFolderPath, setPendingFolderPath] = useState("");
  const [loading, setLoading] = useState(true);
  const valuesRef = useRef({ rootDirectory, createFolders, smtpUser, smtpPass });

  useEffect(() => {
    valuesRef.current = { rootDirectory, createFolders, smtpUser, smtpPass };
  }, [rootDirectory, createFolders, smtpUser, smtpPass]);

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
    } catch (error) {
      console.error("Error fetching settings:", error);
      setRootDirectory("");
      setCreateFolders(true);
      setSmtpUser("");
      setSmtpPass("");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    try {
      const response = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          root_directory: valuesRef.current.rootDirectory || null,
          create_folders: valuesRef.current.createFolders === true || valuesRef.current.createFolders === "true",
          smtp_user: (valuesRef.current.smtpUser || "").trim() || null,
          smtp_pass: valuesRef.current.smtpPass || null,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Failed to save settings:", errorData.error || response.statusText);
      } else {
        const savedData = await response.json().catch(() => null);
        console.log("Successfully saved settings:", savedData);
      }
    } catch (error) {
      console.error("Error saving settings:", error);
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

  function handleMakeTestFolderClick() {
    if (!rootDirectory) {
      alert("Please set a root directory first");
      return;
    }

    if (!testProjectName.trim()) {
      alert("Please enter a test project name");
      return;
    }

    const year = "2026";
    const state = "VIC";
    const projectName = testProjectName.trim();
    
    // Format: rootDirectory\YEAR\STATE\SUBURB - STREET
    const folderPath = `${rootDirectory}\\${year}\\${state}\\${projectName}`;
    
    setPendingFolderPath(folderPath);
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
          rootDirectory: rootDirectory,
          year: "2026",
          state: "VIC",
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
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: "24px", color: MONUMENT }}>
        File Settings
      </h2>
      <div style={{ marginTop: 0 }}>
        <div style={{ marginBottom: "16px", display: "flex", gap: "16px", alignItems: "flex-end", flexWrap: "wrap" }}>
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
                width: "500px",
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
                width: "250px",
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
            onClick={handleMakeTestFolderClick}
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
              height: "42px",
            }}
          >
            {isCreatingTestFolder ? "Creating..." : "Make Test Folder"}
          </button>
        </div>
        <div style={{ marginBottom: "16px" }}>
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
      </div>

      <h2 style={{ fontSize: "1.15rem", marginTop: "32px", marginBottom: "16px", color: MONUMENT }}>
        SMTP (email sending)
      </h2>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ marginBottom: "16px" }}>
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
              width: "320px",
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
        <div style={{ marginBottom: "16px" }}>
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
              width: "220px",
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
            marginBottom: "16px",
          }}
        >
          Save SMTP
        </button>
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
