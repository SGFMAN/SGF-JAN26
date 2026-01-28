import React, { useState, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

const WINDOW_COLOUR_OPTIONS = [
  "Monument",
  "Paperbark",
  "Woodland Grey",
  "Surfmist",
  "Black",
  "White",
  "Primrose",
];

const REVEAL_OPTIONS = ["95mm", "Other"];

const GLAZING_OPTIONS = ["Double", "Single"];

const BAL_RATING_OPTIONS = [
  "None",
  "BAL - Low",
  "BAL - 12.5",
  "BAL - 19",
  "BAL - 29",
  "BAL - 40",
  "BAL - FZ",
];

const DATE_REQUIRED_OPTIONS = ["Normal", "Urgent"];

export default function Windows({ project, onUpdate }) {
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showReceivedModal, setShowReceivedModal] = useState(false);
  const [windowColour, setWindowColour] = useState(project?.window_colour || "");
  const [reveal, setReveal] = useState(project?.window_reveal || "95mm");
  const [revealOther, setRevealOther] = useState(project?.window_reveal_other || "");
  const [glazing, setGlazing] = useState(project?.window_glazing || "Double");
  const [balRating, setBalRating] = useState(project?.window_bal_rating || "None");
  const [dateRequired, setDateRequired] = useState(project?.window_date_required || "Normal");
  const [isOrdering, setIsOrdering] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [orderNumber, setOrderNumber] = useState("");
  const fileInputRef = useRef(null);

  // Get window status or default to "Not Ordered"
  const windowStatus = project?.window_status || "Not Ordered";

  async function handleOrderWindows() {
    if (!project?.id) {
      alert("Error: Project ID is missing");
      return;
    }

    setIsOrdering(true);
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: project.name || "",
          status: project.status || "",
          stream: project.stream || null,
          suburb: project.suburb || null,
          street: project.street || null,
          state: project.state || null,
          deposit: project.deposit || null,
          project_cost: project.project_cost || null,
          client_name: project.client_name || null,
          email: project.email || null,
          phone: project.phone || null,
          client1_name: project.client1_name || null,
          client1_email: project.client1_email || null,
          client1_phone: project.client1_phone || null,
          client1_active: project.client1_active || null,
          client2_name: project.client2_name || null,
          client2_email: project.client2_email || null,
          client2_phone: project.client2_phone || null,
          client2_active: project.client2_active || null,
          client3_name: project.client3_name || null,
          client3_email: project.client3_email || null,
          client3_phone: project.client3_phone || null,
          client3_active: project.client3_active || null,
          site_visit_status: project.site_visit_status || null,
          site_visit_date: project.site_visit_date || null,
          site_visit_time: project.site_visit_time || null,
          contract_status: project.contract_status || null,
          contract_sent_date: project.contract_sent_date || null,
          contract_complete_date: project.contract_complete_date || null,
          supporting_documents_status: project.supporting_documents_status || null,
          supporting_documents_sent_date: project.supporting_documents_sent_date || null,
          supporting_documents_complete_date: project.supporting_documents_complete_date || null,
          water_declaration_status: project.water_declaration_status || null,
          water_declaration_sent_date: project.water_declaration_sent_date || null,
          water_declaration_complete_date: project.water_declaration_complete_date || null,
          notes: project.notes || null,
          window_status: "Ordered",
          window_colour: project.window_colour || null,
          window_reveal: project.window_reveal || null,
          window_reveal_other: project.window_reveal_other || null,
          window_glazing: project.window_glazing || null,
          window_bal_rating: project.window_bal_rating || null,
          window_date_required: project.window_date_required || null,
          window_ordered_date: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to order windows");
      }

      // Refresh project data
      if (onUpdate) {
        onUpdate();
      }

      // Close modal
      setShowOrderModal(false);
    } catch (error) {
      console.error("Error ordering windows:", error);
      alert(`Error ordering windows: ${error.message}`);
    } finally {
      setIsOrdering(false);
    }
  }

  function handleOpenOrderModal() {
    // Reset form to project values or defaults
    setWindowColour(project?.window_colour || "");
    setReveal(project?.window_reveal || "95mm");
    setRevealOther(project?.window_reveal_other || "");
    setGlazing(project?.window_glazing || "Double");
    setBalRating(project?.window_bal_rating || "None");
    setDateRequired(project?.window_date_required || "Normal");
    setShowOrderModal(true);
  }

  function handleCloseOrderModal() {
    setShowOrderModal(false);
  }

  // Windows Received modal handlers
  function handleDragEnterReceived(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeaveReceived(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDragOverReceived(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDropReceived(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setSelectedFile(file);
      } else {
        alert("Please select a PDF file");
      }
    }
  }

  function handleFileSelectReceived(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setSelectedFile(file);
      } else {
        alert("Please select a PDF file");
      }
    }
  }

  function handleBrowseClickReceived() {
    fileInputRef.current?.click();
  }

  function handleOpenReceivedModal() {
    setSelectedFile(null);
    setOrderNumber(project?.window_order_number || "");
    setIsDragging(false);
    setShowReceivedModal(true);
  }

  function handleCloseReceivedModal() {
    setShowReceivedModal(false);
    setSelectedFile(null);
    setOrderNumber("");
    setIsDragging(false);
  }

  async function handleUploadReceived() {
    if (!selectedFile) {
      alert("Please select a PDF file");
      return;
    }
    if (!orderNumber.trim()) {
      alert("Please enter an order number");
      return;
    }
    if (!project?.id) {
      alert("Error: Project ID is missing");
      return;
    }

    setIsReceiving(true);
    try {
      // First, get the project folder path from settings
      const settingsResponse = await fetch(`${API_URL}/api/settings`);
      if (!settingsResponse.ok) {
        throw new Error("Failed to fetch settings");
      }
      const settings = await settingsResponse.json();
      const rootDirectory = settings.root_directory || "";
      
      if (!rootDirectory) {
        alert("Error: Root directory is not set. Please configure it in File Settings.");
        setIsReceiving(false);
        return;
      }

      // Get project year (from project or current year)
      const projectYear = project.year || new Date().getFullYear().toString();
      const suburb = (project.suburb || "").toUpperCase();
      const street = project.street || "";
      const projectPath = `${rootDirectory}\\${projectYear}\\${suburb} - ${street}`;

      // Upload the file to the server
      const uploadFormData = new FormData();
      uploadFormData.append("file", selectedFile);
      uploadFormData.append("projectId", project.id.toString());
      uploadFormData.append("projectPath", projectPath);
      uploadFormData.append("orderNumber", orderNumber.trim());

      const uploadResponse = await fetch(`${API_URL}/api/files/upload-window-order`, {
        method: "POST",
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ error: uploadResponse.statusText }));
        throw new Error(errorData.error || "Failed to upload window order PDF");
      }

      const uploadResult = await uploadResponse.json();

      // Update window status to "Complete"
      try {
        const updateResponse = await fetch(`${API_URL}/api/projects/${project.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: project.name || "",
            status: project.status || "",
            stream: project.stream || null,
            suburb: project.suburb || null,
            street: project.street || null,
            state: project.state || null,
            deposit: project.deposit || null,
            project_cost: project.project_cost || null,
            client_name: project.client_name || null,
            email: project.email || null,
            phone: project.phone || null,
            client1_name: project.client1_name || null,
            client1_email: project.client1_email || null,
            client1_phone: project.client1_phone || null,
            client1_active: project.client1_active || null,
            client2_name: project.client2_name || null,
            client2_email: project.client2_email || null,
            client2_phone: project.client2_phone || null,
            client2_active: project.client2_active || null,
            client3_name: project.client3_name || null,
            client3_email: project.client3_email || null,
            client3_phone: project.client3_phone || null,
            client3_active: project.client3_active || null,
            site_visit_status: project.site_visit_status || null,
            site_visit_date: project.site_visit_date || null,
            site_visit_time: project.site_visit_time || null,
            contract_status: project.contract_status || null,
            contract_sent_date: project.contract_sent_date || null,
            contract_complete_date: project.contract_complete_date || null,
            supporting_documents_status: project.supporting_documents_status || null,
            supporting_documents_sent_date: project.supporting_documents_sent_date || null,
            supporting_documents_complete_date: project.supporting_documents_complete_date || null,
            water_declaration_status: project.water_declaration_status || null,
            water_declaration_sent_date: project.water_declaration_sent_date || null,
            water_declaration_complete_date: project.water_declaration_complete_date || null,
            notes: project.notes || null,
            window_status: "Complete",
            window_colour: project.window_colour || null,
            window_reveal: project.window_reveal || null,
            window_reveal_other: project.window_reveal_other || null,
            window_glazing: project.window_glazing || null,
            window_bal_rating: project.window_bal_rating || null,
            window_date_required: project.window_date_required || null,
            window_ordered_date: project.window_ordered_date || null,
          }),
        });

        if (!updateResponse.ok) {
          console.error("Failed to update window status to Complete");
        }
      } catch (updateError) {
        console.error("Error updating window status:", updateError);
      }

      // Refresh project data
      if (onUpdate) {
        onUpdate();
      }

      // Close modal
      setShowReceivedModal(false);
      setSelectedFile(null);
      setOrderNumber("");
    } catch (error) {
      console.error("Error uploading window order:", error);
      alert(`Error uploading window order: ${error.message}`);
    } finally {
      setIsReceiving(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Windows
      </h2>
      {project && (
        <div style={{ marginTop: "24px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
          {/* Column 1 */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            {/* Window Status */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                Window Status
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  maxWidth: "300px",
                }}
              >
                {windowStatus}
              </div>
            </div>

            {/* Order Windows Button */}
            {windowStatus !== "Complete" && (
              <button
                onClick={handleOpenOrderModal}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: "500",
                  color: WHITE,
                  background: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  marginBottom: "24px",
                }}
              >
                {windowStatus === "Ordered" ? "Reorder Windows" : "Order Windows"}
              </button>
            )}
          </div>

          {/* Column 2 - Order Details */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            {(windowStatus === "Ordered" || windowStatus === "Complete") && (
              <div>
                <h3 style={{ fontSize: "1rem", marginTop: 0, marginBottom: "16px", color: MONUMENT }}>
                  Order Details
                </h3>
                
                {project.window_colour && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                      Window Colour
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {project.window_colour}
                    </div>
                  </div>
                )}

                {project.window_reveal && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                      Reveal
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {project.window_reveal === "Other" && project.window_reveal_other
                        ? project.window_reveal_other
                        : project.window_reveal}
                    </div>
                  </div>
                )}

                {project.window_glazing && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                      Glazing
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {project.window_glazing}
                    </div>
                  </div>
                )}

                {project.window_bal_rating && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                      BAL Rating
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {project.window_bal_rating}
                    </div>
                  </div>
                )}

                {project.window_date_required && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                      Date Required
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {project.window_date_required}
                    </div>
                  </div>
                )}

                {project.window_ordered_date && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px" }}>
                      Date Ordered
                    </div>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "none",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                      }}
                    >
                      {new Date(project.window_ordered_date).toLocaleDateString()} {new Date(project.window_ordered_date).toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Column 3 - Windows Received */}
          <div style={{ flex: "1", minWidth: "200px" }}>
            {windowStatus === "Ordered" && (
              <div>
                <button
                  onClick={handleOpenReceivedModal}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: "500",
                    color: WHITE,
                    background: MONUMENT,
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    marginBottom: "24px",
                  }}
                >
                  Windows Received
                </button>

                {project.window_order_pdf_location && (
                  <button
                    onClick={() => {
                      if (project?.window_order_pdf_location) {
                        const pdfUrl = `${API_URL}/api/files/window-order/${project.id}`;
                        window.open(pdfUrl, "_blank");
                      } else {
                        alert("No window order PDF has been uploaded for this project yet.");
                      }
                    }}
                    disabled={!project.window_order_pdf_location}
                    style={{
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: "500",
                      color: WHITE,
                      background: project.window_order_pdf_location ? MONUMENT : "#ccc",
                      border: "none",
                      borderRadius: "8px",
                      cursor: project.window_order_pdf_location ? "pointer" : "not-allowed",
                      opacity: project.window_order_pdf_location ? 1 : 0.6,
                      marginBottom: "24px",
                    }}
                  >
                    Show Order
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Column 4 - Empty for now */}
          <div style={{ flex: "1", minWidth: "200px" }}>
          </div>
        </div>
      )}

      {/* Order Windows Modal */}
      {showOrderModal && (
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
              onClick={handleCloseOrderModal}
            >
              <div
                style={{
                  background: WHITE,
                  borderRadius: "12px",
                  padding: "32px",
                  maxWidth: "600px",
                  width: "90%",
                  maxHeight: "90vh",
                  overflowY: "auto",
                  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3
                  style={{
                    fontSize: "1.5rem",
                    marginTop: 0,
                    marginBottom: "24px",
                    color: MONUMENT,
                  }}
                >
                  Order Windows
                </h3>

                {/* Window Colour */}
                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: "#32323399",
                      marginBottom: "6px",
                      fontWeight: "500",
                    }}
                  >
                    Window Colour *
                  </label>
                  <select
                    value={windowColour}
                    onChange={(e) => setWindowColour(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="">Select a colour</option>
                    {WINDOW_COLOUR_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reveal */}
                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: "#32323399",
                      marginBottom: "6px",
                      fontWeight: "500",
                    }}
                  >
                    Reveal *
                  </label>
                  <select
                    value={reveal}
                    onChange={(e) => setReveal(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                      marginBottom: reveal === "Other" ? "10px" : "0",
                    }}
                  >
                    {REVEAL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {reveal === "Other" && (
                    <input
                      type="text"
                      value={revealOther}
                      onChange={(e) => setRevealOther(e.target.value)}
                      placeholder="Enter reveal value"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid #ddd",
                        fontSize: "1rem",
                        color: MONUMENT,
                        background: WHITE,
                        boxSizing: "border-box",
                        marginTop: "10px",
                      }}
                    />
                  )}
                </div>

                {/* Glazing */}
                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: "#32323399",
                      marginBottom: "6px",
                      fontWeight: "500",
                    }}
                  >
                    Glazing *
                  </label>
                  <select
                    value={glazing}
                    onChange={(e) => setGlazing(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                    }}
                  >
                    {GLAZING_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* BAL Rating */}
                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: "#32323399",
                      marginBottom: "6px",
                      fontWeight: "500",
                    }}
                  >
                    BAL Rating *
                  </label>
                  <select
                    value={balRating}
                    onChange={(e) => setBalRating(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                    }}
                  >
                    {BAL_RATING_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Required */}
                <div style={{ marginBottom: "24px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: "#32323399",
                      marginBottom: "6px",
                      fontWeight: "500",
                    }}
                  >
                    Date Required *
                  </label>
                  <select
                    value={dateRequired}
                    onChange={(e) => setDateRequired(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: "1px solid #ddd",
                      fontSize: "1rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                    }}
                  >
                    {DATE_REQUIRED_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Modal Buttons */}
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={handleCloseOrderModal}
                    disabled={isOrdering}
                    style={{
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: "500",
                      color: MONUMENT,
                      background: WHITE,
                      border: `1px solid ${MONUMENT}`,
                      borderRadius: "8px",
                      cursor: isOrdering ? "not-allowed" : "pointer",
                      opacity: isOrdering ? 0.6 : 1,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleOrderWindows}
                    disabled={isOrdering}
                    style={{
                      padding: "10px 20px",
                      fontSize: "1rem",
                      fontWeight: "500",
                      color: WHITE,
                      background: MONUMENT,
                      border: "none",
                      borderRadius: "8px",
                      cursor: isOrdering ? "not-allowed" : "pointer",
                      opacity: isOrdering ? 0.6 : 1,
                    }}
                  >
                    {isOrdering ? "Ordering..." : "Order Windows"}
                  </button>
                </div>
              </div>
            </div>
          )}

      {/* Windows Received Modal */}
      {showReceivedModal && (
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
          onClick={handleCloseReceivedModal}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "32px",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: "1.5rem",
                marginTop: 0,
                marginBottom: "24px",
                color: MONUMENT,
              }}
            >
              Windows Received
            </h3>

            {/* Order Number */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                Order Number *
              </label>
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="Enter order number"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ddd",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Dropzone */}
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: "500",
                }}
              >
                Window Order PDF *
              </label>
              <div
                onDragEnter={handleDragEnterReceived}
                onDragOver={handleDragOverReceived}
                onDragLeave={handleDragLeaveReceived}
                onDrop={handleDropReceived}
                onClick={handleBrowseClickReceived}
                style={{
                  border: `2px dashed ${isDragging ? MONUMENT : "#ddd"}`,
                  borderRadius: "8px",
                  padding: "40px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: isDragging ? "#f5f5f5" : WHITE,
                  transition: "background 0.2s, border-color 0.2s",
                }}
              >
                {selectedFile ? (
                  <div>
                    <div style={{ color: MONUMENT, fontWeight: "500", marginBottom: "8px" }}>
                      {selectedFile.name}
                    </div>
                    <div style={{ fontSize: "0.9rem", color: "#32323399" }}>
                      Click to select a different file
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ color: MONUMENT, fontWeight: "500", marginBottom: "8px" }}>
                      Drag and drop PDF file here
                    </div>
                    <div style={{ fontSize: "0.9rem", color: "#32323399" }}>
                      or click to browse
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileSelectReceived}
                  style={{ display: "none" }}
                />
              </div>
            </div>

            {/* Modal Buttons */}
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={handleCloseReceivedModal}
                disabled={isReceiving}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: "500",
                  color: MONUMENT,
                  background: WHITE,
                  border: `1px solid ${MONUMENT}`,
                  borderRadius: "8px",
                  cursor: isReceiving ? "not-allowed" : "pointer",
                  opacity: isReceiving ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUploadReceived}
                disabled={isReceiving}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: "500",
                  color: WHITE,
                  background: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  cursor: isReceiving ? "not-allowed" : "pointer",
                  opacity: isReceiving ? 0.6 : 1,
                }}
              >
                {isReceiving ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
