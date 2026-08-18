import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { projectPath } from "../utils/projectUrl";
import { useEmailSendOverlay } from "../components/EmailSendOverlay";
import { PROCESS_RULES, getRequirementStatus, getUnmetRequirements, getMetRequirements } from "../utils/ProcessRules";
import { DRAFTSPERSON_UNASSIGNED } from "../utils/draftspersonSentinel";
import { getUserPrimaryPositionName } from "../utils/userPosition";
import { replaceLoggedInUserEmailTokens } from "../utils/emailUserTokens";
import { replaceContractAndColorStatusTokens } from "../utils/designPhaseStatusTiles";
import { normalizeBodyHtmlForEditor } from "../components/EmailBodyEditor.jsx";
import {
  formatDepositPaidToken,
  formatDepositStatusToken,
  replaceDepositBalanceToken,
  isOverviewDepositComplete,
  getAnyDepositAmountPaid,
} from "../utils/projectDeposit";
import {
  resolveNewProjectClientFrom,
  resolveNewProjectClientToEmails,
  findSalespersonUserInList,
} from "../utils/streamNewProjectEmail";
import "./Overview.css";

import { UI, STREAM, INDICATOR } from "../utils/uiThemeTokens.js";
import { getOverviewIndicatorStyle } from "../utils/uiButtonStyles.js";
import DesignPhaseStatusPanel from "../components/DesignPhaseStatusPanel.jsx";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const API_URL = "";

/** Match Project Info box headings (Notes, Project Log, Status, etc.). */

