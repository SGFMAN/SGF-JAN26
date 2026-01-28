import React, { useState, useEffect, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

const TIME_SLOTS = [
  "7am - 9am",
  "8am - 10am",
  "9am - 11am",
  "10am - 12 midday",
  "11am - 1pm",
  "12 midday - 2pm",
  "1pm - 3pm",
  "2pm - 4pm",
  "3pm - 5pm",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function SiteVisit({ project, onUpdate }) {
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [availableDays, setAvailableDays] = useState([]);
  const [isBooking, setIsBooking] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [siteVisitNotes, setSiteVisitNotes] = useState(project?.site_visit_notes || "");
  
  const valuesRef = useRef({ siteVisitNotes });

  // Get site visit status or default to "Not Complete"
  const siteVisitStatus = project?.site_visit_status || "Not Complete";

  const SITE_VISIT_STATUS_OPTIONS = ["Not Complete", "Email Sent", "Booked", "Complete"];

  // Update ref whenever notes change
  useEffect(() => {
    valuesRef.current = { siteVisitNotes };
  }, [siteVisitNotes]);

  // Initialize notes from project data
  useEffect(() => {
    if (project?.site_visit_notes !== undefined) {
      setSiteVisitNotes(project.site_visit_notes || "");
    }
  }, [project?.site_visit_notes]);

  async function handleStatusChange(newStatus) {
    if (!project?.id) {
      alert("Error: Project ID is missing");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: project.name || "",
          status: project.status || "",
          site_visit_status: newStatus,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to update site visit status");
      }

      // Refresh project data
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error("Error updating site visit status:", error);
      alert(error.message || "Failed to update site visit status");
    }
  }

  // Generate days for selected month
  useEffect(() => {
    if (selectedMonth) {
      const monthIndex = MONTHS.indexOf(selectedMonth);
      if (monthIndex !== -1) {
        const currentYear = new Date().getFullYear();
        const daysInMonth = new Date(currentYear, monthIndex + 1, 0).getDate();
        const days = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());
        setAvailableDays(days);
        // Reset selected day if it's out of range for new month
        if (selectedDay && parseInt(selectedDay) > daysInMonth) {
          setSelectedDay("");
        }
      }
    } else {
      setAvailableDays([]);
      setSelectedDay("");
    }
  }, [selectedMonth, selectedDay]);

  function getDaysInMonth(monthName, year) {
    const monthIndex = MONTHS.indexOf(monthName);
    if (monthIndex === -1) return 31;
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  async function handleBookSiteVisit() {
    if (!selectedMonth || !selectedDay || !selectedTime) {
      alert("Please select a month, day, and time");
      return;
    }

    if (!project?.id) {
      alert("Error: Project ID is missing");
      return;
    }

    setIsBooking(true);
    try {
      // Format date as YYYY-MM-DD
      const currentYear = new Date().getFullYear();
      const monthIndex = MONTHS.indexOf(selectedMonth) + 1;
      const day = parseInt(selectedDay);
      const formattedDate = `${currentYear}-${String(monthIndex).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: project.name || "",
          status: project.status || "",
          site_visit_status: "Booked",
          site_visit_date: formattedDate,
          site_visit_time: selectedTime,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to book site visit");
      }

      // Refresh project data
      if (onUpdate) {
        onUpdate();
      }

      // Close modal and reset form
      setShowBookingModal(false);
      setSelectedMonth("");
      setSelectedDay("");
      setSelectedTime("");
    } catch (error) {
      console.error("Error booking site visit:", error);
      alert(error.message || "Failed to book site visit");
    } finally {
      setIsBooking(false);
    }
  }

  function handleCancelBooking() {
    setShowBookingModal(false);
    setSelectedMonth("");
    setSelectedDay("");
    setSelectedTime("");
  }

  async function handleCancelSiteVisit() {
    if (!project?.id) {
      alert("Error: Project ID is missing");
      return;
    }

    if (!confirm("Are you sure you want to cancel this site visit booking?")) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: project.name || "",
          status: project.status || "",
          site_visit_status: "Not Complete",
          site_visit_date: "",
          site_visit_time: "",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to cancel site visit");
      }

      // Refresh project data
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error("Error canceling site visit:", error);
      alert(error.message || "Failed to cancel site visit");
    }
  }

  async function handleCompleteSiteVisit() {
    if (!project?.id) {
      alert("Error: Project ID is missing");
      return;
    }

    setIsCompleting(true);
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: project.name || "",
          status: project.status || "",
          site_visit_status: "Complete",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to complete site visit");
      }

      // Close modal and refresh project data
      setShowCompleteModal(false);
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error("Error completing site visit:", error);
      alert(error.message || "Failed to complete site visit");
    } finally {
      setIsCompleting(false);
    }
  }

  // Format date for display
  function formatDateDisplay() {
    if (!project?.site_visit_date) return "";
    const dateStr = project.site_visit_date;
    try {
      const [year, month, day] = dateStr.split("-");
      const monthIndex = parseInt(month) - 1;
      return `${day} ${MONTHS[monthIndex]} ${year}`;
    } catch (e) {
      return dateStr;
    }
  }

  function handleNotesChange(e) {
    const newNotes = e.target.value;
    setSiteVisitNotes(newNotes);
    valuesRef.current.siteVisitNotes = newNotes;
  }

  async function handleNotesBlur() {
    if (!project?.id) return;
    
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: project.name || "",
          status: project.status || "",
          site_visit_notes: valuesRef.current.siteVisitNotes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save notes");
      }

      // Refresh project data
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error("Error saving notes:", error);
      alert(error.message || "Failed to save notes");
    }
  }

  return (
    <>
      <div>
        <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
          Site Visit
        </h2>
        {project && (
          <div style={{ marginTop: "24px" }}>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                Status
              </div>
              <select
                value={siteVisitStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{
                  fontSize: "1rem",
                  color: MONUMENT,
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  background: WHITE,
                  width: "300px",
                  maxWidth: "100%",
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                {SITE_VISIT_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            {(siteVisitStatus === "Booked" || siteVisitStatus === "Complete") && project.site_visit_date && (
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  {siteVisitStatus === "Complete" ? "Completed Date" : "Date"}
                </div>
                <div
                  style={{
                    fontSize: "1rem",
                    color: MONUMENT,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: WHITE,
                    width: "300px",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  {formatDateDisplay()}
                </div>
              </div>
            )}

            {(siteVisitStatus === "Booked" || siteVisitStatus === "Complete") && project.site_visit_time && (
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  {siteVisitStatus === "Complete" ? "Completed Time" : "Time"}
                </div>
                <div
                  style={{
                    fontSize: "1rem",
                    color: MONUMENT,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: WHITE,
                    width: "300px",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  {project.site_visit_time}
                </div>
              </div>
            )}

            {/* Scheduled Site Visit Date and Period */}
            {project.site_visit_scheduled_date && (
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  Scheduled Site Visit Date
                </div>
                <div
                  style={{
                    fontSize: "1rem",
                    color: MONUMENT,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: WHITE,
                    width: "300px",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  {new Date(project.site_visit_scheduled_date + "T00:00:00").toLocaleDateString("en-AU", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                  })}
                </div>
              </div>
            )}

            {project.site_visit_scheduled_period && (
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  Scheduled Site Visit Time Period
                </div>
                <div
                  style={{
                    fontSize: "1rem",
                    color: MONUMENT,
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: WHITE,
                    width: "300px",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  {project.site_visit_scheduled_period}
                </div>
              </div>
            )}

            {/* Notes Section */}
            <div style={{ marginTop: "24px", marginBottom: "24px" }}>
              <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                Notes
              </div>
              <textarea
                value={siteVisitNotes}
                onChange={handleNotesChange}
                onBlur={handleNotesBlur}
                placeholder="Add notes about the site visit..."
                style={{
                  width: "100%",
                  maxWidth: "600px",
                  minHeight: "120px",
                  padding: "12px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>

            {siteVisitStatus !== "Complete" && (
              <div style={{ marginTop: "24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setShowBookingModal(true)}
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
                  {siteVisitStatus === "Booked" ? "Rebook Site Visit" : "Book Site Visit"}
                </button>
                {siteVisitStatus === "Booked" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowCompleteModal(true)}
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
                      Complete Site Visit
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelSiteVisit}
                      style={{
                        background: "#dc3545",
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
                      Cancel Booking
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Booking Modal */}
      {showBookingModal && (
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
          onClick={handleCancelBooking}
        >
          <div
            style={{
              background: SECTION_GREY,
              borderRadius: "18px",
              padding: "32px",
              width: "90%",
              maxWidth: "450px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                marginTop: 0,
                marginBottom: "24px",
                color: MONUMENT,
              }}
            >
              Book Site Visit
            </h2>

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
                Month
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  width: "100%",
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
                <option value="">Select Month</option>
                {MONTHS.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
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
                Day
              </label>
              <select
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                disabled={!selectedMonth}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  cursor: selectedMonth ? "pointer" : "not-allowed",
                  opacity: selectedMonth ? 1 : 0.6,
                }}
              >
                <option value="">Select Day</option>
                {availableDays.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                Time
              </label>
              <select
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                style={{
                  width: "100%",
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
                <option value="">Select Time</option>
                {TIME_SLOTS.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                onClick={handleCancelBooking}
                disabled={isBooking}
                style={{
                  background: "#e0e0e0",
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isBooking ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isBooking ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBookSiteVisit}
                disabled={!selectedMonth || !selectedDay || !selectedTime || isBooking}
                style={{
                  background: MONUMENT,
                  color: WHITE,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: selectedMonth && selectedDay && selectedTime && !isBooking ? "pointer" : "not-allowed",
                  transition: "background 0.17s",
                  opacity: selectedMonth && selectedDay && selectedTime && !isBooking ? 1 : 0.6,
                }}
              >
                {isBooking ? "Booking..." : "Book"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Site Visit Modal */}
      {showCompleteModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowCompleteModal(false)}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "32px",
              width: "90%",
              maxWidth: "500px",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                marginTop: 0,
                marginBottom: "24px",
                color: MONUMENT,
              }}
            >
              Complete Site Visit
            </h3>
            <p
              style={{
                fontSize: "1rem",
                color: "#32323399",
                marginBottom: "24px",
                lineHeight: "1.5",
              }}
            >
              This is where you can upload site visit markup.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                onClick={() => setShowCompleteModal(false)}
                style={{
                  background: "none",
                  color: MONUMENT,
                  border: `1px solid ${SECTION_GREY}`,
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
                onClick={handleCompleteSiteVisit}
                disabled={isCompleting}
                style={{
                  background: MONUMENT,
                  color: WHITE,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: isCompleting ? "not-allowed" : "pointer",
                  transition: "background 0.17s",
                  opacity: isCompleting ? 0.6 : 1,
                }}
              >
                {isCompleting ? "Completing..." : "Upload Markup"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
