import React, { useState, useEffect, useRef, useCallback } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

function siteVisitPhotoSrc(projectId, fileName) {
  return `${API_URL}/api/sitevisit/photo-file?projectId=${encodeURIComponent(String(projectId))}&name=${encodeURIComponent(fileName)}`;
}

function isHeicLikeSiteVisitFileName(name) {
  return /\.(hei[cf])$/i.test(name || "");
}

/** HEIC/HEIF often fail in `<img>` on Chrome/Edge; server usually returns JPEG via sharp; this retries with client decode on error. */
function SiteVisitPhotoImg({ projectId, fileName, alt, style, loading, draggable }) {
  const originalSrc = siteVisitPhotoSrc(projectId, fileName);
  const [src, setSrc] = useState(originalSrc);
  const blobUrlRef = useRef(null);
  const heicAttemptedRef = useRef(false);

  useEffect(() => {
    setSrc(originalSrc);
    heicAttemptedRef.current = false;
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, [originalSrc]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const tryHeicClientDecode = useCallback(async () => {
    if (heicAttemptedRef.current || !isHeicLikeSiteVisitFileName(fileName)) return;
    heicAttemptedRef.current = true;
    try {
      const res = await fetch(originalSrc);
      if (!res.ok) return;
      const blob = await res.blob();
      const mod = await import("heic2any");
      const heic2any = mod.default;
      const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.88 });
      const first = Array.isArray(out) ? out[0] : out;
      const u = URL.createObjectURL(first);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = u;
      setSrc(u);
    } catch (e) {
      console.warn("Site visit HEIC client decode failed:", e);
    }
  }, [originalSrc, fileName]);

  return (
    <img
      src={src}
      alt={alt}
      style={style}
      loading={loading}
      draggable={draggable}
      onError={() => {
        void tryHeicClientDecode();
      }}
    />
  );
}

/**
 * One file per request (reliable on mobile). Upload progress via xhr.upload.
 */
