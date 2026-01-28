import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

export default function ClientInfo({ project, onUpdate }) {
  // Contact 1 state
  const [client1Name, setClient1Name] = useState(project?.client1_name || "");
  const [client1Email, setClient1Email] = useState(project?.client1_email || "");
  const [client1Phone, setClient1Phone] = useState(project?.client1_phone || "");
  const [client1Active, setClient1Active] = useState(project?.client1_active === 'true');

  // Contact 2 state
  const [client2Name, setClient2Name] = useState(project?.client2_name || "");
  const [client2Email, setClient2Email] = useState(project?.client2_email || "");
  const [client2Phone, setClient2Phone] = useState(project?.client2_phone || "");
  const [client2Active, setClient2Active] = useState(project?.client2_active === 'true');

  // Contact 3 state
  const [client3Name, setClient3Name] = useState(project?.client3_name || "");
  const [client3Email, setClient3Email] = useState(project?.client3_email || "");
  const [client3Phone, setClient3Phone] = useState(project?.client3_phone || "");
  const [client3Active, setClient3Active] = useState(project?.client3_active === 'true');

  // Use ref to track latest values for saving
  const valuesRef = useRef({
    client1Name, client1Email, client1Phone, client1Active,
    client2Name, client2Email, client2Phone, client2Active,
    client3Name, client3Email, client3Phone, client3Active
  });

  // Update ref whenever state changes
  useEffect(() => {
    valuesRef.current = {
      client1Name, client1Email, client1Phone, client1Active,
      client2Name, client2Email, client2Phone, client2Active,
      client3Name, client3Email, client3Phone, client3Active
    };
  }, [client1Name, client1Email, client1Phone, client1Active, client2Name, client2Email, client2Phone, client2Active, client3Name, client3Email, client3Phone, client3Active]);

  // Update state when project changes
  useEffect(() => {
    setClient1Name(project?.client1_name || "");
    setClient1Email(project?.client1_email || "");
    setClient1Phone(project?.client1_phone || "");
    setClient1Active(project?.client1_active === 'true');
    setClient2Name(project?.client2_name || "");
    setClient2Email(project?.client2_email || "");
    setClient2Phone(project?.client2_phone || "");
    setClient2Active(project?.client2_active === 'true');
    setClient3Name(project?.client3_name || "");
    setClient3Email(project?.client3_email || "");
    setClient3Phone(project?.client3_phone || "");
    setClient3Active(project?.client3_active === 'true');
  }, [project]);

  async function saveAllFields() {
    if (!project?.id) {
      console.error("Cannot save: no project ID");
      return;
    }
    const currentValues = valuesRef.current;
    const payload = {
      client1_name: currentValues.client1Name,
      client1_email: currentValues.client1Email,
      client1_phone: currentValues.client1Phone,
      client1_active: currentValues.client1Active,
      client2_name: currentValues.client2Name,
      client2_email: currentValues.client2Email,
      client2_phone: currentValues.client2Phone,
      client2_active: currentValues.client2Active,
      client3_name: currentValues.client3Name,
      client3_email: currentValues.client3Email,
      client3_phone: currentValues.client3Phone,
      client3_active: currentValues.client3Active,
      project_cost: project?.project_cost || null,
      deposit: project?.deposit || null,
    };
    console.log("Saving all fields with payload:", payload);
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error("Error saving fields - Status:", response.status, "Error:", errorData.error || response.statusText);
        const errorText = await response.text().catch(() => response.statusText);
        console.error("Full error response:", errorText);
        return;
      }
      
      // Parse response but don't block on it
      const result = await response.json().catch(() => null);
      console.log("Successfully saved all fields. Response:", result);
      
      // CRITICAL: ALWAYS call onUpdate after successful save - this refreshes the project data
      if (onUpdate) {
        console.log("Calling onUpdate to refresh project data...");
        onUpdate();
      } else {
        console.warn("onUpdate is not defined! Autosave will not refresh data.");
      }
    } catch (error) {
      console.error("Error saving fields:", error);
    }
  }

  // Contact 1 handlers
  function handleClient1NameChange(e) {
    const newValue = e.target.value;
    setClient1Name(newValue);
    valuesRef.current.client1Name = newValue;
  }

  function handleClient1EmailChange(e) {
    const newValue = e.target.value;
    setClient1Email(newValue);
    valuesRef.current.client1Email = newValue;
  }

  function handleClient1PhoneChange(e) {
    const newValue = e.target.value.replace(/\D/g, "");
    setClient1Phone(newValue);
    valuesRef.current.client1Phone = newValue;
  }

  // Contact 2 handlers
  function handleClient2NameChange(e) {
    const newValue = e.target.value;
    setClient2Name(newValue);
    valuesRef.current.client2Name = newValue;
  }

  function handleClient2EmailChange(e) {
    const newValue = e.target.value;
    setClient2Email(newValue);
    valuesRef.current.client2Email = newValue;
  }

  function handleClient2PhoneChange(e) {
    const newValue = e.target.value.replace(/\D/g, "");
    setClient2Phone(newValue);
    valuesRef.current.client2Phone = newValue;
  }

  // Contact 3 handlers
  function handleClient3NameChange(e) {
    const newValue = e.target.value;
    setClient3Name(newValue);
    valuesRef.current.client3Name = newValue;
  }

  function handleClient3EmailChange(e) {
    const newValue = e.target.value;
    setClient3Email(newValue);
    valuesRef.current.client3Email = newValue;
  }

  function handleClient3PhoneChange(e) {
    const newValue = e.target.value.replace(/\D/g, "");
    setClient3Phone(newValue);
    valuesRef.current.client3Phone = newValue;
  }

  // Checkbox handlers - save immediately on change
  async function handleClient1ActiveChange(e) {
    const newValue = e.target.checked;
    setClient1Active(newValue);
    valuesRef.current.client1Active = newValue;
    console.log("Client 1 active changed to:", newValue);
    await saveAllFields();
  }

  async function handleClient2ActiveChange(e) {
    const newValue = e.target.checked;
    setClient2Active(newValue);
    valuesRef.current.client2Active = newValue;
    console.log("Client 2 active changed to:", newValue);
    await saveAllFields();
  }

  async function handleClient3ActiveChange(e) {
    const newValue = e.target.checked;
    setClient3Active(newValue);
    valuesRef.current.client3Active = newValue;
    console.log("Client 3 active changed to:", newValue);
    await saveAllFields();
  }

  async function handleBlur() {
    await saveAllFields();
  }

  function handleEmailClients() {
    // Use current ref values to ensure we have the latest state
    const currentValues = valuesRef.current;
    
    // Get all active contacts with emails
    const activeContacts = [];
    
    // Check if checkbox is checked AND email exists and is not empty
    if (currentValues.client1Active && currentValues.client1Email && currentValues.client1Email.trim() !== "") {
      activeContacts.push({ name: currentValues.client1Name || "", email: currentValues.client1Email.trim() });
    }
    if (currentValues.client2Active && currentValues.client2Email && currentValues.client2Email.trim() !== "") {
      activeContacts.push({ name: currentValues.client2Name || "", email: currentValues.client2Email.trim() });
    }
    if (currentValues.client3Active && currentValues.client3Email && currentValues.client3Email.trim() !== "") {
      activeContacts.push({ name: currentValues.client3Name || "", email: currentValues.client3Email.trim() });
    }

    // If no active contacts with emails, don't do anything
    if (activeContacts.length === 0) {
      alert("Please select at least one contact with an email address.");
      return;
    }

    // Build email addresses (semicolon-separated for Outlook)
    const toEmails = activeContacts.map(contact => contact.email).join(";");
    
    // Extract first names only for greeting
    const firstNames = activeContacts
      .map(contact => {
        const name = contact.name || contact.email;
        if (!name.trim()) return "";
        // Get first name (first word before space)
        const firstName = name.trim().split(/\s+/)[0];
        return firstName;
      })
      .filter(name => name !== "");
    
    // Subject: Project Name
    const subject = project?.name || "Project";
    
    // Body: Format greeting with proper commas and "and"
    // 1 name: "Hi John,"
    // 2 names: "Hi John and Jane,"
    // 3+ names: "Hi John, Jane, and Bob,"
    let body = "Hi ";
    if (firstNames.length === 1) {
      body += `${firstNames[0]},`;
    } else if (firstNames.length === 2) {
      body += `${firstNames[0]} and ${firstNames[1]},`;
    } else if (firstNames.length >= 3) {
      // Oxford comma: "John, Jane, and Bob"
      body += `${firstNames.slice(0, -1).join(", ")}, and ${firstNames[firstNames.length - 1]},`;
    }
    
    // Build mailto link
    // Note: Outlook doesn't support setting "from" field via mailto, but we can set it in the body
    const mailtoLink = `mailto:${toEmails}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    // Open Outlook
    window.location.href = mailtoLink;
  }

  // Get count of active contacts with emails
  // Check if checkbox is checked AND email exists and is not empty
  const getActiveCount = () => {
    let count = 0;
    if (client1Active && client1Email && client1Email.trim() !== "") count++;
    if (client2Active && client2Email && client2Email.trim() !== "") count++;
    if (client3Active && client3Email && client3Email.trim() !== "") count++;
    return count;
  };
  
  const activeContactCount = getActiveCount();

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "none",
    fontSize: "1rem",
    color: MONUMENT,
    background: WHITE,
    boxSizing: "border-box",
  };

  const labelStyle = {
    fontSize: "0.9rem",
    color: "#32323399",
    marginBottom: "6px",
  };

  const columnStyle = {
    flex: 1,
    minWidth: 0,
  };

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%" }}>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Client Info
      </h2>
      {project && (
        <>
          <div style={{ marginTop: "24px", display: "flex", gap: "24px", paddingBottom: "80px" }}>
            {/* Contact 1 Column */}
            <div style={columnStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <input
                  type="checkbox"
                  checked={client1Active}
                  onChange={handleClient1ActiveChange}
                  style={{
                    width: "18px",
                    height: "18px",
                    cursor: "pointer",
                  }}
                />
                <h3 style={{ fontSize: "1rem", fontWeight: 600, color: MONUMENT, margin: 0 }}>
                  Contact 1
                </h3>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <div style={labelStyle}>Contact</div>
                <input
                  type="text"
                  name="client1Name"
                  value={client1Name}
                  onChange={handleClient1NameChange}
                  onBlur={handleBlur}
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <div style={labelStyle}>Email</div>
                <input
                  type="email"
                  name="client1Email"
                  value={client1Email}
                  onChange={handleClient1EmailChange}
                  onBlur={handleBlur}
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: "16px" }}>
                <div style={labelStyle}>Phone</div>
                <input
                  type="tel"
                  name="client1Phone"
                  value={client1Phone}
                  onChange={handleClient1PhoneChange}
                  onBlur={handleBlur}
                  style={inputStyle}
                />
              </div>
            </div>

          {/* Contact 2 Column */}
          <div style={columnStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <input
                type="checkbox"
                checked={client2Active}
                onChange={handleClient2ActiveChange}
                style={{
                  width: "18px",
                  height: "18px",
                  cursor: "pointer",
                }}
              />
              <h3 style={{ fontSize: "1rem", fontWeight: 600, color: MONUMENT, margin: 0 }}>
                Contact 2
              </h3>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={labelStyle}>Contact</div>
              <input
                type="text"
                name="client2Name"
                value={client2Name}
                onChange={handleClient2NameChange}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={labelStyle}>Email</div>
              <input
                type="email"
                name="client2Email"
                value={client2Email}
                onChange={handleClient2EmailChange}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={labelStyle}>Phone</div>
              <input
                type="tel"
                name="client2Phone"
                value={client2Phone}
                onChange={handleClient2PhoneChange}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Contact 3 Column */}
          <div style={columnStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <input
                type="checkbox"
                checked={client3Active}
                onChange={handleClient3ActiveChange}
                style={{
                  width: "18px",
                  height: "18px",
                  cursor: "pointer",
                }}
              />
              <h3 style={{ fontSize: "1rem", fontWeight: 600, color: MONUMENT, margin: 0 }}>
                Contact 3
              </h3>
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={labelStyle}>Contact</div>
              <input
                type="text"
                name="client3Name"
                value={client3Name}
                onChange={handleClient3NameChange}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={labelStyle}>Email</div>
              <input
                type="email"
                name="client3Email"
                value={client3Email}
                onChange={handleClient3EmailChange}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <div style={labelStyle}>Phone</div>
              <input
                type="tel"
                name="client3Phone"
                value={client3Phone}
                onChange={handleClient3PhoneChange}
                onBlur={handleBlur}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Contact 4 Column - Empty */}
          <div style={columnStyle}>
          </div>
          </div>
          <div style={{ position: "absolute", bottom: "14px", left: "0px" }}>
            <button
              onClick={handleEmailClients}
              style={{
                background: WHITE,
                color: MONUMENT,
                border: "none",
                borderRadius: "10px",
                padding: "12px 8px",
                fontSize: "1.05rem",
                fontWeight: 500,
                textAlign: "center",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "background 0.17s",
                width: "200px",
                display: "block",
              }}
            >
              {activeContactCount === 0
                ? "Email Client"
                : activeContactCount === 1
                ? "Email Client"
                : "Email Clients"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