export default function Overview({ project }) {
  const { runWithEmailOverlay } = useEmailSendOverlay();
  const navigate = useNavigate();
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewTo, setPreviewTo] = useState("");
  const [previewFrom, setPreviewFrom] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewBody, setPreviewBody] = useState("");
  const previewBodyRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [displayedTexts, setDisplayedTexts] = useState({}); // Store word-by-word displayed text for each result
  const [isTyping, setIsTyping] = useState(false);
  const [isPrintingText, setIsPrintingText] = useState(false); // Track if text is actively being printed
  const [fullResults, setFullResults] = useState([]); // Store full results before typewriter effect
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [, setUiButtonStyleRevision] = useState(0);
  const typingTimeoutRef = useRef(null);
  const typewriterIntervalRef = useRef(null);
  const fullResultsRef = useRef([]);

  useEffect(() => {
    fetchEmailTemplates();
  }, []);

  useEffect(() => {
    if (previewModalOpen && previewBodyRef.current && previewBody) {
      if (previewBodyRef.current.innerHTML !== previewBody) {
        previewBodyRef.current.innerHTML = previewBody;
      }
    }
  }, [previewModalOpen, previewBody]);

  useEffect(() => {
    const refresh = () => setUiButtonStyleRevision((n) => n + 1);
    window.addEventListener("sgf-ui-button-styles-change", refresh);
    window.addEventListener("sgf-ui-theme-change", refresh);
    return () => {
      window.removeEventListener("sgf-ui-button-styles-change", refresh);
      window.removeEventListener("sgf-ui-theme-change", refresh);
    };
  }, []);

  // Check if all text printing is complete
  useEffect(() => {
    if (isPrintingText && searchResults.length > 0) {
      const allComplete = searchResults.every(result => {
        const displayed = displayedTexts[result.ruleKey] || "";
        return displayed.length >= result.answer.length;
      });
      if (allComplete) {
        setIsPrintingText(false);
      }
    }
  }, [displayedTexts, searchResults, isPrintingText]);

  // Typewriter effect - wait 2 seconds after typing stops, then display word by word
  useEffect(() => {
    // Clear any existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Clear any existing typewriter intervals
    if (typewriterIntervalRef.current) {
      if (Array.isArray(typewriterIntervalRef.current)) {
        typewriterIntervalRef.current.forEach(interval => clearInterval(interval));
      } else {
        clearInterval(typewriterIntervalRef.current);
      }
      typewriterIntervalRef.current = null;
    }
    
    // Reset displayed texts and results when query changes
    setDisplayedTexts({});
    setSearchResults([]);
    setIsTyping(false);
    setIsPrintingText(false);
    
    if (searchQuery.trim().length > 0) {
      setIsTyping(true);
      
      // Wait 2 seconds after user stops typing
      typingTimeoutRef.current = setTimeout(() => {
        // Check the ref for latest results
        const currentResults = fullResultsRef.current;
        if (currentResults.length > 0) {
          setIsTyping(false);
          setIsPrintingText(true); // Start printing animation
          
          const newDisplayedTexts = {};
          const intervals = [];
          
          // Initialize displayed texts
          currentResults.forEach((result) => {
            newDisplayedTexts[result.ruleKey] = "";
          });
          
          setDisplayedTexts(newDisplayedTexts);
          setSearchResults(currentResults);
          
          // Start typewriter for each result sequentially
          currentResults.forEach((result, resultIndex) => {
            // Split into words and whitespace, preserving both
            // This regex splits on word boundaries but keeps both words and spaces
            const parts = result.answer.split(/(\s+)/).filter(part => part.length > 0);
            // Now split each part further to separate words from spaces
            const tokens = [];
            parts.forEach(part => {
              if (part.trim().length === 0) {
                // It's whitespace, add it as a single token
                tokens.push(part);
              } else {
                // It contains words, split by word boundaries
                const words = part.split(/(\b)/).filter(w => w.length > 0);
                tokens.push(...words);
              }
            });
            // Simplify: just split by spaces and add spaces back
            const simpleTokens = result.answer.split(/(\s+)/).filter(t => t.length > 0);
            let partIndex = 0;
            
            // Delay each result's typewriter by a bit so they don't all start at once
            setTimeout(() => {
              const typeInterval = setInterval(() => {
                setDisplayedTexts(prev => {
                  if (partIndex < simpleTokens.length) {
                    // Get the current token (word or whitespace)
                    const token = simpleTokens[partIndex];
                    const newText = (prev[result.ruleKey] || "") + token;
                    partIndex++;
                    return {
                      ...prev,
                      [result.ruleKey]: newText
                    };
                  } else {
                    clearInterval(typeInterval);
                    // Remove from intervals array when done
                    const index = intervals.indexOf(typeInterval);
                    if (index > -1) {
                      intervals.splice(index, 1);
                    }
                    return prev;
                  }
                });
              }, 80); // Display one word/whitespace every 80ms
              
              intervals.push(typeInterval);
              typewriterIntervalRef.current = intervals;
            }, resultIndex * 100); // Stagger each result by 100ms
          });
        } else {
          setIsTyping(false);
          setIsPrintingText(false);
        }
      }, 2000);
    }
    
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (typewriterIntervalRef.current) {
        if (Array.isArray(typewriterIntervalRef.current)) {
          typewriterIntervalRef.current.forEach(interval => clearInterval(interval));
        } else {
          clearInterval(typewriterIntervalRef.current);
        }
      }
    };
  }, [searchQuery]);

  async function fetchEmailTemplates() {
    try {
      const response = await fetch(`${API_URL}/api/email-templates`);
      if (!response.ok) {
        throw new Error("Failed to fetch email templates");
      }
      const data = await response.json();
      setEmailTemplates(data || []);
    } catch (error) {
      console.error("Error fetching email templates:", error);
      setEmailTemplates([]);
    }
  }

  /** Fetch salesperson details (position, phone, email) by name from users API. */
  async function getSalespersonDetails(salespersonName) {
    if (!salespersonName) return { position: "", phone: "", email: "" };
    try {
      const response = await fetch(`${API_URL}/api/users`);
      if (!response.ok) return { position: "", phone: "", email: "" };
      const users = await response.json();
      const user = users.find((u) => u.name === salespersonName);
      if (!user) return { position: "", phone: "", email: "" };
      const position = getUserPrimaryPositionName(user);
      return {
        position,
        phone: user.phone || "",
        email: user.email || "",
      };
    } catch (error) {
      console.error("Error fetching salesperson details:", error);
      return { position: "", phone: "", email: "" };
    }
  }

  /** Stored display name; omit sentinel from outgoing tokens. */
  function getDraftspersonName(raw) {
    const s = (raw ?? "").toString().trim();
    if (!s || s.toLowerCase() === DRAFTSPERSON_UNASSIGNED.toLowerCase()) return "";
    return s;
  }

  async function replaceTokens(text, project, opts = {}) {
    if (!text || !project) return text;
    const html = !!opts.html;

    let replaced = text;

    replaced = replaced.replace(/{ProjectName}/g, project.name || "");
    replaced = replaced.replace(/{ClientName}/g, project.client_name || "");
    replaced = replaced.replace(/{ProjectCost}/g, project.project_cost ? `$${project.project_cost.toLocaleString()}` : "");
    replaced = replaced.replace(/{Street}/g, project.street || "");
    replaced = replaced.replace(/{Suburb}/g, project.suburb || "");

    replaced = replaced.replace(/{DepositPaid}/g, formatDepositPaidToken(project));
    replaced = replaced.replace(/{DepositStatus}/g, formatDepositStatusToken(project));
    replaced = await replaceDepositBalanceToken(replaced, project, opts.settings, API_URL);

    replaced = replaced.replace(/{Contact1}/g, project.client1_email && project.client1_active ? project.client1_email : "");
    replaced = replaced.replace(/{Contact2}/g, project.client2_email && project.client2_active ? project.client2_email : "");
    replaced = replaced.replace(/{Contact3}/g, project.client3_email && project.client3_active ? project.client3_email : "");
    replaced = replaced.replace(/{Salesperson}/g, project.salesperson || "");

    const needsDetails =
      replaced.includes("{SalespersonPosition}") ||
      replaced.includes("{SalespersonPhone}") ||
      replaced.includes("{SalespersonEmail}");
    if (needsDetails) {
      const { position, phone, email } = await getSalespersonDetails(project.salesperson);
      const formattedPosition = position
        ? html
          ? `<br>${position}`
          : `\n${position}`
        : "";
      replaced = replaced.replace(/{SalespersonPosition}/g, formattedPosition);
      replaced = replaced.replace(/{SalespersonPhone}/g, phone);
      replaced = replaced.replace(/{SalespersonEmail}/g, email);
    }

    // Site Visit Scheduled Date
    if (project.site_visit_scheduled_date) {
      const formattedDate = new Date(project.site_visit_scheduled_date + "T00:00:00").toLocaleDateString("en-AU", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      replaced = replaced.replace(/{SiteVisitScheduledDate}/g, formattedDate);
    } else {
      replaced = replaced.replace(/{SiteVisitScheduledDate}/g, "");
    }

    // Site Visit Scheduled Period (AM/PM)
    replaced = replaced.replace(/{SiteVisitScheduledPeriod}/g, project.site_visit_scheduled_period || "");

    // Draftsperson
    if (replaced.includes("{Draftsperson}")) {
      const draftspersonName = getDraftspersonName(project.draftsperson);
      replaced = replaced.replace(/{Draftsperson}/g, draftspersonName);
    }

    replaced = replaceContractAndColorStatusTokens(replaced, project);

    return replaceLoggedInUserEmailTokens(replaced);
  }

  async function handleSendTest() {
    if (!selectedTemplateId) {
      alert("Please select an email template");
      return;
    }

    const template = emailTemplates.find(t => t.id === parseInt(selectedTemplateId));
    if (!template) {
      alert("Template not found");
      return;
    }

    const settingsRes = await fetch(`${API_URL}/api/settings`);
    const usersRes = await fetch(`${API_URL}/api/users`);
    const settings = settingsRes.ok ? await settingsRes.json() : {};
    const users = usersRes.ok ? await usersRes.json() : [];
    const salespersonUser = findSalespersonUserInList(users, project?.salesperson);
    const fromAddress = resolveNewProjectClientFrom(settings, project, salespersonUser);
    const toAddresses = resolveNewProjectClientToEmails(settings, project);

    if (toAddresses.length === 0) {
      alert("No valid To addresses found. Configure Settings → Email Settings → General → New Project.");
      return;
    }
    if (!fromAddress || !String(fromAddress).trim()) {
      alert("No valid From address found. Configure Settings → Email Settings → General → New Project.");
      return;
    }

    const subject = await replaceTokens(template.subject || "", project, { settings });
    const htmlBody = await replaceTokens(template.body || "", project, { html: true, settings });

    // Open preview modal with pre-filled data
    setPreviewTo(toAddresses.join(", "));
    setPreviewFrom(fromAddress);
    setPreviewSubject(subject);
    setPreviewBody(normalizeBodyHtmlForEditor(htmlBody));
    setPreviewModalOpen(true);
  }

  async function handleSendFromPreview() {
    const toAddresses = previewTo.split(",").map(a => a.trim()).filter(a => a.length > 0);
    if (toAddresses.length === 0) {
      alert("Please enter at least one email address");
      return;
    }
    if (!previewFrom || !previewFrom.trim()) {
      alert("From address is required");
      return;
    }

    try {
      await runWithEmailOverlay(async () => {
        const res = await fetch(`${API_URL}/api/emails/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: toAddresses,
            from: previewFrom,
            subject: previewSubject,
            htmlBody: previewBody,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Send failed (${res.status})`);
        }
        alert(data.message || "Email sent successfully!");
      });
      setPreviewModalOpen(false);
    } catch (err) {
      console.error("Send email error:", err);
      alert(err.message || "Failed to send email.");
    }
  }
  // Indicator styles — Button 2 red, Button 4 orange, Button 5 green (selected colours)
  const indicatorFallbacks = { red: STREAM.qldRed, orange: INDICATOR.orange, green: STREAM.streamGreen, text: PAGE_TEXT };
  const indicatorRed = () => getOverviewIndicatorStyle("red", indicatorFallbacks);
  const indicatorOrange = () => getOverviewIndicatorStyle("orange", indicatorFallbacks);
  const indicatorGreen = () => getOverviewIndicatorStyle("green", indicatorFallbacks);

  function isDepositFullyPaid() {
    return isOverviewDepositComplete(project);
  }

  // Get drawings status color
  function getDrawingsStatusIndicator() {
    const status = project?.drawings_status || "Not Assigned";
    if (status === "Concept Stage") return indicatorOrange();
    if (status === "Working Drawing Stage") return indicatorOrange();
    if (status === "Drawings Complete") return indicatorGreen();
    return indicatorRed();
  }

  // Get colours status color
  function getColoursStatusIndicator() {
    const status = project?.colours_status || "Not Sent";
    if (status === "Sent") return indicatorOrange();
    if (status === "Complete") return indicatorGreen();
    return indicatorRed();
  }

  // Get window status color
  function getWindowStatusIndicator() {
    const status = project?.window_status || "Not Ordered";
    if (status === "Ordered") return indicatorOrange();
    if (status === "Complete") return indicatorGreen();
    return indicatorRed();
  }

  // Get site visit status color
  function getSiteVisitStatusIndicator() {
    const status = project?.site_visit_status || "Not Complete";
    if (status === "Booked") return indicatorOrange();
    if (status === "Complete") return indicatorGreen();
    return indicatorRed();
  }

  // Get contract status text
  function getContractStatusText() {
    const contractStatus = project?.contract_status || "Not Sent";
    const supportingDocsStatus = project?.supporting_documents_status || "Not Sent";
    const waterDeclStatus = project?.water_declaration_status || "Not Required";

    // Check if all required documents are complete
    const isContractComplete = contractStatus === "Complete";
    const isSupportingDocsComplete = supportingDocsStatus === "Complete";
    // Water declaration is complete if it's "Complete" OR "Not Required"
    const isWaterDeclComplete = waterDeclStatus === "Complete" || waterDeclStatus === "Not Required";

    if (isContractComplete && isSupportingDocsComplete && isWaterDeclComplete) {
      return "All Documents Complete";
    }

    return "Documents Missing";
  }

  function getContractStatusIndicator() {
    const contractStatus = project?.contract_status || "Not Sent";
    const supportingDocsStatus = project?.supporting_documents_status || "Not Sent";
    const waterDeclStatus = project?.water_declaration_status || "Not Required";

    if (
      contractStatus === "Complete" &&
      supportingDocsStatus === "Complete" &&
      (waterDeclStatus === "Complete" || waterDeclStatus === "Not Required")
    ) {
      return indicatorGreen();
    }

    if (contractStatus === "Sent") return indicatorOrange();

    return indicatorRed();
  }

  function getPlanningPermitStatusIndicator() {
    const raw = project?.planning_town_planning ?? project?.planning_status ?? "Not Selected";
    const status = String(raw).trim();
    if (
      status === "Not Required" ||
      status === "Complete" ||
      status === "Completed" ||
      status === "N/A" ||
      status === "No Planning Required" ||
      status === "Planning Permit Issued"
    ) {
      return indicatorGreen();
    }
    if (status === "Incomplete" || status === "Required" || status === "Planning Required") {
      return indicatorOrange();
    }
    return indicatorRed();
  }

  // Get survey and soils status text
  function getSurveySoilsStatusText() {
    const surveyStatus = project?.survey_status || "Not Booked";
    const soilStatus = project?.soil_status || "Not Booked";
    
    if (surveyStatus === "Complete" && soilStatus === "Complete") {
      return "Complete";
    }
    if (surveyStatus === "Not Booked" && soilStatus === "Not Booked") {
      return "Not Booked";
    }
    return "In Progress";
  }

  function getSurveySoilsStatusIndicator() {
    const surveyStatus = project?.survey_status || "Not Booked";
    const soilStatus = project?.soil_status || "Not Booked";
    
    if (surveyStatus === "Not Booked" && soilStatus === "Not Booked") {
      return indicatorRed();
    }
    
    if (surveyStatus === "Complete" && soilStatus === "Complete") {
      return indicatorGreen();
    }
    
    return indicatorOrange();
  }

  // Check if design phase is complete (all required statuses must be green)
  function isDesignPhaseComplete() {
    // Check drawings status - must be "Drawings Complete"
    const drawingsStatus = project?.drawings_status || "Not Assigned";
    if (drawingsStatus !== "Drawings Complete") return false;

    // Check colours status - must be "Complete"
    const coloursStatus = project?.colours_status || "Not Sent";
    if (coloursStatus !== "Complete") return false;

    // Check window status - must be "Complete"
    const windowStatus = project?.window_status || "Not Ordered";
    if (windowStatus !== "Complete") return false;

    // Check site visit status - must be "Complete"
    const siteVisitStatus = project?.site_visit_status || "Not Complete";
    if (siteVisitStatus !== "Complete") return false;

    // Check contract status - all three must be complete
    const contractStatus = project?.contract_status || "Not Sent";
    const supportingDocsStatus = project?.supporting_documents_status || "Not Sent";
    const waterDeclStatus = project?.water_declaration_status || "Not Required";
    if (contractStatus !== "Complete" || 
        supportingDocsStatus !== "Complete" || 
        (waterDeclStatus !== "Complete" && waterDeclStatus !== "Not Required")) {
      return false;
    }

    // Check deposit status - must be fully paid
    if (!isDepositFullyPaid()) return false;

    // Check town planning - must be Not Required or Complete (legacy values also accepted)
    const townPlanningRaw = project?.planning_town_planning ?? project?.planning_status ?? "Not Selected";
    const townPlanning = String(townPlanningRaw).trim();
    const townPlanningOk =
      townPlanning === "Not Required" ||
      townPlanning === "Complete" ||
      townPlanning === "Completed" ||
      townPlanning === "N/A" ||
      townPlanning === "No Planning Required" ||
      townPlanning === "Planning Permit Issued";
    if (!townPlanningOk) return false;

    // Energy / footing / building permit: Complete button sets received stamp
    const completeDone = (receivedAt) => receivedAt != null && String(receivedAt).trim() !== "";
    if (!completeDone(project?.planning_energy_report_received_at)) {
      return false;
    }
    if (!completeDone(project?.planning_footing_certification_received_at)) {
      return false;
    }
    if (!completeDone(project?.planning_building_permit_received_at)) {
      return false;
    }

    // All checks passed
    return true;
  }

  // Get design phase progress text
  function getDesignPhaseProgress() {
    return isDesignPhaseComplete() ? "Complete" : "Incomplete";
  }

  function getDesignPhaseProgressIndicator() {
    return isDesignPhaseComplete() ? indicatorGreen() : indicatorRed();
  }

  // Get construction phase progress text (placeholder - always Incomplete for now)
  function getConstructionPhaseProgress() {
    // TODO: Define logic for Construction Phase completion
    return "Incomplete";
  }

  function getConstructionPhaseProgressIndicator() {
    // TODO: Define logic for Construction Phase completion
    return indicatorRed();
  }

  // Search function to find matching rules based on question
  function searchRules(query) {
    if (!query || query.trim().length === 0) {
      setSearchResults([]);
      return;
    }

    const queryLower = query.toLowerCase().trim();
    const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
    
    if (queryWords.length === 0) {
      setSearchResults([]);
      return;
    }

    const results = [];
    
    // Search through all rules
    Object.keys(PROCESS_RULES).forEach(ruleKey => {
      const rule = PROCESS_RULES[ruleKey];
      let score = 0;
      const matchedKeywords = [];
      
      // Check rule name
      const nameLower = rule.name.toLowerCase();
      queryWords.forEach(word => {
        if (nameLower.includes(word)) {
          score += 3;
          matchedKeywords.push(word);
        }
      });
      
      // Check description
      const descLower = rule.description.toLowerCase();
      queryWords.forEach(word => {
        if (descLower.includes(word)) {
          score += 2;
          if (!matchedKeywords.includes(word)) matchedKeywords.push(word);
        }
      });
      
      // Check requirements labels
      rule.requirements.forEach(req => {
        const labelLower = req.label.toLowerCase();
        queryWords.forEach(word => {
          if (labelLower.includes(word)) {
            score += 1;
            if (!matchedKeywords.includes(word)) matchedKeywords.push(word);
          }
        });
      });
      
      // Check for specific keyword matches
      const keywordMap = {
        'building permit': ['buildingPermit'],
        'permit': ['buildingPermit'],
        'windows': ['windows'],
        'window': ['windows'],
        'contract': ['contract'],
        'master builder': ['contract'],
        'drawings': ['buildingPermit', 'windows'],
        'drawing': ['buildingPermit', 'windows'],
        'colours': ['buildingPermit', 'windows'],
        'colour': ['buildingPermit', 'windows'],
        'color': ['buildingPermit', 'windows'],
        'deposit': ['buildingPermit'],
        'site visit': ['buildingPermit'],
        'planning': ['buildingPermit'],
        'energy': ['buildingPermit'],
        'footing': ['buildingPermit'],
        'certification': ['buildingPermit'],
      };
      
      Object.keys(keywordMap).forEach(keyword => {
        if (queryLower.includes(keyword) && keywordMap[keyword].includes(ruleKey)) {
          score += 5;
        }
      });
      
      if (score > 0) {
        // Generate answer based on rule and project status
        let answer = rule.description;
        
        // Add project-specific context if available
        if (project) {
          const unmetReqs = getUnmetRequirements(rule, project);
          const metReqs = getMetRequirements(rule, project);
          
          if (unmetReqs.length > 0) {
            answer += "\n\nCurrently, we still need:\n";
            unmetReqs.forEach((req, index) => {
              answer += `• ${req.label}\n`;
            });
          }
          
          if (metReqs.length > 0 && unmetReqs.length > 0) {
            answer += "\nCompleted:\n";
            metReqs.forEach((req) => {
              answer += `✓ ${req.label}\n`;
            });
          } else if (metReqs.length === rule.requirements.length) {
            answer += "\n\n✓ All requirements have been met!";
          }
        } else {
          // If no project, just list requirements
          if (rule.requirements.length > 0) {
            answer += "\n\nRequirements:\n";
            rule.requirements.forEach((req, index) => {
              answer += `${index + 1}. ${req.label}\n`;
            });
          }
        }
        
        results.push({
          ruleKey,
          question: rule.name,
          answer: answer,
          score,
          matchedKeywords
        });
      }
    });
    
    // Sort by score (highest first) and take top 3
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, 3);
    fullResultsRef.current = topResults;
    setFullResults(topResults);
  }

  function handleSearchChange(e) {
    const query = e.target.value;
    setSearchQuery(query);
    searchRules(query);
  }

  function handleOpenFaqModal() {
    setFaqModalOpen(true);
    setSearchQuery("");
    setSearchResults([]);
    setFullResults([]);
    fullResultsRef.current = [];
    setDisplayedTexts({});
    setIsTyping(false);
    setIsPrintingText(false);
  }

  function handleCloseFaqModal() {
    setFaqModalOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setFullResults([]);
    fullResultsRef.current = [];
    setDisplayedTexts({});
    setIsTyping(false);
    setIsPrintingText(false);
    // Clear any timeouts/intervals
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (typewriterIntervalRef.current) {
      if (Array.isArray(typewriterIntervalRef.current)) {
        typewriterIntervalRef.current.forEach(interval => clearInterval(interval));
      } else {
        clearInterval(typewriterIntervalRef.current);
      }
    }
  }

  function handleEmailUpdate() {
    // Get the primary email address (prefer client1_email if active, otherwise email)
    const primaryEmail = (project?.client1_email && project?.client1_active === 'true') 
      ? project.client1_email 
      : project?.email || project?.client1_email || project?.client2_email || project?.client3_email;
    
    if (!primaryEmail) {
      alert("No email address available for this client.");
      return;
    }

    const projectName = project.name || `${project.street || ""}, ${project.suburb || ""}`.trim() || "Project";
    const clientName = project.client_name || project.client1_name || "Client";
    const subject = encodeURIComponent(`UPDATE - ${projectName}`);
    
    // Build email body - only mention outstanding items
    let body = `Hi ${clientName},\n\n`;
    body += `Here's an update on your project at ${projectName}:\n\n`;
    
    const outstandingItems = [];
    
    // Check Drawings Status
    const drawingsStatus = project.drawings_status || "Not Assigned";
    if (drawingsStatus !== "Drawings Complete") {
      if (drawingsStatus === "Concept Stage") {
        outstandingItems.push({
          title: "Working Drawings",
          message: "Your concept drawings are in progress. We're now working on the working drawings. Once these are complete, we can proceed to the next steps."
        });
      } else if (drawingsStatus === "Working Drawing Stage") {
        outstandingItems.push({
          title: "Drawings",
          message: "We're currently working on your working drawings. Once these are complete, we can proceed to the next steps."
        });
      } else {
        outstandingItems.push({
          title: "Drawings",
          message: "We're currently working on your drawings. Once the drawings are complete, we can proceed to the next steps."
        });
      }
    }
    
    // Check Colours Status
    const coloursStatus = project.colours_status || "Not Sent";
    if (coloursStatus !== "Complete") {
      if (coloursStatus === "Sent") {
        outstandingItems.push({
          title: "Colours",
          message: "We've sent you the colour options. Please review and provide your selections so we can proceed."
        });
      } else {
        outstandingItems.push({
          title: "Colours",
          message: "We'll send you colour options once your working drawings are approved."
        });
      }
    }
    
    // Check Windows Status
    const windowStatus = project.window_status || "Not Ordered";
    if (windowStatus !== "Complete") {
      if (windowStatus === "Ordered") {
        outstandingItems.push({
          title: "Windows",
          message: "Your windows have been ordered. We're waiting for delivery."
        });
      } else {
        // Check if windows can be ordered based on rules
        const windowsRule = PROCESS_RULES.windows;
        const windowsUnmet = getUnmetRequirements(windowsRule, project);
        if (windowsUnmet.length > 0) {
          const requirements = windowsUnmet.map(req => req.label.toLowerCase()).join(" and ");
          outstandingItems.push({
            title: "Windows",
            message: `We need ${requirements} before we can order your windows.`
          });
        } else {
          outstandingItems.push({
            title: "Windows",
            message: "We're ready to order your windows now that we have your approved working drawings and colour selections."
          });
        }
      }
    }
    
    // Check Site Visit Status
    const siteVisitStatus = project.site_visit_status || "Not Complete";
    if (siteVisitStatus !== "Complete") {
      if (siteVisitStatus === "Booked") {
        outstandingItems.push({
          title: "Site Visit",
          message: "Site visit is booked. We'll complete this soon."
        });
      } else {
        outstandingItems.push({
          title: "Site Visit",
          message: "A site visit is required before we can proceed with the building permit submission."
        });
      }
    }
    
    // Check Contract Status
    const contractStatus = project.contract_status || "Not Sent";
    if (contractStatus !== "Complete") {
      if (contractStatus === "Sent") {
        outstandingItems.push({
          title: "Master Builder's Contract",
          message: "Master Builder's Contract has been sent. Please review and sign so we can proceed."
        });
      } else {
        outstandingItems.push({
          title: "Master Builder's Contract",
          message: "Master Builder's Contract will be sent out soon if we haven't already."
        });
      }
    }
    
    // Check Supporting Documents Status
    const supportingDocsStatus = project.supporting_documents_status || "Not Sent";
    if (supportingDocsStatus !== "Complete") {
      if (supportingDocsStatus === "Sent") {
        outstandingItems.push({
          title: "Supporting Documents",
          message: "We've sent you the list of required supporting documents. Please provide these so we can proceed."
        });
      } else {
        outstandingItems.push({
          title: "Supporting Documents",
          message: "We'll send you the list of required supporting documents once we have your approved working drawings."
        });
      }
    }
    
    // Check Deposit Status
    if (!isDepositFullyPaid()) {
      const paid = getAnyDepositAmountPaid(project);
      const depositFormatted = `$${paid.toLocaleString()}`;
      outstandingItems.push({
        title: "Deposit",
        message: `Deposit received: ${depositFormatted}. Full deposit / pre-engagement payment is required before we can submit the building permit.`
      });
    }
    
    // Check Planning Permit Status
    const planningStatus = project.planning_status || "Not Selected";
    if (planningStatus !== "Planning Permit Issued" && planningStatus !== "No Planning Required") {
      outstandingItems.push({
        title: "Planning Permit",
        message: "Planning permit status is pending. This is required (if applicable) before we can submit the building permit."
      });
    }
    
    // Check Energy Report Status
    const energyReportStatus = project.energy_report_status || "Not Submitted";
    if (energyReportStatus !== "Complete") {
      if (energyReportStatus === "Sent") {
        outstandingItems.push({
          title: "Energy Report",
          message: "Energy report has been submitted. We're waiting for completion."
        });
      } else {
        outstandingItems.push({
          title: "Energy Report",
          message: "A 7 star energy report is required before we can submit the building permit."
        });
      }
    }
    
    // Check Footing Certification Status
    const footingCertStatus = project.footing_certification_status || "Not Submitted";
    if (footingCertStatus !== "Complete") {
      if (footingCertStatus === "Sent") {
        outstandingItems.push({
          title: "Footing Certification",
          message: "Footing certification has been submitted. We're waiting for completion."
        });
      } else {
        outstandingItems.push({
          title: "Footing Certification",
          message: "Footing certification is required before we can submit the building permit."
        });
      }
    }
    
    // Check Building Permit Status
    const buildingPermitStatus = project.building_permit_status || "Not Submitted";
    if (buildingPermitStatus !== "Complete") {
      if (buildingPermitStatus === "Sent") {
        outstandingItems.push({
          title: "Building Permit",
          message: "Building permit has been submitted. We're waiting for approval."
        });
      } else {
        // Only mention building permit if there are other outstanding items, otherwise it's obvious
        if (outstandingItems.length > 0) {
          outstandingItems.push({
            title: "Building Permit",
            message: "Building permit submission is pending."
          });
        }
      }
    }
    
    // Add outstanding items to email
    if (outstandingItems.length > 0) {
      outstandingItems.forEach((item, index) => {
        body += `${item.title}:\n`;
        body += `${item.message}\n\n`;
      });
    } else {
      body += `Great news! All items are complete and your project is progressing well.\n\n`;
    }
    
    // Add process rules context for building permit requirements
    const buildingPermitRule = PROCESS_RULES.buildingPermit;
    const unmetRequirements = getUnmetRequirements(buildingPermitRule, project);
    
    if (unmetRequirements.length > 0 && buildingPermitStatus !== "Complete" && buildingPermitStatus !== "Sent") {
      body += `---\n\n`;
      body += `IMPORTANT: Before we can submit the building permit, we need:\n\n`;
      unmetRequirements.forEach((req, index) => {
        body += `${index + 1}. ${req.label}\n`;
      });
      body += `\n`;
      body += `Once all of the above are complete, we'll be able to submit your building permit application.\n\n`;
    }
    
    body += `---\n\n`;
    body += `If you have any questions, please don't hesitate to reach out.\n\n`;
    body += `Best regards,\n`;
    body += `Superior Granny Flats`;
    
    const encodedBody = encodeURIComponent(body);
    const mailtoLink = `mailto:${primaryEmail}?subject=${subject}&body=${encodedBody}`;
    window.location.href = mailtoLink;
  }

  return (
    <div className="overview-page">
      <div className="overview-header">
        <h2>Overview</h2>
        {/* Virtual Construction Manager button - hidden for now */}
        {false && (
          <button
            type="button"
            onClick={handleOpenFaqModal}
            style={{
              background: INDICATOR.orange,
              color: WHITE,
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "0.95rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = INDICATOR.orangeDark)}
            onMouseLeave={(e) => (e.currentTarget.style.background = INDICATOR.orange)}
          >
            Ask Virtual Construction Manager
          </button>
        )}
      </div>
      
      {/* FAQ Modal */}
      {faqModalOpen && (
        <div className="overview-modal-backdrop" onClick={handleCloseFaqModal}>
          <div className="overview-modal-panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={handleCloseFaqModal}
              className="overview-modal-close"
              aria-label="Close"
            >
              ×
            </button>
            
            <h2 style={{ fontSize: "1.25rem", color: MONUMENT, marginTop: 0, marginBottom: "20px", fontWeight: 600 }}>
              Ask Virtual Construction Manager
            </h2>
            
            <div className="overview-faq-row">
              <div className="overview-faq-search">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Ask a question about the process (e.g., 'When can we order windows?', 'What's needed for building permit?')"
                  autoFocus
                />
              </div>
            </div>
            
            {/* Typing Indicator */}
            {isTyping && searchQuery.trim().length > 0 && (
              <div style={{ 
                padding: "16px", 
                textAlign: "center", 
                color: SECTION_GREY,
                fontSize: "0.9rem",
                fontStyle: "italic"
              }}>
                Thinking...
              </div>
            )}
            
            {/* Search Results */}
            {searchResults.length > 0 && (
              <div style={{ marginTop: "20px" }}>
                {searchResults.map((result, index) => (
                  <div
                    key={result.ruleKey}
                    style={{
                      marginBottom: "16px",
                      padding: "16px",
                      background: "#f6f6f7",
                      borderRadius: "8px",
                      border: "1px solid #e0e0e0"
                    }}
                  >
                    <div style={{ 
                      fontSize: "0.95rem", 
                      fontWeight: 600, 
                      color: MONUMENT, 
                      marginBottom: "8px" 
                    }}>
                      Q: {result.question}
                    </div>
                    <div 
                      style={{ 
                        fontSize: "14px", 
                        color: "#000000",
                        whiteSpace: "pre-line",
                        lineHeight: "1.6",
                        fontWeight: "normal",
                        minHeight: "20px",
                        padding: "8px",
                        backgroundColor: "#ffffff",
                        border: "1px solid #cccccc"
                      }}
                    >
                      <p style={{ color: "#000000", margin: 0, padding: 0, minHeight: "20px" }}>
                        {(() => {
                          const displayText = displayedTexts[result.ruleKey];
                          const fullAnswer = result.answer;
                          const hasDisplayText = result.ruleKey in displayedTexts;
                          
                          // If we have display text (even if empty), show it (typewriter is active)
                          if (hasDisplayText) {
                            return (
                              <>
                                <span style={{ color: "#000000", display: "inline" }}>{displayText || ""}</span>
                                {displayText && displayText.length < fullAnswer.length && (
                                  <span style={{ opacity: 0.5, color: "#000000" }}>|</span>
                                )}
                              </>
                            );
                          } else {
                            // No display text yet, show full answer
                            return <span style={{ color: "#000000" }}>{fullAnswer || "No answer available"}</span>;
                          }
                        })()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {searchQuery && !isTyping && searchResults.length === 0 && fullResults.length === 0 && (
              <div style={{ 
                padding: "16px", 
                textAlign: "center", 
                color: SECTION_GREY,
                fontSize: "0.9rem"
              }}>
                No matching answers found. Try asking about building permits, windows, contracts, or drawings.
              </div>
            )}
            
            {!searchQuery && (
              <div style={{ 
                padding: "16px", 
                textAlign: "center", 
                color: SECTION_GREY,
                fontSize: "0.9rem"
              }}>
                Type a question above to search for answers about the project process.
              </div>
            )}
          </div>
        </div>
      )}
      {project && (
        <DesignPhaseStatusPanel
          project={project}
          onTileClick={(tile) =>
            navigate(projectPath(project, { view: tile.view, t: Date.now() }), {
              replace: false,
            })
          }
        />
      )}

      {/* Email Preview Modal */}
      {previewModalOpen && (
        <div className="overview-modal-backdrop">
          <div className="overview-modal-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", paddingRight: "40px" }}>
              <h2 style={{ margin: 0, fontSize: "clamp(1.15rem, 3vw, 1.5rem)", color: MONUMENT }}>Preview & Send Email</h2>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="overview-modal-close"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                  To (comma-separated)
                </label>
                <input
                  type="text"
                  value={previewTo}
                  onChange={(e) => setPreviewTo(e.target.value)}
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
                  value={previewFrom}
                  onChange={(e) => setPreviewFrom(e.target.value)}
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
                  value={previewSubject}
                  onChange={(e) => setPreviewSubject(e.target.value)}
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
                  ref={previewBodyRef}
                  contentEditable
                  onInput={(e) => setPreviewBody(e.currentTarget.innerHTML)}
                  onBlur={(e) => setPreviewBody(e.currentTarget.innerHTML)}
                  style={{
                    width: "100%",
                    minHeight: "300px",
                    padding: "12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "0.9rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    lineHeight: "1.6",
                    outline: "none",
                  }}
                />
              </div>

              <div className="overview-email-actions">
                <button
                  onClick={() => setPreviewModalOpen(false)}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: MONUMENT,
                    background: "transparent",
                    border: `1px solid ${SECTION_GREY}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendFromPreview}
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
                  Send Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
