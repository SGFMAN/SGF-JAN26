import React, { useState, useEffect, useMemo, useRef } from "react";

import { UI, STREAM } from "../utils/uiThemeTokens.js";
import EmailBodyEditor, { editorHtmlToStored, normalizeBodyHtmlForEditor } from "../components/EmailBodyEditor.jsx";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import { fetchProjectsList } from "../utils/projectsListCache.js";
import { DRAFTSPERSON_UNASSIGNED } from "../utils/draftspersonSentinel";
import { getUserPrimaryPositionName } from "../utils/userPosition";
import { replaceLoggedInUserEmailTokens, replaceStreamEmailToken } from "../utils/emailUserTokens";
import { replaceContractAndColorStatusTokens } from "../utils/designPhaseStatusTiles";
import {
  formatDepositPaidToken,
  formatDepositStatusToken,
  replaceDepositBalanceToken,
} from "../utils/projectDeposit";
import { convertEmailBodyNewlinesToBr } from "../utils/emailBodyNewlines";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const VIC_BLUE_LIGHT = STREAM.vicBlueLight;
const API_URL = "";
const TEMPLATE_TEST_EMAIL_TO = "ben@superiorgrannyflats.com.au";
const TEMPLATE_SECTIONS = ["Colours", "Drawings", "New Project", "Misc"];
const ADD_NEW_GROUP_VALUE = "__add_new_group__";

function firstSmtpFromAddress(settings) {
  for (let i = 1; i <= 16; i += 1) {
    const raw = settings?.[`smtp_user_${i}`];
    if (raw != null && String(raw).trim()) return String(raw).trim();
  }
  return "";
}

function projectPickerLabel(project) {
  const addr = [project?.street, project?.suburb].filter(Boolean).join(", ") || project?.name || "Untitled";
  const stream = String(project?.stream || "").trim();
  return stream ? `${addr} — ${stream}` : addr;
}

function draftspersonTokenName(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s.toLowerCase() === DRAFTSPERSON_UNASSIGNED.toLowerCase()) return "";
  return s;
}

