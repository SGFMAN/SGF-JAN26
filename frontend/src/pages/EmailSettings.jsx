import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

/** Compressed VIC SMTP cards so Primary, Secondary, and VIC - SMTP fit in column 1 */
const VIC_SMTP_CARD = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  backgroundColor: "#4D93D9",
  padding: "8px 10px",
  borderRadius: "6px",
};
const VIC_SMTP_H3 = { fontSize: "0.85rem", marginTop: 0, marginBottom: "4px", color: MONUMENT, fontWeight: 600 };
const VIC_SMTP_LAB = {
  display: "block",
  fontSize: "0.75rem",
  color: "#32323399",
  marginBottom: "4px",
  fontWeight: 500,
};
const VIC_SMTP_IN = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: "6px",
  border: "none",
  fontSize: "0.875rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
};

export default function EmailSettings() {
  // VIC SMTP Settings
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpUserSecondary, setSmtpUserSecondary] = useState("");
  const [smtpPassSecondary, setSmtpPassSecondary] = useState("");
  const [smtpUserVicSmtp, setSmtpUserVicSmtp] = useState("");
  const [smtpPassVicSmtp, setSmtpPassVicSmtp] = useState("");
  
  // QLD SMTP Settings
  const [smtpUserQld, setSmtpUserQld] = useState("");
  const [smtpPassQld, setSmtpPassQld] = useState("");
  
  // Send Drawings to SGF settings (arrays of selected email addresses)
  const [sendDrawingsVic, setSendDrawingsVic] = useState([]);
  const [sendDrawingsQld, setSendDrawingsQld] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const valuesRef = useRef({
    smtpUser,
    smtpPass,
    smtpUserSecondary,
    smtpPassSecondary,
    smtpUserVicSmtp,
    smtpPassVicSmtp,
    smtpUserQld,
    smtpPassQld,
    sendDrawingsVic,
    sendDrawingsQld,
  });

  useEffect(() => {
    valuesRef.current = {
      smtpUser,
      smtpPass,
      smtpUserSecondary,
      smtpPassSecondary,
      smtpUserVicSmtp,
      smtpPassVicSmtp,
      smtpUserQld,
      smtpPassQld,
      sendDrawingsVic,
      sendDrawingsQld,
    };
  }, [
    smtpUser,
    smtpPass,
    smtpUserSecondary,
    smtpPassSecondary,
    smtpUserVicSmtp,
    smtpPassVicSmtp,
    smtpUserQld,
    smtpPassQld,
    sendDrawingsVic,
    sendDrawingsQld,
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
      setSmtpUser(data.smtp_user || "");
      setSmtpPass(data.smtp_pass || "");
      setSmtpUserSecondary(data.smtp_user_secondary || "");
      setSmtpPassSecondary(data.smtp_pass_secondary || "");
      setSmtpUserVicSmtp(data.smtp_user_vic_smtp || "");
      setSmtpPassVicSmtp(data.smtp_pass_vic_smtp || "");
      setSmtpUserQld(data.smtp_user_qld || "");
      setSmtpPassQld(data.smtp_pass_qld || "");
      const vicDrawings = Array.isArray(data.send_drawings_vic) ? data.send_drawings_vic : [];
      const qldDrawings = Array.isArray(data.send_drawings_qld) ? data.send_drawings_qld : [];
      console.log("Loaded send_drawings_vic:", vicDrawings);
      console.log("Loaded send_drawings_qld:", qldDrawings);
      setSendDrawingsVic(vicDrawings);
      setSendDrawingsQld(qldDrawings);
      valuesRef.current.sendDrawingsVic = vicDrawings;
      valuesRef.current.sendDrawingsQld = qldDrawings;
    } catch (error) {
      console.error("Error fetching settings:", error);
      setSmtpUser("");
      setSmtpPass("");
      setSmtpUserSecondary("");
      setSmtpPassSecondary("");
      setSmtpUserVicSmtp("");
      setSmtpPassVicSmtp("");
      setSmtpUserQld("");
      setSmtpPassQld("");
      setSendDrawingsVic([]);
      setSendDrawingsQld([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveSmtpSettings() {
    try {
      const payload = {
        smtp_user: (valuesRef.current.smtpUser || "").trim() || null,
        smtp_pass: valuesRef.current.smtpPass || null,
        smtp_user_secondary: (valuesRef.current.smtpUserSecondary || "").trim() || null,
        smtp_pass_secondary: valuesRef.current.smtpPassSecondary || null,
        smtp_user_vic_smtp: (valuesRef.current.smtpUserVicSmtp || "").trim() || null,
        smtp_pass_vic_smtp: valuesRef.current.smtpPassVicSmtp || null,
        smtp_user_qld: (valuesRef.current.smtpUserQld || "").trim() || null,
        smtp_pass_qld: valuesRef.current.smtpPassQld || null,
        send_drawings_vic: Array.isArray(valuesRef.current.sendDrawingsVic) ? valuesRef.current.sendDrawingsVic : [],
        send_drawings_qld: Array.isArray(valuesRef.current.sendDrawingsQld) ? valuesRef.current.sendDrawingsQld : [],
      };
      console.log("Saving SMTP settings:", payload);
      console.log("send_drawings_vic from ref:", valuesRef.current.sendDrawingsVic);
      console.log("send_drawings_qld from ref:", valuesRef.current.sendDrawingsQld);
      const res = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save SMTP settings");
      }
      const responseData = await res.json().catch(() => ({}));
      console.log("SMTP settings saved successfully. Response:", responseData);
    } catch (e) {
      console.error("Save SMTP:", e);
      alert(e.message || "Failed to save SMTP settings");
    }
  }

  function handleSmtpUserChange(e) {
    const v = e.target.value;
    setSmtpUser(v);
    valuesRef.current.smtpUser = v;
  }

  async function handleSmtpUserBlur() {
    await saveSmtpSettings();
  }

  function handleSmtpPassChange(e) {
    const v = e.target.value;
    setSmtpPass(v);
    valuesRef.current.smtpPass = v;
  }

  async function handleSmtpPassBlur() {
    await saveSmtpSettings();
  }

  function handleSmtpUserSecondaryChange(e) {
    const v = e.target.value;
    setSmtpUserSecondary(v);
    valuesRef.current.smtpUserSecondary = v;
  }

  async function handleSmtpUserSecondaryBlur() {
    await saveSmtpSettings();
  }

  function handleSmtpPassSecondaryChange(e) {
    const v = e.target.value;
    setSmtpPassSecondary(v);
    valuesRef.current.smtpPassSecondary = v;
  }

  async function handleSmtpPassSecondaryBlur() {
    await saveSmtpSettings();
  }

  function handleSmtpUserVicSmtpChange(e) {
    const v = e.target.value;
    setSmtpUserVicSmtp(v);
    valuesRef.current.smtpUserVicSmtp = v;
  }

  async function handleSmtpUserVicSmtpBlur() {
    await saveSmtpSettings();
  }

  function handleSmtpPassVicSmtpChange(e) {
    const v = e.target.value;
    setSmtpPassVicSmtp(v);
    valuesRef.current.smtpPassVicSmtp = v;
  }

  async function handleSmtpPassVicSmtpBlur() {
    await saveSmtpSettings();
  }

  function handleSmtpUserQldChange(e) {
    const v = e.target.value;
    setSmtpUserQld(v);
    valuesRef.current.smtpUserQld = v;
  }

  async function handleSmtpUserQldBlur() {
    await saveSmtpSettings();
  }

  function handleSmtpPassQldChange(e) {
    const v = e.target.value;
    setSmtpPassQld(v);
    valuesRef.current.smtpPassQld = v;
  }

  async function handleSmtpPassQldBlur() {
    await saveSmtpSettings();
  }

  async function handleSendDrawingsVicChange(email, checked) {
    const newList = checked
      ? [...sendDrawingsVic, email]
      : sendDrawingsVic.filter((e) => e !== email);
    setSendDrawingsVic(newList);
    valuesRef.current.sendDrawingsVic = newList;
    await saveSmtpSettings();
  }

  async function handleSendDrawingsQldChange(email, checked) {
    const newList = checked
      ? [...sendDrawingsQld, email]
      : sendDrawingsQld.filter((e) => e !== email);
    setSendDrawingsQld(newList);
    valuesRef.current.sendDrawingsQld = newList;
    await saveSmtpSettings();
  }

  // Get all SMTP users (filter out empty ones)
  function getAllSmtpUsers() {
    const users = [];
    if (smtpUser && smtpUser.trim()) users.push(smtpUser.trim());
    if (smtpUserSecondary && smtpUserSecondary.trim()) users.push(smtpUserSecondary.trim());
    if (smtpUserVicSmtp && smtpUserVicSmtp.trim()) users.push(smtpUserVicSmtp.trim());
    if (smtpUserQld && smtpUserQld.trim()) users.push(smtpUserQld.trim());
    return users;
  }

  if (loading) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: MONUMENT }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", padding: "24px 32px", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
      <h2 style={{ fontSize: "1.5rem", marginTop: 0, marginBottom: "24px", color: MONUMENT }}>
        Email Settings
      </h2>
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px", width: "100%" }}>
        {/* Column 1: VIC Primary, Secondary, VIC - SMTP (compressed) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={VIC_SMTP_CARD}>
            <h3 style={VIC_SMTP_H3}>VIC - SMTP Primary</h3>
            <div>
              <label style={VIC_SMTP_LAB}>SMTP User</label>
              <input
                type="text"
                value={smtpUser}
                onChange={handleSmtpUserChange}
                onBlur={handleSmtpUserBlur}
                placeholder="e.g. info@superiorgrannyflats.com.au"
                style={VIC_SMTP_IN}
              />
            </div>
            <div>
              <label style={VIC_SMTP_LAB}>SMTP Pass</label>
              <input
                type="password"
                value={smtpPass}
                onChange={handleSmtpPassChange}
                onBlur={handleSmtpPassBlur}
                placeholder="App password"
                style={VIC_SMTP_IN}
              />
            </div>
          </div>

          <div style={VIC_SMTP_CARD}>
            <h3 style={VIC_SMTP_H3}>VIC - SMTP Secondary</h3>
            <div>
              <label style={VIC_SMTP_LAB}>SMTP User</label>
              <input
                type="text"
                value={smtpUserSecondary}
                onChange={handleSmtpUserSecondaryChange}
                onBlur={handleSmtpUserSecondaryBlur}
                placeholder="e.g. info@superiorgrannyflats.com.au"
                style={VIC_SMTP_IN}
              />
            </div>
            <div>
              <label style={VIC_SMTP_LAB}>SMTP Pass</label>
              <input
                type="password"
                value={smtpPassSecondary}
                onChange={handleSmtpPassSecondaryChange}
                onBlur={handleSmtpPassSecondaryBlur}
                placeholder="App password"
                style={VIC_SMTP_IN}
              />
            </div>
          </div>

          <div style={VIC_SMTP_CARD}>
            <h3 style={VIC_SMTP_H3}>VIC - SMTP</h3>
            <div>
              <label style={VIC_SMTP_LAB}>SMTP User</label>
              <input
                type="text"
                value={smtpUserVicSmtp}
                onChange={handleSmtpUserVicSmtpChange}
                onBlur={handleSmtpUserVicSmtpBlur}
                placeholder="e.g. info@superiorgrannyflats.com.au"
                style={VIC_SMTP_IN}
              />
            </div>
            <div>
              <label style={VIC_SMTP_LAB}>SMTP Pass</label>
              <input
                type="password"
                value={smtpPassVicSmtp}
                onChange={handleSmtpPassVicSmtpChange}
                onBlur={handleSmtpPassVicSmtpBlur}
                placeholder="App password"
                style={VIC_SMTP_IN}
              />
            </div>
          </div>
        </div>

        {/* Column 2: VIC Send Drawings to SGF */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "#4D93D9", padding: "16px", borderRadius: "8px" }}>
          <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
            Send Drawings to SGF
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {getAllSmtpUsers().map((email) => (
              <label
                key={email}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "0.9rem",
                  color: MONUMENT,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={sendDrawingsVic.includes(email)}
                  onChange={(e) => handleSendDrawingsVicChange(email, e.target.checked)}
                  style={{
                    width: "18px",
                    height: "18px",
                    cursor: "pointer",
                  }}
                />
                <span>{email}</span>
              </label>
            ))}
            {getAllSmtpUsers().length === 0 && (
              <div style={{ fontSize: "0.9rem", color: "#32323399", fontStyle: "italic" }}>
                No SMTP users configured
              </div>
            )}
          </div>
        </div>

        {/* Column 3: QLD SMTP Settings */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "#D54358", padding: "16px", borderRadius: "8px" }}>
          <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
            QLD - SMTP
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
              onBlur={handleSmtpUserQldBlur}
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
              onBlur={handleSmtpPassQldBlur}
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
        </div>

        {/* Column 4: QLD Send Drawings to SGF */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", backgroundColor: "#D54358", padding: "16px", borderRadius: "8px" }}>
          <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "8px", color: MONUMENT, fontWeight: 600 }}>
            Send Drawings to SGF
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {getAllSmtpUsers().map((email) => (
              <label
                key={email}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "0.9rem",
                  color: MONUMENT,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={sendDrawingsQld.includes(email)}
                  onChange={(e) => handleSendDrawingsQldChange(email, e.target.checked)}
                  style={{
                    width: "18px",
                    height: "18px",
                    cursor: "pointer",
                  }}
                />
                <span>{email}</span>
              </label>
            ))}
            {getAllSmtpUsers().length === 0 && (
              <div style={{ fontSize: "0.9rem", color: "#32323399", fontStyle: "italic" }}>
                No SMTP users configured
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
