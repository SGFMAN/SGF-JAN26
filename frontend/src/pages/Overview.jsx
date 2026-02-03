import React, { useState, useEffect, useRef } from "react";
import { PROCESS_RULES, getRequirementStatus, getUnmetRequirements, getMetRequirements } from "../utils/ProcessRules";
import craig1 from "../images/craig1.jpg";
import craig2 from "../images/craig2.jpg";
import craig3 from "../images/craig3.jpg";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

export default function Overview({ project }) {
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewTo, setPreviewTo] = useState("");
  const [previewFrom, setPreviewFrom] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewBody, setPreviewBody] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [displayedTexts, setDisplayedTexts] = useState({}); // Store word-by-word displayed text for each result
  const [isTyping, setIsTyping] = useState(false);
  const [isPrintingText, setIsPrintingText] = useState(false); // Track if text is actively being printed
  const [fullResults, setFullResults] = useState([]); // Store full results before typewriter effect
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [currentCraigImage, setCurrentCraigImage] = useState(0);
  const craigAnimationRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typewriterIntervalRef = useRef(null);
  const fullResultsRef = useRef([]);
  
  const craigImages = [craig1, craig2, craig3];

  useEffect(() => {
    fetchEmailTemplates();
  }, []);

  // Animate Craig only when text is actively being printed
  useEffect(() => {
    if (isPrintingText && faqModalOpen) {
      // Start animation
      let imageIndex = 0;
      craigAnimationRef.current = setInterval(() => {
        imageIndex = (imageIndex + 1) % craigImages.length;
        setCurrentCraigImage(imageIndex);
      }, 200); // Change image every 200ms for talking animation
      
      return () => {
        if (craigAnimationRef.current) {
          clearInterval(craigAnimationRef.current);
        }
      };
    } else {
      // Stop animation
      if (craigAnimationRef.current) {
        clearInterval(craigAnimationRef.current);
        craigAnimationRef.current = null;
      }
      if (!isPrintingText) {
        setCurrentCraigImage(0); // Reset to first image when not printing
      }
    }
  }, [isPrintingText, faqModalOpen]);

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
      const position =
        user.positions && Array.isArray(user.positions) && user.positions.length > 0
          ? user.positions[0].name
          : "";
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

  async function replaceTokens(text, project, opts = {}) {
    if (!text || !project) return text;
    const html = !!opts.html;

    let replaced = text;

    replaced = replaced.replace(/{ProjectName}/g, project.name || "");
    replaced = replaced.replace(/{ClientName}/g, project.client_name || "");
    replaced = replaced.replace(/{ProjectCost}/g, project.project_cost ? `$${project.project_cost.toLocaleString()}` : "");
    replaced = replaced.replace(/{Street}/g, project.street || "");
    replaced = replaced.replace(/{Suburb}/g, project.suburb || "");

    let depositPaid = "$0";
    let depositNum = 0;
    if (project.deposit != null && project.deposit !== "") {
      if (typeof project.deposit === "string") {
        const cleaned = project.deposit.replace(/[$,\s]/g, "");
        depositNum = parseFloat(cleaned);
      } else {
        depositNum = Number(project.deposit);
      }
      if (!isNaN(depositNum) && depositNum > 0) {
        depositPaid = `$${depositNum.toLocaleString()}`;
      }
    }
    replaced = replaced.replace(/{DepositPaid}/g, depositPaid);

    let depositStatus = "$0 only";
    if (depositNum > 0) {
      const projectCostNum =
        typeof project.project_cost === "string"
          ? parseFloat(project.project_cost.replace(/[$,\s]/g, ""))
          : Number(project.project_cost || 0);
      if (!isNaN(projectCostNum) && projectCostNum > 0) {
        const fullDepositAmount = Math.floor(projectCostNum / 20);
        depositStatus = depositNum === fullDepositAmount ? "Full Deposit Paid" : `${depositPaid} only`;
      } else {
        depositStatus = `${depositPaid} only`;
      }
    }
    replaced = replaced.replace(/{DepositStatus}/g, depositStatus);

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

    return replaced;
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

    if (!template.from_address || !template.from_address.trim()) {
      alert("Template has no From address. Edit the template in Settings → Email Settings.");
      return;
    }

    // Replace tokens in to addresses (async for salesperson position lookup)
    let toAddresses = template.to_addresses || [];
    if (Array.isArray(toAddresses)) {
      const replacedAddresses = await Promise.all(
        toAddresses.map(addr => replaceTokens(addr, project))
      );
      toAddresses = replacedAddresses.filter(addr => addr.trim().length > 0);
    } else {
      const replaced = await replaceTokens(toAddresses, project);
      toAddresses = replaced.split(",").map(a => a.trim()).filter(a => a.length > 0);
    }

    if (toAddresses.length === 0) {
      alert("No valid email addresses found after replacing tokens");
      return;
    }

    const subject = await replaceTokens(template.subject || "", project);
    const htmlBody = await replaceTokens(template.body || "", project, { html: true });

    // Open preview modal with pre-filled data
    setPreviewTo(toAddresses.join(", "));
    setPreviewFrom(template.from_address || "");
    setPreviewSubject(subject);
    setPreviewBody(htmlBody);
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
      setPreviewModalOpen(false);
    } catch (err) {
      console.error("Send email error:", err);
      alert(err.message || "Failed to send email.");
    }
  }
  // Calculate full deposit (5% of project cost)
  function calculateFullDeposit() {
    if (!project?.project_cost) return 0;
    const costStr = project.project_cost.toString().replace(/[^0-9]/g, "");
    const costNum = parseInt(costStr) || 0;
    return Math.floor(costNum / 20);
  }

  // Check if deposit is fully paid
  function isDepositFullyPaid() {
    if (!project?.deposit || !project?.project_cost) return false;
    const depositStr = project.deposit.toString().replace(/[^0-9]/g, "");
    const depositNum = parseInt(depositStr) || 0;
    const fullDeposit = calculateFullDeposit();
    return depositNum >= fullDeposit && fullDeposit > 0;
  }

  // Get deposit status text
  function getDepositStatus() {
    if (!project?.deposit || !project?.project_cost) return "No Deposit";
    return isDepositFullyPaid() ? "Full Deposit" : "Partial Deposit";
  }

  // Color constants
  const COLOR_RED = "#cc3333";    // Default/incomplete
  const COLOR_ORANGE = "#ff8800"; // In progress
  const COLOR_GREEN = "#33cc33";  // Complete

  // Get deposit status color
  function getDepositStatusColor() {
    const status = getDepositStatus();
    if (status === "Full Deposit") return COLOR_GREEN;
    return COLOR_RED;
  }

  // Get drawings status color
  function getDrawingsStatusColor() {
    const status = project?.drawings_status || "In Progress";
    if (status === "Concept Approved") return COLOR_ORANGE;
    if (status === "Working Drawings Approved") return COLOR_GREEN;
    return COLOR_RED;
  }

  // Get colours status color
  function getColoursStatusColor() {
    const status = project?.colours_status || "Not Sent";
    if (status === "Sent") return COLOR_ORANGE;
    if (status === "Complete") return COLOR_GREEN;
    return COLOR_RED;
  }

  // Get window status color
  function getWindowStatusColor() {
    const status = project?.window_status || "Not Ordered";
    if (status === "Ordered") return COLOR_ORANGE;
    if (status === "Complete") return COLOR_GREEN;
    return COLOR_RED;
  }

  // Get site visit status color
  function getSiteVisitStatusColor() {
    const status = project?.site_visit_status || "Not Complete";
    if (status === "Booked") return COLOR_ORANGE;
    if (status === "Complete") return COLOR_GREEN;
    return COLOR_RED;
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

  // Get contract status color (must check all three statuses for green)
  function getContractStatusColor() {
    const contractStatus = project?.contract_status || "Not Sent";
    const supportingDocsStatus = project?.supporting_documents_status || "Not Sent";
    const waterDeclStatus = project?.water_declaration_status || "Not Required";

    // For green: all three must be complete
    if (
      contractStatus === "Complete" &&
      supportingDocsStatus === "Complete" &&
      (waterDeclStatus === "Complete" || waterDeclStatus === "Not Required")
    ) {
      return COLOR_GREEN;
    }

    // For orange: contract status must be "Sent"
    if (contractStatus === "Sent") return COLOR_ORANGE;

    // Default: red
    return COLOR_RED;
  }

  // Get planning permit status color
  function getPlanningPermitStatusColor() {
    const status = project?.planning_status || "Not Selected";
    if (status === "No Planning Required" || status === "Planning Permit Issued") {
      return COLOR_GREEN;
    }
    return COLOR_RED;
  }

  // Get energy report status color
  function getEnergyReportStatusColor() {
    const status = project?.energy_report_status || "Not Submitted";
    if (status === "Complete") return COLOR_GREEN;
    if (status === "Sent") return COLOR_ORANGE;
    return COLOR_RED;
  }

  // Get footing certification status color
  function getFootingCertificationStatusColor() {
    const status = project?.footing_certification_status || "Not Submitted";
    if (status === "Complete") return COLOR_GREEN;
    if (status === "Sent") return COLOR_ORANGE;
    return COLOR_RED;
  }

  // Get building permit status color
  function getBuildingPermitStatusColor() {
    const status = project?.building_permit_status || "Not Submitted";
    if (status === "Complete") return COLOR_GREEN;
    if (status === "Sent") return COLOR_ORANGE;
    return COLOR_RED;
  }

  // Check if design phase is complete (all required statuses must be green)
  function isDesignPhaseComplete() {
    // Check drawings status - must be "Working Drawings Approved"
    const drawingsStatus = project?.drawings_status || "In Progress";
    if (drawingsStatus !== "Working Drawings Approved") return false;

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

    // Check planning permit status - must be "No Planning Required" or "Planning Permit Issued"
    const planningStatus = project?.planning_status || "Not Selected";
    if (planningStatus !== "No Planning Required" && planningStatus !== "Planning Permit Issued") {
      return false;
    }

    // Check energy report status - must be "Complete"
    const energyReportStatus = project?.energy_report_status || "Not Submitted";
    if (energyReportStatus !== "Complete") return false;

    // Check footing certification status - must be "Complete"
    const footingCertificationStatus = project?.footing_certification_status || "Not Submitted";
    if (footingCertificationStatus !== "Complete") return false;

    // Check building permit status - must be "Complete"
    const buildingPermitStatus = project?.building_permit_status || "Not Submitted";
    if (buildingPermitStatus !== "Complete") return false;

    // All checks passed
    return true;
  }

  // Get design phase progress text
  function getDesignPhaseProgress() {
    return isDesignPhaseComplete() ? "Complete" : "Incomplete";
  }

  // Get design phase progress color
  function getDesignPhaseProgressColor() {
    return isDesignPhaseComplete() ? COLOR_GREEN : COLOR_RED;
  }

  // Get construction phase progress text (placeholder - always Incomplete for now)
  function getConstructionPhaseProgress() {
    // TODO: Define logic for Construction Phase completion
    return "Incomplete";
  }

  // Get construction phase progress color
  function getConstructionPhaseProgressColor() {
    // TODO: Define logic for Construction Phase completion
    return COLOR_RED;
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
    const drawingsStatus = project.drawings_status || "In Progress";
    if (drawingsStatus !== "Working Drawings Approved") {
      if (drawingsStatus === "Concept Approved") {
        outstandingItems.push({
          title: "Working Drawings",
          message: "Your concept drawings have been approved. We're now working on the working drawings. Once you approve these, we can proceed to the next steps."
        });
      } else {
        outstandingItems.push({
          title: "Drawings",
          message: "We're currently working on your drawings. Once you approve the working drawings, we can proceed to the next steps."
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
      const depositAmount = project.deposit ? project.deposit.toString().replace(/[^0-9]/g, "") : "0";
      const depositFormatted = depositAmount ? `$${parseInt(depositAmount).toLocaleString()}` : "$0";
      outstandingItems.push({
        title: "Deposit",
        message: `Deposit received: ${depositFormatted}. Full deposit payment is required before we can submit the building permit.`
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
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
          Overview
        </h2>
        <button
          type="button"
          onClick={handleOpenFaqModal}
          style={{
            background: "#FF9800",
            color: WHITE,
            border: "none",
            borderRadius: "8px",
            padding: "10px 20px",
            fontSize: "0.95rem",
            fontWeight: 500,
            cursor: "pointer",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#F57C00")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#FF9800")}
        >
          Ask Virtual Construction Manager
        </button>
      </div>
      
      {/* FAQ Modal */}
      {faqModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={handleCloseFaqModal}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "800px",
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseFaqModal}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "transparent",
                border: "none",
                fontSize: "24px",
                cursor: "pointer",
                color: MONUMENT,
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f0f0f0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              ×
            </button>
            
            <h2 style={{ fontSize: "1.25rem", color: MONUMENT, marginTop: 0, marginBottom: "20px", fontWeight: 600 }}>
              Ask Virtual Construction Manager
            </h2>
            
            <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
              {/* Craig Animation */}
              <div style={{ flexShrink: 0 }}>
                <img
                  src={craigImages[currentCraigImage]}
                  alt="Virtual Construction Manager"
                  style={{
                    width: "150px",
                    height: "150px",
                    objectFit: "cover",
                    borderRadius: "8px",
                    border: `2px solid ${SECTION_GREY}`,
                  }}
                />
              </div>
              
              {/* Search Input */}
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Ask a question about the process (e.g., 'When can we order windows?', 'What's needed for building permit?')"
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "0.95rem",
                    color: MONUMENT,
                    boxSizing: "border-box",
                  }}
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
        <div style={{ marginTop: "24px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {/* Column 1 - Design Phase Progress and Construction Phase Progress */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Design Phase Progress
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getDesignPhaseProgressColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {getDesignPhaseProgress()}
              </div>
            </div>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Construction Phase Progress
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getConstructionPhaseProgressColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {getConstructionPhaseProgress()}
              </div>
            </div>
          </div>

          {/* Column 2 - Drawings Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Drawings Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getDrawingsStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.drawings_status || "In Progress"}
              </div>
            </div>
          </div>

          {/* Column 3 - Colour Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Colour Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getColoursStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.colours_status || "Not Sent"}
              </div>
            </div>
          </div>

          {/* Column 4 - Window Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Window Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getWindowStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.window_status || "Not Ordered"}
              </div>
            </div>
          </div>

          {/* Column 5 - Site Visit Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Site Visit Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getSiteVisitStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.site_visit_status || "Not Complete"}
              </div>
            </div>
          </div>

          {/* Column 6 - Contract Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Contract Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getContractStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {getContractStatusText()}
              </div>
            </div>
          </div>

          {/* Column 7 - Deposit Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Deposit Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getDepositStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {getDepositStatus()}
              </div>
            </div>
          </div>

          {/* Column 8 - Planning Permit Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Planning Permit Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getPlanningPermitStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.planning_status || "Not Selected"}
              </div>
            </div>
          </div>

          {/* Column 9 - Energy Report Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Energy Report Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getEnergyReportStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.energy_report_status || "Not Submitted"}
              </div>
            </div>
          </div>

          {/* Column 10 - Footing Certification Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Footing Certification Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getFootingCertificationStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.footing_certification_status || "Not Submitted"}
              </div>
            </div>
          </div>

          {/* Column 11 - Building Permit Status */}
          <div style={{ flex: "1 1 0", minWidth: "0" }}>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: "500", textAlign: "center", minHeight: "48px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: "1.4" }}>
                Building Permit Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: WHITE,
                  background: getBuildingPermitStatusColor(),
                  boxSizing: "border-box",
                  height: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                {project.building_permit_status || "Not Submitted"}
              </div>
            </div>
          </div>

          {/* Test Email Template Section - at the bottom */}
          <div style={{ flex: "1 1 100%", minWidth: "100%", marginTop: "24px" }}>
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                Test Email Template
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  style={{
                    minWidth: "200px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Select template...</option>
                  {emailTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={!selectedTemplateId}
                  style={{
                    background: selectedTemplateId ? MONUMENT : "#ccc",
                    color: WHITE,
                    border: "none",
                    borderRadius: "10px",
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: selectedTemplateId ? "pointer" : "not-allowed",
                    transition: "background 0.17s",
                    opacity: selectedTemplateId ? 1 : 0.6,
                  }}
                >
                  Send Test
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Preview Modal */}
      {previewModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPreviewModalOpen(false);
            }
          }}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "800px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Preview & Send Email</h2>
              <button
                onClick={() => setPreviewModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: MONUMENT,
                  padding: "0",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
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
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
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
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
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
                <label style={{ display: "block", fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  Body (HTML)
                </label>
                <textarea
                  value={previewBody}
                  onChange={(e) => setPreviewBody(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: "300px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    resize: "vertical",
                    fontFamily: "monospace",
                  }}
                />
                <div style={{ marginTop: "8px", padding: "12px", background: "#f5f5f5", borderRadius: "8px", border: `1px solid ${SECTION_GREY}` }}>
                  <div style={{ fontSize: "0.85rem", color: "#32323399", marginBottom: "8px", fontWeight: 500 }}>Preview:</div>
                  <div
                    style={{
                      fontSize: "0.9rem",
                      color: MONUMENT,
                      lineHeight: "1.6",
                      whiteSpace: "pre-wrap",
                    }}
                    dangerouslySetInnerHTML={{ __html: previewBody.replace(/\n/g, "<br>") }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
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
