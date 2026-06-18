import React, { useState, useEffect, useRef } from "react";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

export default function FileSettings() {
  const [rootDirectory, setRootDirectory] = useState("");
  const [colourAttachmentsVic, setColourAttachmentsVic] = useState("");

  const [colourAttachmentsQld, setColourAttachmentsQld] = useState("");
  const [emailLogoPath, setEmailLogoPath] = useState("");
  const [letterheadPath, setLetterheadPath] = useState("");

  const [loading, setLoading] = useState(true);
  const valuesRef = useRef({
    rootDirectory,
    colourAttachmentsVic,
    colourAttachmentsQld,
    emailLogoPath,
    letterheadPath,
  });

  useEffect(() => {
    valuesRef.current = {
      rootDirectory,
      colourAttachmentsVic,
      colourAttachmentsQld,
      emailLogoPath,
      letterheadPath,
    };
  }, [
    rootDirectory,
    colourAttachmentsVic,
    colourAttachmentsQld,
    emailLogoPath,
    letterheadPath,
  ]);

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
      setColourAttachmentsVic(data.colour_attachments_vic || "");
      setColourAttachmentsQld(data.colour_attachments_qld || "");
      setEmailLogoPath(data.email_logo_path || "");
      setLetterheadPath(data.letterhead_path || "");
    } catch (error) {
      console.error("Error fetching settings:", error);
      setRootDirectory("");
      setColourAttachmentsVic("");
      setColourAttachmentsQld("");
      setEmailLogoPath("");
      setLetterheadPath("");
    } finally {
      setLoading(false);
    }
  }

  function settingsPayload() {
    return {
      root_directory: valuesRef.current.rootDirectory || null,
      colour_attachments_vic: (valuesRef.current.colourAttachmentsVic || "").trim() || null,
      colour_attachments_qld: (valuesRef.current.colourAttachmentsQld || "").trim() || null,
      email_logo_path: (valuesRef.current.emailLogoPath || "").trim() || null,
      letterhead_path: (valuesRef.current.letterheadPath || "").trim() || null,
    };
  }

  async function saveSettings() {
    try {
      const payload = settingsPayload();
      const response = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Failed to save settings:", errorData.error || response.statusText);
        alert(`Failed to save settings: ${errorData.error || response.statusText}`);
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

  function handleEmailLogoPathChange(e) {
    const newValue = e.target.value;
    setEmailLogoPath(newValue);
    valuesRef.current.emailLogoPath = newValue;
  }

  function handleLetterheadPathChange(e) {
    const newValue = e.target.value;
    setLetterheadPath(newValue);
    valuesRef.current.letterheadPath = newValue;
  }

  async function handleEmailLogoPathBlur() {
    await saveSettings();
  }

  async function handleLetterheadPathBlur() {
    await saveSettings();
  }

  async function handleColourAttachmentsVicBlur() {
    await saveSettings();
  }

  async function handleColourAttachmentsQldBlur() {
    await saveSettings();
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

  const vicCard = {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    backgroundColor: "#E5E5E7",
    padding: "12px",
    borderRadius: "8px",
    width: "100%",
    boxSizing: "border-box",
  };

  const inputStyle = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "8px",
    border: "none",
    fontSize: "1rem",
    color: MONUMENT,
    background: WHITE,
    boxSizing: "border-box",
  };

  return (
    <div style={{ width: "100%", height: "100%", padding: "16px 24px", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", width: "100%", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>

          <div style={vicCard}>
            <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
              File Settings
            </h3>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
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
                style={inputStyle}
                autoComplete="off"
              />
            </div>
          </div>

          <div style={vicCard}>
            <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
              Colour Attachments - VIC
            </h3>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
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
                style={inputStyle}
                autoComplete="off"
              />
            </div>
          </div>

          <div style={vicCard}>
            <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
              Logo Attachment
            </h3>
            <p style={{ fontSize: "0.85rem", color: "#323233cc", margin: 0, lineHeight: 1.45 }}>
              Full path to the image embedded at the end of outgoing HTML emails only (inline in the message). Leave blank for no email logo.
            </p>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Image file path
              </label>
              <input
                type="text"
                name="emailLogoPath"
                value={emailLogoPath}
                onChange={handleEmailLogoPathChange}
                onBlur={handleEmailLogoPathBlur}
                placeholder="e.g. Z:\...\LOGOS\SGF.jpg"
                style={inputStyle}
                autoComplete="off"
              />
            </div>
          </div>

          <div style={vicCard}>
            <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
              Letter Head
            </h3>
            <p style={{ fontSize: "0.85rem", color: "#323233cc", margin: 0, lineHeight: 1.45 }}>
              Full path to the image used at the top of Variation PDFs. Emails keep using Logo Attachment above. If blank, the variation PDF falls back to the email logo path, then no image.
            </p>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Letterhead image path
              </label>
              <input
                type="text"
                name="letterheadPath"
                value={letterheadPath}
                onChange={handleLetterheadPathChange}
                onBlur={handleLetterheadPathBlur}
                placeholder="e.g. Z:\...\Letterhead.png"
                style={inputStyle}
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
          <div style={vicCard}>
            <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
              Colour Attachments - QLD
            </h3>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: UI.textMuted,
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
                style={inputStyle}
                autoComplete="off"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