function colourConsultantNamesFromUsers(users) {
  const names = (Array.isArray(users) ? users : [])
    .filter((user) =>
      (user.positions || []).some((position) => String(position?.name || "").toLowerCase() === "colour consultant")
    )
    .map((user) => String(user.name || "").trim())
    .filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

async function fetchUsersList() {
  try {
    const response = await fetch(`${API_URL}/api/users`);
    if (!response.ok) return [];
    const users = await response.json();
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

async function salespersonDetailsFromUsers(users, salespersonName) {
  const want = String(salespersonName || "").trim().toLowerCase();
  if (!want) return { position: "", phone: "", email: "" };
  const user = users.find((u) => String(u.name || "").trim().toLowerCase() === want);
  if (!user) return { position: "", phone: "", email: "" };
  return {
    position: getUserPrimaryPositionName(user),
    phone: user.phone || "",
    email: user.email || "",
  };
}

async function applyTemplateTestTokens(text, project, opts = {}) {
  if (!text) return text || "";
  if (!project) return text;
  const html = !!opts.html;
  let replaced = String(text);

  replaced = replaced.replace(/{ProjectName}/g, project.name || "");
  replaced = replaceStreamEmailToken(replaced, project);
  replaced = replaced.replace(/{ClientName}/g, project.client_name || "");
  replaced = replaced.replace(
    /{ProjectCost}/g,
    project.project_cost ? `$${Number(project.project_cost).toLocaleString()}` : ""
  );
  replaced = replaced.replace(/{Street}/g, project.street || "");
  replaced = replaced.replace(/{Suburb}/g, project.suburb || "");
  replaced = replaced.replace(/{DepositPaid}/g, formatDepositPaidToken(project));
  replaced = replaced.replace(/{DepositStatus}/g, formatDepositStatusToken(project));
  replaced = await replaceDepositBalanceToken(replaced, project, opts.settings, API_URL);
  replaced = replaced.replace(
    /{Contact1}/g,
    project.client1_email && project.client1_active ? project.client1_email : ""
  );
  replaced = replaced.replace(
    /{Contact2}/g,
    project.client2_email && project.client2_active ? project.client2_email : ""
  );
  replaced = replaced.replace(
    /{Contact3}/g,
    project.client3_email && project.client3_active ? project.client3_email : ""
  );
  replaced = replaced.replace(/{Salesperson}/g, project.salesperson || "");

  const users = opts.users || [];
  const needsDetails =
    replaced.includes("{SalespersonPosition}") ||
    replaced.includes("{SalespersonPhone}") ||
    replaced.includes("{SalespersonEmail}");
  if (needsDetails) {
    const { position, phone, email } = await salespersonDetailsFromUsers(users, project.salesperson);
    const formattedPosition = position ? (html ? `<br>${position}` : `\n${position}`) : "";
    replaced = replaced.replace(/{SalespersonPosition}/g, formattedPosition);
    replaced = replaced.replace(/{SalespersonPhone}/g, phone);
    replaced = replaced.replace(/{SalespersonEmail}/g, email);
  }

  if (project.site_visit_scheduled_date) {
    const formattedDate = new Date(`${project.site_visit_scheduled_date}T00:00:00`).toLocaleDateString("en-AU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    replaced = replaced.replace(/{SiteVisitScheduledDate}/g, formattedDate);
  } else {
    replaced = replaced.replace(/{SiteVisitScheduledDate}/g, "");
  }
  replaced = replaced.replace(/{SiteVisitScheduledPeriod}/g, project.site_visit_scheduled_period || "");
  replaced = replaced.replace(/{Draftsperson}/g, draftspersonTokenName(project.draftsperson));
  replaced = replaced.replace(/{ColourConsultant}/g, colourConsultantNamesFromUsers(users));
  replaced = replaceContractAndColorStatusTokens(replaced, project);
  replaced = await replaceLoggedInUserEmailTokens(replaced);
  if (html) replaced = convertEmailBodyNewlinesToBr(replaced);
  return replaced;
}

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
  const { runWithEmailOverlay } = useEmailSendOverlay();
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
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testMode, setTestMode] = useState("as-is");
  const [testProjects, setTestProjects] = useState([]);
  const [testProjectSearch, setTestProjectSearch] = useState("");
  const [testProjectToken, setTestProjectToken] = useState("");
  const [testPreviewLoading, setTestPreviewLoading] = useState(false);
  const [testTo, setTestTo] = useState(TEMPLATE_TEST_EMAIL_TO);
  const [testFrom, setTestFrom] = useState("");
  const [testSubject, setTestSubject] = useState("");
  const [testBody, setTestBody] = useState("");
  const bodyEditorRef = useRef(null);
  const testBodyRef = useRef(null);
  const testPreviewGenRef = useRef(0);

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

  useEffect(() => {
    if (testModalOpen && testBodyRef.current && testBody != null) {
      if (testBodyRef.current.innerHTML !== testBody) {
        testBodyRef.current.innerHTML = testBody;
      }
    }
  }, [testModalOpen, testBody]);

  const filteredTestProjects = useMemo(() => {
    const q = testProjectSearch.trim().toLowerCase();
    const list = Array.isArray(testProjects) ? testProjects : [];
    const matched = q
      ? list.filter((p) => {
          const hay = [p.street, p.suburb, p.name, p.client_name, p.stream, p.state]
            .map((v) => String(v || "").toLowerCase())
            .join(" ");
          return hay.includes(q);
        })
      : list;
    return matched
      .slice()
      .sort((a, b) => projectPickerLabel(a).localeCompare(projectPickerLabel(b)))
      .slice(0, 200);
  }, [testProjects, testProjectSearch]);

  const testProjectSelectOptions = useMemo(() => {
    const selected = testProjects.find((p) => p.access_token === testProjectToken);
    if (selected && !filteredTestProjects.some((p) => p.access_token === testProjectToken)) {
      return [selected, ...filteredTestProjects];
    }
    return filteredTestProjects;
  }, [filteredTestProjects, testProjects, testProjectToken]);

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

  async function rawTemplateSubject() {
    return subject.trim() || "(no subject)";
  }

  function rawTemplateBody() {
    return editorHtmlToStored(body) || "<p>(empty body)</p>";
  }

  function closeTestModal() {
    if (testSending) return;
    setTestModalOpen(false);
    setTestPreviewLoading(false);
  }

  async function openFormattingTestModal() {
    const subj = `[Template test] ${await rawTemplateSubject()}`;
    const bodyContent = rawTemplateBody();
    setTestMode("as-is");
    setTestProjectSearch("");
    setTestProjectToken("");
    setTestTo(TEMPLATE_TEST_EMAIL_TO);
    setTestSubject(subj);
    setTestBody(normalizeBodyHtmlForEditor(bodyContent));
    setTestPreviewLoading(false);
    setTestModalOpen(true);

    try {
      const [settingsRes, projects] = await Promise.all([
        fetch(`${API_URL}/api/settings`),
        fetchProjectsList({ view: "lite" }).catch(() => []),
      ]);
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      const fromAddr = firstSmtpFromAddress(settings);
      setTestFrom(fromAddr);
      setTestProjects(Array.isArray(projects) ? projects : []);
      if (!fromAddr) {
        alert(
          "No SMTP From address found. Configure at least one SMTP user (e.g. smtp_user_1) in Settings before sending a test."
        );
      }
    } catch (e) {
      console.error("Open template test modal:", e);
    }
  }

  async function applyAsIsPreview() {
    const subj = `[Template test] ${await rawTemplateSubject()}`;
    setTestSubject(subj);
    setTestBody(normalizeBodyHtmlForEditor(rawTemplateBody()));
    setTestPreviewLoading(false);
  }

  async function applyProjectPreview(accessToken) {
    const gen = ++testPreviewGenRef.current;
    const sourceSubject = `[Template test] ${await rawTemplateSubject()}`;
    const sourceBody = rawTemplateBody();
    if (!accessToken) {
      setTestSubject(sourceSubject);
      setTestBody(normalizeBodyHtmlForEditor(sourceBody));
      setTestPreviewLoading(false);
      return;
    }
    setTestPreviewLoading(true);
    try {
      const [projectRes, settingsRes, users] = await Promise.all([
        fetch(`${API_URL}/api/projects/${accessToken}`),
        fetch(`${API_URL}/api/settings`),
        fetchUsersList(),
      ]);
      if (gen !== testPreviewGenRef.current) return;
      if (!projectRes.ok) throw new Error("Failed to load project");
      const project = await projectRes.json();
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      const nextSubject = await applyTemplateTestTokens(sourceSubject, project, { settings, users });
      const nextBody = await applyTemplateTestTokens(sourceBody, project, {
        html: true,
        settings,
        users,
      });
      if (gen !== testPreviewGenRef.current) return;
      setTestSubject(nextSubject);
      setTestBody(normalizeBodyHtmlForEditor(nextBody));
    } catch (e) {
      if (gen !== testPreviewGenRef.current) return;
      console.error("Template test project preview:", e);
      alert(e.message || "Failed to load project tokens.");
      setTestSubject(sourceSubject);
      setTestBody(normalizeBodyHtmlForEditor(sourceBody));
    } finally {
      if (gen === testPreviewGenRef.current) setTestPreviewLoading(false);
    }
  }

  function handleTestModeChange(mode) {
    setTestMode(mode);
    if (mode === "as-is") {
      testPreviewGenRef.current += 1;
      applyAsIsPreview();
      return;
    }
    applyProjectPreview(testProjectToken);
  }

  function handleTestProjectChange(accessToken) {
    setTestProjectToken(accessToken);
    if (testMode === "project") applyProjectPreview(accessToken);
  }

  async function sendFormattingTestFromModal() {
    if (testMode === "project" && !testProjectToken) {
      alert("Select a project to fill tokens, or choose Send as is.");
      return;
    }
    const toAddresses = String(testTo || "")
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    if (toAddresses.length === 0) {
      alert("Please enter at least one email address");
      return;
    }
    if (!testFrom || !String(testFrom).trim()) {
      alert(
        "No SMTP From address found. Configure at least one SMTP user (e.g. smtp_user_1) in Settings before sending a test."
      );
      return;
    }
    try {
      setTestSending(true);
      await runWithEmailOverlay(async () => {
        const res = await fetch(`${API_URL}/api/emails/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: toAddresses,
            from: testFrom.trim(),
            subject: testSubject || "(no subject)",
            htmlBody: testBody || "<p>(empty body)</p>",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Send failed (${res.status})`);
        alert(data.message || `Test email sent to ${toAddresses.join(", ")}`);
      });
      setTestModalOpen(false);
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
        body: editorHtmlToStored(body),
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
      if (bodyEditorRef.current?.insertToken) {
        bodyEditorRef.current.insertToken(tokenText);
      } else {
        setBody((current) => `${current || ""}${tokenText}`);
      }
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
            <div style={{ color: UI.textMuted, fontSize: "0.9rem", fontStyle: "italic" }}>
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
                      color: UI.textSecondary,
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
                    <span style={{ fontWeight: 500, color: UI.textSecondary, fontSize: "0.95rem", letterSpacing: "0.5px", opacity: 0.85 }}>
                      {sectionTemplates.length} {isExpanded ? "▾" : "▸"}
                    </span>
                  </button>
                  {isExpanded && (
                    <div style={{ marginTop: "8px" }}>
                      {sectionTemplates.length === 0 ? (
                        <div
                          style={{
                            color: UI.textMuted,
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
                                  color: isSel ? PAGE_TEXT : MONUMENT,
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
            <div style={{ fontSize: "0.88rem", color: "var(--sgf-text-primary)", lineHeight: 1.45, marginBottom: "8px" }}>
              <div>
                <span style={{ color: UI.textMuted }}>Name:</span> {templateName}
              </div>
              <div>
                <span style={{ color: UI.textMuted }}>Group:</span> {templateGroup}
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
                color: UI.textMuted,
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
              <button
                type="button"
                onClick={() => insertToken("subject", "UserName")}
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
                {"{UserName}"}
              </button>
              <button
                type="button"
                onClick={() => insertToken("subject", "UserPosition")}
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
                {"{UserPosition}"}
              </button>
              <button
                type="button"
                onClick={() => insertToken("subject", "UserEmail")}
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
                {"{UserEmail}"}
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
              onClick={openFormattingTestModal}
              style={{
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                color: MONUMENT,
                background: WHITE,
                border: `2px solid ${UI.outline}`,
                borderRadius: "8px",
                cursor: testSending ? "wait" : "pointer",
                opacity: testSending ? 0.75 : 1,
              }}
            >
              Send formatting test email
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
            onClick={() => bodyEditorRef.current?.insertLink?.()}
            style={{
              padding: "6px 12px",
              fontSize: "0.85rem",
              fontWeight: 500,
              color: MONUMENT,
              background: VIC_BLUE_LIGHT,
              border: `1px solid ${SECTION_GREY}`,
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            [LINK]
          </button>
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
            onClick={() => insertToken("body", "Stream")}
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
            {"{Stream}"}
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
            onClick={() => insertToken("body", "DepositBalance")}
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
            {"{DepositBalance}"}
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
            onClick={() => insertToken("body", "UserName")}
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
            {"{UserName}"}
          </button>
          <button
            type="button"
            onClick={() => insertToken("body", "UserPosition")}
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
            {"{UserPosition}"}
          </button>
          <button
            type="button"
            onClick={() => insertToken("body", "UserEmail")}
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
            {"{UserEmail}"}
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
          <button
            type="button"
            onClick={() => insertToken("body", "Contract Status")}
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
            {"{Contract Status}"}
          </button>
          <button
            type="button"
            onClick={() => insertToken("body", "Color Status")}
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
            {"{Color Status}"}
          </button>
        </div>
        <EmailBodyEditor
          ref={bodyEditorRef}
          value={body}
          onChange={setBody}
          placeholder="Type the email body. Press Enter for a new line (twice for a blank line). Use the toolbar for Bold, Italic, and Underline."
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
                color: UI.textMuted,
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
                color: UI.textMuted,
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
                  color: PAGE_TEXT,
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
                  color: PAGE_TEXT,
                  cursor: "pointer",
                }}
              >
                Add Group
              </button>
            </div>
          </div>
        </div>
      )}
      {testModalOpen && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3900,
            pointerEvents: "auto",
            padding: "16px",
            boxSizing: "border-box",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-test-modal-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !testSending) closeTestModal();
            }}
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "800px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
              boxSizing: "border-box",
              position: "relative",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
                paddingRight: "36px",
              }}
            >
              <h2 id="template-test-modal-title" style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>
                Preview & Send Email
              </h2>
              <button
                type="button"
                onClick={closeTestModal}
                disabled={testSending}
                aria-label="Close"
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: testSending ? "wait" : "pointer",
                  color: MONUMENT,
                  width: "40px",
                  height: "40px",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "8px", fontWeight: 500 }}>
                  Test using
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: MONUMENT }}>
                    <input
                      type="radio"
                      name="template-test-mode"
                      checked={testMode === "as-is"}
                      onChange={() => handleTestModeChange("as-is")}
                    />
                    Send as is (leave tokens unchanged)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: MONUMENT }}>
                    <input
                      type="radio"
                      name="template-test-mode"
                      checked={testMode === "project"}
                      onChange={() => handleTestModeChange("project")}
                    />
                    Use a project to fill tokens
                  </label>
                </div>
              </div>

              {testMode === "project" && (
                <div>
                  <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                    Project
                  </label>
                  <input
                    type="search"
                    value={testProjectSearch}
                    onChange={(e) => setTestProjectSearch(e.target.value)}
                    placeholder="Search street, suburb, client or stream"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${SECTION_GREY}`,
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                      marginBottom: "8px",
                    }}
                  />
                  <select
                    value={testProjectToken}
                    onChange={(e) => handleTestProjectChange(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: `1px solid ${SECTION_GREY}`,
                      fontSize: "1rem",
                      fontFamily: "inherit",
                      color: MONUMENT,
                      background: WHITE,
                      cursor: "pointer",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="">Select a project…</option>
                    {testProjectSelectOptions.map((p) => {
                      const token = p.access_token || "";
                      if (!token) return null;
                      return (
                        <option key={token} value={token}>
                          {projectPickerLabel(p)}
                        </option>
                      );
                    })}
                  </select>
                  {testPreviewLoading && (
                    <div style={{ marginTop: "8px", fontSize: "0.85rem", color: UI.textMuted }}>
                      Converting tokens…
                    </div>
                  )}
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  To (comma-separated)
                </label>
                <input
                  type="text"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  From
                </label>
                <input
                  type="text"
                  value={testFrom}
                  onChange={(e) => setTestFrom(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={testSubject}
                  onChange={(e) => setTestSubject(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  Body
                </label>
                <div
                  ref={testBodyRef}
                  contentEditable={!testPreviewLoading}
                  onInput={(e) => setTestBody(e.currentTarget.innerHTML)}
                  onBlur={(e) => setTestBody(e.currentTarget.innerHTML)}
                  style={{
                    width: "100%",
                    minHeight: "220px",
                    padding: "12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "0.9rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    lineHeight: "1.6",
                    outline: "none",
                    opacity: testPreviewLoading ? 0.65 : 1,
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={closeTestModal}
                  disabled={testSending}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: MONUMENT,
                    background: "transparent",
                    border: `1px solid ${SECTION_GREY}`,
                    borderRadius: "8px",
                    cursor: testSending ? "wait" : "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={sendFormattingTestFromModal}
                  disabled={testSending || testPreviewLoading || (testMode === "project" && !testProjectToken)}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: WHITE,
                    background: MONUMENT,
                    border: "none",
                    borderRadius: "8px",
                    cursor:
                      testSending || testPreviewLoading || (testMode === "project" && !testProjectToken)
                        ? "wait"
                        : "pointer",
                    opacity:
                      testSending || testPreviewLoading || (testMode === "project" && !testProjectToken) ? 0.7 : 1,
                  }}
                >
                  {testSending ? "Sending…" : "Send Email"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
