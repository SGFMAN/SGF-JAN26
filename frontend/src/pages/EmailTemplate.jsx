import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

export default function EmailTemplate() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [templateName, setTemplateName] = useState("");
  const [toAddresses, setToAddresses] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplateId) {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (template) {
        setTemplateName(template.name || "");
        setToAddresses(template.to_addresses ? template.to_addresses.join(", ") : "");
        setFromAddress(template.from_address || "");
        setSubject(template.subject || "");
        setBody(template.body || "");
      }
    } else {
      // Clear form when no template selected
      setTemplateName("");
      setToAddresses("");
      setFromAddress("");
      setSubject("");
      setBody("");
    }
  }, [selectedTemplateId, templates]);

  async function fetchTemplates() {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/email-templates`);
      if (!response.ok) {
        throw new Error("Failed to fetch email templates");
      }
      const data = await response.json();
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching email templates:", error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveTemplate() {
    if (!templateName.trim()) {
      alert("Please enter a template name");
      return;
    }

    try {
      const toAddressesArray = toAddresses
        .split(",")
        .map(addr => addr.trim())
        .filter(addr => addr.length > 0);

      const templateData = {
        name: templateName.trim(),
        to_addresses: toAddressesArray,
        from_address: fromAddress.trim(),
        subject: subject.trim(),
        body: body.trim(),
      };

      let response;
      if (selectedTemplateId) {
        // Update existing template
        response = await fetch(`${API_URL}/api/email-templates/${selectedTemplateId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(templateData),
        });
      } else {
        // Create new template
        response = await fetch(`${API_URL}/api/email-templates`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(templateData),
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save template");
      }

      await fetchTemplates();
      const savedData = await response.json();
      setSelectedTemplateId(savedData.id);
      alert("Template saved successfully");
    } catch (error) {
      console.error("Error saving template:", error);
      alert(`Error saving template: ${error.message}`);
    }
  }

  async function deleteTemplate() {
    if (!selectedTemplateId) {
      alert("Please select a template to delete");
      return;
    }

    if (!confirm("Are you sure you want to delete this template?")) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/email-templates/${selectedTemplateId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to delete template");
      }

      setSelectedTemplateId(null);
      await fetchTemplates();
      alert("Template deleted successfully");
    } catch (error) {
      console.error("Error deleting template:", error);
      alert(`Error deleting template: ${error.message}`);
    }
  }

  function handleNewTemplate() {
    setSelectedTemplateId(null);
    setTemplateName("");
    setToAddresses("");
    setFromAddress("");
    setSubject("");
    setBody("");
  }

  function insertToken(field, token) {
    const tokenText = `{${token}}`;
    if (field === "toAddresses") {
      const currentValue = toAddresses || "";
      const newValue = currentValue 
        ? `${currentValue}, ${tokenText}` 
        : tokenText;
      setToAddresses(newValue);
    } else if (field === "subject") {
      const currentValue = subject || "";
      setSubject(currentValue + tokenText);
    } else if (field === "body") {
      const currentValue = body || "";
      setBody(currentValue + tokenText);
    }
  }

  if (loading) {
    return (
      <div style={{ width: "100%", height: "100%", padding: "24px 32px", color: MONUMENT }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", gap: "24px", padding: "24px 32px", boxSizing: "border-box", overflow: "hidden" }}>
      {/* Column 1 - Template List */}
      <div style={{ width: "33.33%", display: "flex", flexDirection: "column", gap: "16px", height: "100%", overflow: "hidden" }}>
        <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: 0, color: MONUMENT, flexShrink: 0 }}>
          Email Templates
        </h2>
        <button
          onClick={handleNewTemplate}
          style={{
            padding: "10px 16px",
            fontSize: "0.95rem",
            fontWeight: 500,
            color: WHITE,
            background: MONUMENT,
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          + New Template
        </button>
        <div
          style={{
            background: WHITE,
            border: `1px solid ${SECTION_GREY}`,
            borderRadius: "8px",
            padding: "12px",
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
          }}
        >
          {templates.length === 0 ? (
            <div style={{ color: "#32323399", fontSize: "0.9rem", fontStyle: "italic" }}>
              None yet
            </div>
          ) : (
            templates.map((template) => (
              <div
                key={template.id}
                onClick={() => setSelectedTemplateId(template.id)}
                style={{
                  padding: "10px",
                  marginBottom: "8px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  background: selectedTemplateId === template.id ? "#f0f0f0" : "transparent",
                  border: selectedTemplateId === template.id ? `1px solid ${MONUMENT}` : "1px solid transparent",
                }}
              >
                <div style={{ fontWeight: 500, color: MONUMENT, fontSize: "0.95rem" }}>
                  {template.name}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Column 2 - Template Name, To, From, Subject */}
      <div style={{ width: "33.33%", display: "flex", flexDirection: "column", gap: "16px", height: "100%", overflow: "hidden" }}>
        <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: 0, color: MONUMENT, flexShrink: 0 }}>
          {selectedTemplateId ? "Edit Template" : "New Template"}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto", flex: 1, minHeight: 0 }}>
          {/* Template Name */}
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
              Template Name
            </label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Enter template name"
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

          {/* To Addresses */}
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
              To Addresses (comma-separated or use tokens)
            </label>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => insertToken("toAddresses", "Contact1")}
                style={{
                  padding: "6px 12px",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: WHITE,
                  border: `1px solid ${SECTION_GREY}`,
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                {"{Contact1}"}
              </button>
              <button
                type="button"
                onClick={() => insertToken("toAddresses", "Contact2")}
                style={{
                  padding: "6px 12px",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: WHITE,
                  border: `1px solid ${SECTION_GREY}`,
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                {"{Contact2}"}
              </button>
              <button
                type="button"
                onClick={() => insertToken("toAddresses", "Contact3")}
                style={{
                  padding: "6px 12px",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: WHITE,
                  border: `1px solid ${SECTION_GREY}`,
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                {"{Contact3}"}
              </button>
            </div>
            <input
              type="text"
              value={toAddresses}
              onChange={(e) => setToAddresses(e.target.value)}
              placeholder="email1@example.com, email2@example.com or {Contact1}, {Contact2}"
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

          {/* From Address */}
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
              From Address
            </label>
            <select
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
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
            >
              <option value="">Select from address</option>
              <option value="info@superiorgrannyflats.com.au">info@superiorgrannyflats.com.au</option>
              <option value="design@superiorgrannyflats.com.au">design@superiorgrannyflats.com.au</option>
            </select>
          </div>

          {/* Subject */}
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
              Subject
            </label>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => insertToken("subject", "ProjectName")}
                style={{
                  padding: "6px 12px",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: WHITE,
                  border: `1px solid ${SECTION_GREY}`,
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                {"{ProjectName}"}
              </button>
            </div>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
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

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "12px", marginTop: "auto" }}>
            <button
              onClick={saveTemplate}
              style={{
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                color: WHITE,
                background: MONUMENT,
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              {selectedTemplateId ? "Update Template" : "Save Template"}
            </button>
            {selectedTemplateId && (
              <button
                onClick={deleteTemplate}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: WHITE,
                  background: "#cc3333",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Delete Template
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Column 3 - Body */}
      <div style={{ width: "33.33%", display: "flex", flexDirection: "column", gap: "16px", height: "100%", overflow: "hidden" }}>
        <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: 0, color: MONUMENT, flexShrink: 0 }}>
          Body
        </h2>
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => insertToken("body", "ProjectName")}
            style={{
              padding: "6px 12px",
              fontSize: "0.85rem",
              fontWeight: 500,
              color: MONUMENT,
              background: WHITE,
              border: `1px solid ${SECTION_GREY}`,
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {"{ProjectName}"}
          </button>
          <button
            type="button"
            onClick={() => insertToken("body", "ClientName")}
            style={{
              padding: "6px 12px",
              fontSize: "0.85rem",
              fontWeight: 500,
              color: MONUMENT,
              background: WHITE,
              border: `1px solid ${SECTION_GREY}`,
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {"{ClientName}"}
          </button>
          <button
            type="button"
            onClick={() => insertToken("body", "DepositPaid")}
            style={{
              padding: "6px 12px",
              fontSize: "0.85rem",
              fontWeight: 500,
              color: MONUMENT,
              background: WHITE,
              border: `1px solid ${SECTION_GREY}`,
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {"{DepositPaid}"}
          </button>
          <button
            type="button"
            onClick={() => insertToken("body", "DepositStatus")}
            style={{
              padding: "6px 12px",
              fontSize: "0.85rem",
              fontWeight: 500,
              color: MONUMENT,
              background: WHITE,
              border: `1px solid ${SECTION_GREY}`,
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {"{DepositStatus}"}
          </button>
          <button
            type="button"
            onClick={() => insertToken("body", "Salesperson")}
            style={{
              padding: "6px 12px",
              fontSize: "0.85rem",
              fontWeight: 500,
              color: MONUMENT,
              background: WHITE,
              border: `1px solid ${SECTION_GREY}`,
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {"{Salesperson}"}
          </button>
          <button
            type="button"
            onClick={() => insertToken("body", "SalespersonPosition")}
            style={{
              padding: "6px 12px",
              fontSize: "0.85rem",
              fontWeight: 500,
              color: MONUMENT,
              background: WHITE,
              border: `1px solid ${SECTION_GREY}`,
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {"{SalespersonPosition}"}
          </button>
          <button
            type="button"
            onClick={() => insertToken("body", "SalespersonPhone")}
            style={{
              padding: "6px 12px",
              fontSize: "0.85rem",
              fontWeight: 500,
              color: MONUMENT,
              background: WHITE,
              border: `1px solid ${SECTION_GREY}`,
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {"{SalespersonPhone}"}
          </button>
          <button
            type="button"
            onClick={() => insertToken("body", "SalespersonEmail")}
            style={{
              padding: "6px 12px",
              fontSize: "0.85rem",
              fontWeight: 500,
              color: MONUMENT,
              background: WHITE,
              border: `1px solid ${SECTION_GREY}`,
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {"{SalespersonEmail}"}
          </button>
          <button
            type="button"
            onClick={() => insertToken("body", "SiteVisitScheduledDate")}
            style={{
              padding: "6px 12px",
              fontSize: "0.85rem",
              fontWeight: 500,
              color: MONUMENT,
              background: WHITE,
              border: `1px solid ${SECTION_GREY}`,
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {"{SiteVisitScheduledDate}"}
          </button>
          <button
            type="button"
            onClick={() => insertToken("body", "SiteVisitScheduledPeriod")}
            style={{
              padding: "6px 12px",
              fontSize: "0.85rem",
              fontWeight: 500,
              color: MONUMENT,
              background: WHITE,
              border: `1px solid ${SECTION_GREY}`,
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {"{SiteVisitScheduledPeriod}"}
          </button>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Email body text. Use tokens like {ProjectName}, {ClientName}, etc."
          style={{
            width: "100%",
            flex: 1,
            padding: "10px 12px",
            borderRadius: "8px",
            border: "none",
            fontSize: "1rem",
            color: MONUMENT,
            background: WHITE,
            boxSizing: "border-box",
            resize: "none",
            fontFamily: "inherit",
            minHeight: 0,
          }}
        />
      </div>
    </div>
  );
}
