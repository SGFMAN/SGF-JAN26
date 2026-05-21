import React, { useState, useEffect, useMemo } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";
const TEMPLATE_TEST_EMAIL_TO = "ben@superiorgrannyflats.com.au";
const TEMPLATE_SECTIONS = ["Colours", "Drawings", "New Project", "Misc"];
const ADD_NEW_GROUP_VALUE = "__add_new_group__";

function normalizeName(name) {
  return (name || "").toLowerCase();
}

function getTemplateSection(templateName) {
  const n = normalizeName(templateName);
  if (n.includes("site visit booking")) {
    return "Misc";
  }
  if (
    n.includes("colour") ||
    n.includes("color") ||
    n.includes("selection") ||
    n.includes("consult")
  ) {
    return "Colours";
  }
  if (
    n.includes("drawing") ||
    n.includes("draft") ||
    n.includes("plan")
  ) {
    return "Drawings";
  }
  if (
    n.includes("new project") ||
    n.includes("new job") ||
    n.includes("welcome") ||
    n.includes("intake") ||
    n.includes("onboard")
  ) {
    return "New Project";
  }
  return "Misc";
}

export default function EmailTemplate() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [templateName, setTemplateName] = useState("");
  const [templateGroup, setTemplateGroup] = useState("Misc");
  const [customGroups, setCustomGroups] = useState([]);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showTemplateDetailsModal, setShowTemplateDetailsModal] = useState(false);
  const [templateDetailsModalMode, setTemplateDetailsModalMode] = useState("new"); // "new" | "edit" | "copy"
  const [modalDraftName, setModalDraftName] = useState("");
  const [modalDraftGroup, setModalDraftGroup] = useState("Misc");
  const [copySourceTemplateId, setCopySourceTemplateId] = useState(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [openSection, setOpenSection] = useState("Colours");
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchTemplateGroups();
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) return;
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;
    setTemplateName(template.name || "");
    const rawGroup = String(template.template_group || "").trim();
    setTemplateGroup(rawGroup || getTemplateSection(template.name));
    setSubject(template.subject || "");
    setBody(template.body || "");
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    const discovered = new Set();
    templates.forEach((t) => {
      const g = String(t?.template_group || "").trim();
      if (g && !TEMPLATE_SECTIONS.includes(g)) discovered.add(g);
    });
    setCustomGroups((prev) => {
      const merged = new Set([...prev, ...discovered]);
      return Array.from(merged).sort((a, b) => a.localeCompare(b));
    });
  }, [templates]);

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

  async function sendFormattingTestEmail() {
    const subj = subject.trim() || "(no subject)";
    const bodyContent = body.trim();
    try {
      setTestSending(true);
      const settingsRes = await fetch(`${API_URL}/api/settings`);
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      let fromAddr = "";
      for (let i = 1; i <= 16; i++) {
        const raw = settings[`smtp_user_${i}`];
        if (raw != null && String(raw).trim()) {
          fromAddr = String(raw).trim();
          break;
        }
      }
      if (!fromAddr) {
        alert(
          "No SMTP From address found. Configure at least one SMTP user (e.g. smtp_user_1) in Settings before sending a test."
        );
        return;
      }
      const res = await fetch(`${API_URL}/api/emails/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: TEMPLATE_TEST_EMAIL_TO,
          from: fromAddr,
          subject: `[Template test] ${subj}`,
          htmlBody: bodyContent || "<p>(empty body)</p>",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
      alert(`Test email sent to ${TEMPLATE_TEST_EMAIL_TO}`);
    } catch (e) {
      console.error("Template test send:", e);
      alert(e.message || "Failed to send test email.");
    } finally {
      setTestSending(false);
    }
  }

  async function fetchTemplateGroups() {
    try {
      const response = await fetch(`${API_URL}/api/email-template-groups`);
      if (!response.ok) throw new Error("Failed to fetch email template groups");
      const data = await response.json();
      const groups = (data || [])
        .map((g) => String(g?.name || "").trim())
        .filter((g) => g && !TEMPLATE_SECTIONS.includes(g));
      setCustomGroups(Array.from(new Set(groups)).sort((a, b) => a.localeCompare(b)));
    } catch (error) {
      console.error("Error fetching email template groups:", error);
    }
  }

  async function persistTemplateToApi(templateData, updateId) {
    const response = updateId
      ? await fetch(`${API_URL}/api/email-templates/${updateId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(templateData),
        })
      : await fetch(`${API_URL}/api/email-templates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(templateData),
        });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || "Failed to save template");
    }

    const savedData = await response.json();
    await fetchTemplates();
    return savedData;
  }

  async function saveTemplate() {
    if (!templateName.trim()) {
      alert("Please enter a template name");
      return;
    }

    try {
      const templateData = {
        name: templateName.trim(),
        template_group: templateGroup,
        subject: subject.trim(),
        body: body.trim(),
      };

      const savedData = await persistTemplateToApi(templateData, selectedTemplateId);
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
      setTemplateName("");
      setTemplateGroup("Misc");
      setSubject("");
      setBody("");
      await fetchTemplates();
      alert("Template deleted successfully");
    } catch (error) {
      console.error("Error deleting template:", error);
      alert(`Error deleting template: ${error.message}`);
    }
  }

  function handleNewTemplate() {
    setCopySourceTemplateId(null);
    setTemplateDetailsModalMode("new");
    setModalDraftName("");
    setModalDraftGroup("Misc");
    setShowTemplateDetailsModal(true);
  }

  function handleCopyTemplate() {
    if (!selectedTemplateId) {
      alert("Select a template in the list to copy.");
      return;
    }
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) {
      alert("Template not found.");
      return;
    }
    const rawGroup = String(template.template_group || "").trim();
    const g = rawGroup || getTemplateSection(template.name);
    setCopySourceTemplateId(template.id);
    setTemplateDetailsModalMode("copy");
    setModalDraftName(String(template.name || ""));
    setModalDraftGroup(g);
    setShowTemplateDetailsModal(true);
  }

  function closeTemplateDetailsModal() {
    setShowTemplateDetailsModal(false);
    setCopySourceTemplateId(null);
  }

  function openEditTemplateDetails() {
    setTemplateDetailsModalMode("edit");
    setModalDraftName(templateName);
    setModalDraftGroup(templateGroup);
    setShowTemplateDetailsModal(true);
  }

  function handleModalGroupChange(value) {
    if (value === ADD_NEW_GROUP_VALUE) {
      setNewGroupName("");
      setShowAddGroupModal(true);
      return;
    }
    setModalDraftGroup(value);
  }

  function confirmTemplateDetailsModal() {
    const n = modalDraftName.trim();
    if (!n) {
      alert("Please enter a template name");
      return;
    }
    const taken = templates.some(
      (t) =>
        String(t.name || "").trim().toLowerCase() === n.toLowerCase() &&
        (templateDetailsModalMode === "edit" ? t.id !== selectedTemplateId : true)
    );
    if (taken) {
      alert("That template name is already in use. Choose a different name.");
      return;
    }

    if (templateDetailsModalMode === "copy") {
      const src = templates.find((t) => t.id === copySourceTemplateId);
      if (!src) {
        alert("Source template no longer exists.");
        closeTemplateDetailsModal();
        return;
      }
      const templateData = {
        name: n,
        template_group: modalDraftGroup,
        subject: String(src.subject || "").trim(),
        body: String(src.body || "").trim(),
      };
      void (async () => {
        try {
          const savedData = await persistTemplateToApi(templateData, null);
          setTemplateName(String(savedData.name || n).trim());
          const rawG = String(savedData.template_group || "").trim();
          setTemplateGroup(rawG || modalDraftGroup);
          setSubject(savedData.subject || "");
          setBody(savedData.body || "");
          setSelectedTemplateId(savedData.id);
          setCopySourceTemplateId(null);
          setShowTemplateDetailsModal(false);
          const sec = rawG || getTemplateSection(savedData.name);
          if (sec) setOpenSection(sec);
          alert("Template copied and saved");
        } catch (error) {
          console.error("Error saving copied template:", error);
          alert(`Error saving template: ${error.message}`);
        }
      })();
      return;
    }

    setTemplateName(n);
    setTemplateGroup(modalDraftGroup);
    if (templateDetailsModalMode === "new") {
      setSelectedTemplateId(null);
      setSubject("");
      setBody("");
    }
    setShowTemplateDetailsModal(false);
  }

  function insertToken(field, token) {
    const tokenText = `{${token}}`;
    if (field === "subject") {
      const currentValue = subject || "";
      setSubject(currentValue + tokenText);
    } else if (field === "body") {
      const currentValue = body || "";
      setBody(currentValue + tokenText);
    }
  }

  const allSections = useMemo(
    () => [...TEMPLATE_SECTIONS, ...customGroups.filter((g) => !TEMPLATE_SECTIONS.includes(g))],
    [customGroups]
  );

  const groupedTemplates = useMemo(() => {
    const grouped = {};
    allSections.forEach((s) => {
      grouped[s] = [];
    });
    templates.forEach((template) => {
      const raw = String(template?.template_group || "").trim();
      const section = raw || getTemplateSection(template.name);
      if (!grouped[section]) grouped[section] = [];
      grouped[section].push(template);
    });
    Object.keys(grouped).forEach((section) => {
      grouped[section].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    });
    return grouped;
  }, [templates, allSections]);

  function toggleSection(sectionName) {
    setOpenSection((prev) => (prev === sectionName ? null : sectionName));
  }

  async function handleCreateNewGroup() {
    const v = newGroupName.trim();
    if (!v) return;
    if (v === ADD_NEW_GROUP_VALUE) return;
    if (TEMPLATE_SECTIONS.includes(v)) {
      if (showTemplateDetailsModal) setModalDraftGroup(v);
      else setTemplateGroup(v);
      setOpenSection(v);
      setShowAddGroupModal(false);
      setNewGroupName("");
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/email-template-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: v }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to add group");
      }
      await fetchTemplateGroups();
      if (showTemplateDetailsModal) setModalDraftGroup(v);
      else setTemplateGroup(v);
      setOpenSection(v);
      setShowAddGroupModal(false);
      setNewGroupName("");
    } catch (error) {
      console.error("Error adding template group:", error);
      alert(`Error adding group: ${error.message}`);
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
    <>
      <div style={{ width: "100%", height: "100%", display: "flex", gap: "24px", padding: "24px 32px", boxSizing: "border-box", overflow: "hidden" }}>
      {/* Column 1 - Template List */}
      <div style={{ width: "33.33%", display: "flex", flexDirection: "column", gap: "16px", height: "100%", overflow: "hidden" }}>
        <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: 0, color: MONUMENT, flexShrink: 0 }}>
          Email Templates
        </h2>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: "8px",
            flexShrink: 0,
            flexWrap: "nowrap",
            alignItems: "stretch",
            minWidth: 0,
          }}
        >
          <button
            type="button"
            onClick={handleNewTemplate}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              padding: "10px 6px",
              fontSize: "0.75rem",
              lineHeight: 1.2,
              fontWeight: 500,
              color: WHITE,
              background: MONUMENT,
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            New Template
          </button>
          <button
            type="button"
            disabled={!selectedTemplateId}
            onClick={handleCopyTemplate}
            title={!selectedTemplateId ? "Select a template in the list first" : undefined}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              padding: "10px 6px",
              fontSize: "0.75rem",
              lineHeight: 1.2,
              fontWeight: 500,
              color: MONUMENT,
              background: WHITE,
              border: `1px solid ${SECTION_GREY}`,
              borderRadius: "8px",
              cursor: selectedTemplateId ? "pointer" : "not-allowed",
              opacity: selectedTemplateId ? 1 : 0.65,
            }}
          >
            Copy Template
          </button>
          <button
            type="button"
            disabled={!selectedTemplateId}
            onClick={deleteTemplate}
            title={!selectedTemplateId ? "Select a template in the list first" : undefined}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              padding: "10px 6px",
              fontSize: "0.75rem",
              lineHeight: 1.2,
              fontWeight: 500,
              color: WHITE,
              background: selectedTemplateId ? "#c62828" : "#e57373",
              border: "none",
              borderRadius: "8px",
              cursor: selectedTemplateId ? "pointer" : "not-allowed",
              opacity: selectedTemplateId ? 1 : 0.65,
            }}
          >
            Delete Template
          </button>
        </div>
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
            allSections.map((section) => {
              const sectionTemplates = groupedTemplates[section] || [];
              const isExpanded = openSection === section;
              return (
                <div key={section} style={{ marginBottom: "8px" }}>
                  <button
                    type="button"
                    onClick={() => toggleSection(section)}
                    style={{
                      width: "100%",
                      padding: "8px 8px",
                      borderRadius: "10px",
                      border: "2px solid #000",
                      background: "#A6C9EC",
                      color: "#404049",
                      cursor: "pointer",
                      fontSize: "0.95rem",
                      fontWeight: 500,
                      lineHeight: 1.4,
                      letterSpacing: "0.5px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      textAlign: "left",
                    }}
                  >
                    <span>{section}</span>
                    <span style={{ fontWeight: 500, color: "#404049", fontSize: "0.95rem", letterSpacing: "0.5px", opacity: 0.85 }}>
                      {sectionTemplates.length} {isExpanded ? "▾" : "▸"}
                    </span>
                  </button>
                  {isExpanded && (
                    <div style={{ marginTop: "8px" }}>
                      {sectionTemplates.length === 0 ? (
                        <div
                          style={{
                            color: "#32323399",
                            fontSize: "0.85rem",
                            fontStyle: "italic",
                            padding: "4px 2px 8px 2px",
                          }}
                        >
                          No templates in this section
                        </div>
                      ) : (
                        sectionTemplates.map((template) => {
                          const isSel = selectedTemplateId === template.id;
                          return (
                            <div
                              key={template.id}
                              onClick={() => setSelectedTemplateId(template.id)}
                              style={{
                                padding: "10px",
                                marginBottom: "8px",
                                borderRadius: "10px",
                                cursor: "pointer",
                                background: isSel ? "#92D050" : "transparent",
                                border: isSel ? "2px solid #000" : "1px solid transparent",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 500,
                                  color: isSel ? WHITE : MONUMENT,
                                  fontSize: "0.95rem",
                                }}
                              >
                                {template.name}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Column 2 - Subject (name & group are set via modal) */}
      <div style={{ width: "33.33%", display: "flex", flexDirection: "column", gap: "16px", height: "100%", overflow: "hidden" }}>
        <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: 0, color: MONUMENT, flexShrink: 0 }}>
          Send / Receive
        </h2>
        {(selectedTemplateId || templateName.trim()) && (
          <div style={{ flexShrink: 0 }}>
            <h2 style={{ fontSize: "1.15rem", marginTop: 0, marginBottom: "6px", color: MONUMENT }}>
              {selectedTemplateId ? "Edit Template" : "New Template"}
            </h2>
            <div style={{ fontSize: "0.88rem", color: "#323233cc", lineHeight: 1.45, marginBottom: "8px" }}>
              <div>
                <span style={{ color: "#32323399" }}>Name:</span> {templateName}
              </div>
              <div>
                <span style={{ color: "#32323399" }}>Group:</span> {templateGroup}
              </div>
              <button
                type="button"
                onClick={openEditTemplateDetails}
                style={{
                  marginTop: "8px",
                  padding: "6px 10px",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: WHITE,
                  border: `1px solid ${SECTION_GREY}`,
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                Change name & group
              </button>
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", overflowY: "auto", flex: 1, minHeight: 0 }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "auto" }}>
            <button
              type="button"
              disabled={testSending}
              onClick={sendFormattingTestEmail}
              style={{
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                color: MONUMENT,
                background: WHITE,
                border: `2px solid ${MONUMENT}`,
                borderRadius: "8px",
                cursor: testSending ? "wait" : "pointer",
                opacity: testSending ? 0.75 : 1,
              }}
            >
              {testSending ? "Sending test…" : "Send formatting test email"}
            </button>
            <button
              type="button"
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
            onClick={() => insertToken("body", "Draftsperson")}
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
            {"{Draftsperson}"}
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
          <button
            type="button"
            onClick={() => insertToken("body", "ColourConsultant")}
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
            {"{ColourConsultant}"}
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
      {showTemplateDetailsModal && (
        <div
          role="presentation"
          onClick={closeTemplateDetailsModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3800,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-details-modal-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeTemplateDetailsModal();
            }}
            style={{
              width: "min(460px, 92vw)",
              background: WHITE,
              borderRadius: "10px",
              padding: "16px",
              boxSizing: "border-box",
              border: `1px solid ${SECTION_GREY}`,
            }}
          >
            <h3
              id="template-details-modal-title"
              style={{ margin: "0 0 12px 0", color: MONUMENT, fontSize: "1.05rem" }}
            >
              {templateDetailsModalMode === "edit" ? "Name & group" : "New template"}
            </h3>
            <label
              style={{
                display: "block",
                fontSize: "0.9rem",
                color: "#32323399",
                marginBottom: "6px",
                fontWeight: 500,
              }}
            >
              Template name
            </label>
            <input
              type="text"
              value={modalDraftName}
              onChange={(e) => setModalDraftName(e.target.value)}
              placeholder="Enter template name"
              onKeyDown={(e) => {
                if (e.key === "Escape") closeTemplateDetailsModal();
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: `1px solid ${SECTION_GREY}`,
                fontSize: "1rem",
                color: MONUMENT,
                boxSizing: "border-box",
                marginBottom: "14px",
              }}
            />
            <label
              style={{
                display: "block",
                fontSize: "0.9rem",
                color: "#32323399",
                marginBottom: "6px",
                fontWeight: 500,
              }}
            >
              Group
            </label>
            <select
              value={modalDraftGroup}
              onChange={(e) => handleModalGroupChange(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: `1px solid ${SECTION_GREY}`,
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
                marginBottom: "16px",
              }}
            >
              {!allSections.includes(modalDraftGroup) && modalDraftGroup ? (
                <option value={modalDraftGroup}>{modalDraftGroup}</option>
              ) : null}
              {allSections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
              <option value={ADD_NEW_GROUP_VALUE}>Add New Group...</option>
            </select>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={closeTemplateDetailsModal}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  background: WHITE,
                  color: MONUMENT,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTemplateDetailsModal}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "none",
                  background: MONUMENT,
                  color: WHITE,
                  cursor: "pointer",
                }}
              >
                {templateDetailsModalMode === "edit" ? "Save" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddGroupModal && (
        <div
          onClick={() => setShowAddGroupModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 4100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(460px, 92vw)",
              background: WHITE,
              borderRadius: "10px",
              padding: "16px",
              boxSizing: "border-box",
              border: `1px solid ${SECTION_GREY}`,
            }}
          >
            <h3 style={{ margin: "0 0 10px 0", color: MONUMENT, fontSize: "1.05rem" }}>Add New Group</h3>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name (e.g. Variations)"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateNewGroup();
                if (e.key === "Escape") setShowAddGroupModal(false);
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: `1px solid ${SECTION_GREY}`,
                fontSize: "1rem",
                color: MONUMENT,
                boxSizing: "border-box",
                marginBottom: "12px",
              }}
            />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowAddGroupModal(false)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  background: WHITE,
                  color: MONUMENT,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNewGroup}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "none",
                  background: MONUMENT,
                  color: WHITE,
                  cursor: "pointer",
                }}
              >
                Add Group
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