function uploadSiteVisitPhotoXHR(projectId, file, onProgress, xhrHolder) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    if (xhrHolder) xhrHolder.current = xhr;
    const formData = new FormData();
    formData.append("projectId", String(projectId));
    formData.append("photos", file);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.open("POST", `${API_URL}/api/sitevisit/upload-photo`);
    xhr.onload = () => {
      if (xhrHolder) xhrHolder.current = null;
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* ignore */
      }
      const failed = data.failed || [];
      const uploaded = data.uploaded || [];
      if (xhr.status >= 200 && xhr.status < 300) {
        if (failed.length) {
          resolve({
            ok: false,
            error: failed[0].error || "Upload failed",
          });
        } else if (uploaded.length) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: data.error || "Upload failed" });
        }
      } else {
        const hint =
          xhr.status === 413
            ? "File too large (max 30MB per photo)."
            : null;
        resolve({
          ok: false,
          error: data.error || hint || xhr.statusText || "Upload failed",
        });
      }
    };
    xhr.onerror = () => {
      if (xhrHolder) xhrHolder.current = null;
      resolve({ ok: false, error: "Network error" });
    };
    xhr.onabort = () => {
      if (xhrHolder) xhrHolder.current = null;
      resolve({ ok: false, error: "Cancelled", cancelled: true });
    };
    xhr.send(formData);
  });
}

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
  const [showUploadPhotosModal, setShowUploadPhotosModal] = useState(false);
  const [siteVisitPhotoFiles, setSiteVisitPhotoFiles] = useState([]);
  const [siteVisitPhotosLoading, setSiteVisitPhotosLoading] = useState(false);
  /** null = closed; otherwise index into `siteVisitPhotoFiles` */
  const [photoViewerIndex, setPhotoViewerIndex] = useState(null);
  const [siteVisitNotes, setSiteVisitNotes] = useState(project?.site_visit_notes || "");
  
  const valuesRef = useRef({ siteVisitNotes });
  const siteVisitPhotoInputRef = useRef(null);
  const siteVisitUploadXhrRef = useRef(null);

  /** Sequential upload UI: per-file status + progress */
  const [uploadSession, setUploadSession] = useState(null);
  /** { items: Array<{ name: string, status: 'queued'|'uploading'|'done'|'error', progress: number, error?: string }> } */

  useEffect(() => {
    const anyOverlayOpen = showUploadPhotosModal || photoViewerIndex !== null;
    if (!anyOverlayOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showUploadPhotosModal, photoViewerIndex]);

  useEffect(() => {
    if (photoViewerIndex === null) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setPhotoViewerIndex(null);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPhotoViewerIndex((i) => {
          if (i === null || siteVisitPhotoFiles.length === 0) return null;
          return (i - 1 + siteVisitPhotoFiles.length) % siteVisitPhotoFiles.length;
        });
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setPhotoViewerIndex((i) => {
          if (i === null || siteVisitPhotoFiles.length === 0) return null;
          return (i + 1) % siteVisitPhotoFiles.length;
        });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [photoViewerIndex, siteVisitPhotoFiles.length]);

  const refreshSiteVisitPhotos = useCallback(async () => {
    if (!project?.id) {
      setSiteVisitPhotoFiles([]);
      return;
    }
    setSiteVisitPhotosLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/sitevisit/photos?projectId=${encodeURIComponent(project.id)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to load photos");
      }
      setSiteVisitPhotoFiles(Array.isArray(data.files) ? data.files : []);
    } catch (e) {
      console.error("Site visit photos list:", e);
      setSiteVisitPhotoFiles([]);
    } finally {
      setSiteVisitPhotosLoading(false);
    }
  }, [project?.id]);

  useEffect(() => {
    refreshSiteVisitPhotos();
  }, [refreshSiteVisitPhotos]);

  useEffect(() => {
    if (photoViewerIndex === null) return;
    if (siteVisitPhotoFiles.length === 0) {
      setPhotoViewerIndex(null);
      return;
    }
    if (photoViewerIndex >= siteVisitPhotoFiles.length) {
      setPhotoViewerIndex(siteVisitPhotoFiles.length - 1);
    }
  }, [photoViewerIndex, siteVisitPhotoFiles.length]);

  // Get site visit status or default to "Not Complete"
  const siteVisitStatus = project?.site_visit_status || "Not Complete";

  const SITE_VISIT_STATUS_OPTIONS = ["Not Complete", "Email Sent", "Booked", "Complete"];

  // Update ref whenever notes change
  useEffect(() => {
    valuesRef.current = { siteVisitNotes };
  }, [siteVisitNotes]);

  useEffect(() => {
    setSiteVisitNotes(project?.site_visit_notes || "");
  }, [project?.id]);

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

  async function saveAllFields() {
    if (!project?.id) return;
    try {
      const notesToSave = valuesRef.current.siteVisitNotes;
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: project.name || "",
          status: project.status || "",
          site_visit_notes: notesToSave ?? null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || "Failed to save site visit notes");
      }

      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error("Error saving site visit notes:", error);
    }
  }

  function closeUploadPhotosModal() {
    siteVisitUploadXhrRef.current?.abort();
    setUploadSession(null);
    setShowUploadPhotosModal(false);
    if (siteVisitPhotoInputRef.current) {
      siteVisitPhotoInputRef.current.value = "";
    }
  }

  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length || !project?.id) return;

    const MAX_BATCH = 40;
    if (files.length > MAX_BATCH) {
      alert(`Maximum ${MAX_BATCH} photos per batch.`);
      e.target.value = "";
      return;
    }
    e.target.value = "";

    const items = files.map((f) => ({
      name: f.name || "Photo",
      status: "queued",
      progress: 0,
    }));
    setUploadSession({ items });

    const projectId = project.id;
    let anySuccess = false;
    let aborted = false;

    for (let i = 0; i < files.length; i++) {
      setUploadSession((prev) => {
        if (!prev) return prev;
        const next = [...prev.items];
        next[i] = { ...next[i], status: "uploading", progress: 0 };
        return { items: next };
      });

      const result = await uploadSiteVisitPhotoXHR(
        projectId,
        files[i],
        (pct) => {
          setUploadSession((prev) => {
            if (!prev) return prev;
            const next = [...prev.items];
            if (next[i]?.status !== "uploading") return prev;
            next[i] = { ...next[i], progress: pct };
            return { items: next };
          });
        },
        siteVisitUploadXhrRef
      );

      if (result.ok) {
        anySuccess = true;
        setUploadSession((prev) => {
          if (!prev) return prev;
          const next = [...prev.items];
          next[i] = { ...next[i], status: "done", progress: 100 };
          return { items: next };
        });
      } else if (result.cancelled || result.error === "Cancelled") {
        aborted = true;
        setUploadSession((prev) => {
          if (!prev) return prev;
          const next = prev.items.map((row, j) => {
            if (j < i) return row;
            if (j === i) return { ...row, status: "error", error: "Cancelled" };
            if (row.status === "queued" || row.status === "uploading") {
              return { ...row, status: "error", error: "Cancelled" };
            }
            return row;
          });
          return { items: next };
        });
        break;
      } else {
        setUploadSession((prev) => {
          if (!prev) return prev;
          const next = [...prev.items];
          next[i] = {
            ...next[i],
            status: "error",
            error: result.error || "Upload failed",
          };
          return { items: next };
        });
      }
    }

    if (anySuccess) {
      refreshSiteVisitPhotos();
    }
  }

  return (
    <>
      <div>
        <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
          Site Visit
        </h2>
        {project && (
          <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "24px", alignItems: "stretch", minHeight: "600px" }}>
            {/* Column 1 - Status, Date/Time, Buttons */}
            <div style={{ display: "flex", flexDirection: "column" }}>
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
                    width: "100%",
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
                      width: "100%",
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
                      width: "100%",
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
                      width: "100%",
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
                      width: "100%",
                      maxWidth: "100%",
                      boxSizing: "border-box",
                    }}
                  >
                    {project.site_visit_scheduled_period}
                  </div>
                </div>
              )}

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

            {/* Columns 2-3 - Notes (Spans Both Columns) with Button in Column 3 */}
            <div style={{ gridColumn: "span 2", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              {/* Notes textarea spans both columns */}
              <div style={{ gridColumn: "span 2", display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "6px", fontWeight: 500 }}>
                  Notes
                </div>
                <textarea
                  value={siteVisitNotes}
                  onChange={handleNotesChange}
                  onBlur={() => void saveAllFields()}
                  placeholder="Add notes about the site visit..."
                  style={{
                    width: "100%",
                    flex: 1,
                    padding: "12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    resize: "none",
                    marginBottom: "12px",
                  }}
                />
              </div>
              
              {/* Empty space in column 2 */}
              <div></div>
              
              {/* Email Notes Button in Column 3 */}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
                <button
                  type="button"
                  onClick={() => {
                    const street = project?.street || "";
                    const suburb = project?.suburb || "";
                    const subject = street && suburb ? `${street} - ${suburb}` : "Site Visit Notes";
                    const body = siteVisitNotes || "";
                    
                    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                    window.location.href = mailtoLink;
                  }}
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
                    width: "100%",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#252526";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = MONUMENT;
                  }}
                >
                  Email Notes
                </button>
              </div>
            </div>

            {/* Column 4 - Upload Photos + folder thumbnails */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
                minWidth: 0,
                minHeight: 0,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setUploadSession(null);
                  setShowUploadPhotosModal(true);
                }}
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
                  width: "100%",
                  boxSizing: "border-box",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#252526";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = MONUMENT;
                }}
              >
                Upload Photos
              </button>
              <div
                style={{
                  marginTop: "16px",
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    fontSize: "0.9rem",
                    color: "#32323399",
                    marginBottom: "8px",
                    fontWeight: 500,
                  }}
                >
                  Pre-construction photos
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gridAutoRows: "auto",
                    gap: "10px",
                    alignItems: "start",
                    overflowY: "auto",
                    overflowX: "hidden",
                    maxHeight: "min(600px, 68vh)",
                    paddingRight: "4px",
                    alignContent: "start",
                  }}
                >
                  {siteVisitPhotosLoading ? (
                    <span
                      style={{
                        gridColumn: "1 / -1",
                        color: "#32323399",
                        fontSize: "0.875rem",
                      }}
                    >
                      Loading…
                    </span>
                  ) : siteVisitPhotoFiles.length === 0 ? (
                    <span
                      style={{
                        gridColumn: "1 / -1",
                        color: "#32323399",
                        fontSize: "0.875rem",
                      }}
                    >
                      No images in folder
                    </span>
                  ) : (
                    siteVisitPhotoFiles.map((f, index) => (
                      <div
                        key={f.name}
                        style={{
                          width: "100%",
                          minWidth: 0,
                          position: "relative",
                          height: 0,
                          paddingBottom: "100%",
                          boxSizing: "border-box",
                          lineHeight: 0,
                        }}
                      >
                        <button
                          type="button"
                          title={f.name}
                          onClick={() => setPhotoViewerIndex(index)}
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            width: "100%",
                            height: "100%",
                            padding: 0,
                            margin: 0,
                            border: `2px solid ${WHITE}`,
                            borderRadius: "8px",
                            overflow: "hidden",
                            background: WHITE,
                            cursor: "pointer",
                            boxSizing: "border-box",
                            display: "block",
                          }}
                        >
                          <SiteVisitPhotoImg
                            projectId={project.id}
                            fileName={f.name}
                            alt=""
                            loading="lazy"
                            draggable={false}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Upload Photos (placeholder) */}
      {showUploadPhotosModal && (
        <div
          role="presentation"
          aria-hidden={false}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            pointerEvents: "auto",
            touchAction: "none",
          }}
          onClick={closeUploadPhotosModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sitevisit-upload-photos-title"
            style={{
              background: SECTION_GREY,
              borderRadius: "18px",
              padding: "32px",
              width: "90%",
              maxWidth: "480px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
              pointerEvents: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="sitevisit-upload-photos-title"
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                marginTop: 0,
                marginBottom: "24px",
                color: MONUMENT,
              }}
            >
              Upload Photos
            </h2>
            <input
              ref={siteVisitPhotoInputRef}
              type="file"
              accept="image/*,.heic,.heif,image/heic,image/heif"
              multiple
              disabled={
                !!uploadSession &&
                uploadSession.items.some(
                  (row) => row.status === "queued" || row.status === "uploading"
                )
              }
              onChange={handlePhotoUpload}
            />
            {uploadSession && uploadSession.items.length > 0 && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  marginTop: "20px",
                  paddingTop: "16px",
                  borderTop: `1px solid ${SECTION_GREY}`,
                }}
              >
                <div
                  style={{
                    fontSize: "0.9rem",
                    color: "#32323399",
                    marginBottom: "12px",
                    fontWeight: 600,
                  }}
                >
                  Upload queue
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {uploadSession.items.map((row, idx) => (
                    <div key={`${row.name}-${idx}`}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "10px",
                          fontSize: "0.875rem",
                          color: MONUMENT,
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            minWidth: 0,
                            flex: 1,
                          }}
                          title={row.name}
                        >
                          {row.name}
                        </span>
                        <span
                          style={{
                            flexShrink: 0,
                            color:
                              row.status === "error"
                                ? "#c62828"
                                : row.status === "done"
                                  ? "#2e7d32"
                                  : "#32323399",
                            fontWeight: 500,
                          }}
                        >
                          {row.status === "queued" && "Waiting…"}
                          {row.status === "uploading" && `Uploading ${row.progress}%`}
                          {row.status === "done" && "Done"}
                          {row.status === "error" && (row.error || "Failed")}
                        </span>
                      </div>
                      {row.status === "uploading" && (
                        <div
                          style={{
                            height: "8px",
                            background: "rgba(255,255,255,0.6)",
                            borderRadius: "4px",
                            marginTop: "8px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${row.progress}%`,
                              height: "100%",
                              background: MONUMENT,
                              borderRadius: "4px",
                              transition: "width 0.12s ease-out",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
              <button
                type="button"
                onClick={closeUploadPhotosModal}
                style={{
                  background: "#e0e0e0",
                  color: MONUMENT,
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.17s",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {photoViewerIndex !== null &&
        project?.id &&
        siteVisitPhotoFiles.length > 0 &&
        siteVisitPhotoFiles[photoViewerIndex] && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Photo viewer"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.88)",
              zIndex: 2100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
              touchAction: "none",
            }}
            onClick={() => setPhotoViewerIndex(null)}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={(e) => {
                e.stopPropagation();
                setPhotoViewerIndex(null);
              }}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                zIndex: 10,
                width: "44px",
                height: "44px",
                border: "none",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.18)",
                color: WHITE,
                fontSize: "1.75rem",
                lineHeight: 1,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              ×
            </button>
            {siteVisitPhotoFiles.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotoViewerIndex((i) =>
                      i === null
                        ? null
                        : (i - 1 + siteVisitPhotoFiles.length) %
                          siteVisitPhotoFiles.length
                    );
                  }}
                  style={{
                    position: "absolute",
                    left: "max(12px, env(safe-area-inset-left))",
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 10,
                    width: "48px",
                    height: "48px",
                    border: "none",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.18)",
                    color: WHITE,
                    fontSize: "1.75rem",
                    lineHeight: 1,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPhotoViewerIndex((i) =>
                      i === null ? null : (i + 1) % siteVisitPhotoFiles.length
                    );
                  }}
                  style={{
                    position: "absolute",
                    right: "max(12px, env(safe-area-inset-right))",
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 10,
                    width: "48px",
                    height: "48px",
                    border: "none",
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.18)",
                    color: WHITE,
                    fontSize: "1.75rem",
                    lineHeight: 1,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  ›
                </button>
              </>
            )}
            <div
              role="presentation"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: "min(92vw, 1200px)",
                maxHeight: "88vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "56px 56px 24px",
                boxSizing: "border-box",
              }}
            >
              <SiteVisitPhotoImg
                projectId={project.id}
                fileName={siteVisitPhotoFiles[photoViewerIndex].name}
                alt={siteVisitPhotoFiles[photoViewerIndex].name}
                style={{
                  maxWidth: "100%",
                  maxHeight: "min(78vh, 900px)",
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                }}
              />
              <div
                style={{
                  marginTop: "14px",
                  color: "rgba(255,255,255,0.88)",
                  fontSize: "0.875rem",
                  textAlign: "center",
                  wordBreak: "break-word",
                  maxWidth: "100%",
                }}
              >
                {siteVisitPhotoFiles[photoViewerIndex].name}
              </div>
            </div>
          </div>
        )}

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
