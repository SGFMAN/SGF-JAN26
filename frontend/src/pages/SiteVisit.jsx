import React, { useState, useEffect, useRef, useCallback } from "react";

import { UI, MENU, outlineBorder } from "../utils/uiThemeTokens.js";
import { buildSavedButtonStyle } from "../utils/uiButtonStyles.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const FIELD_OUTLINE = outlineBorder;
const API_URL = "";

const SITE_VISIT_PHOTO_TAB_BUTTON_ID = 3;

const siteVisitTabButtonBase = {
  padding: "8px 14px",
  borderRadius: "8px",
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
  boxSizing: "border-box",
  transition: "background 0.17s, border-color 0.17s, color 0.17s",
};

function siteVisitTabButtonFallback(selected) {
  return selected
    ? {
        background: MENU.purple,
        color: MENU.activeText,
        border: FIELD_OUTLINE,
      }
    : {
        background: WHITE,
        color: MONUMENT,
        border: FIELD_OUTLINE,
      };
}

function mergeSiteVisitTabButtonStyle(selected, fallback) {
  const saved = buildSavedButtonStyle(SITE_VISIT_PHOTO_TAB_BUTTON_ID, selected);
  return saved ? { ...saved } : fallback;
}

function siteVisitTabHoverHandlers(usesSavedStyle, selected) {
  if (usesSavedStyle || selected) return {};
  return {
    onMouseEnter: (e) => {
      e.currentTarget.style.background = UI.inputBg;
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.background = WHITE;
    },
  };
}

/** Matches backend `normalizeSiteVisitPhotoSet`: `5. PHOTOS` subfolders. */
const SITE_VISIT_PHOTO_TAB_PRE = "pre";
const SITE_VISIT_PHOTO_TAB_CONSTRUCTION = "construction";

function siteVisitPhotoSrc(projectId, fileName, photoSet = SITE_VISIT_PHOTO_TAB_PRE) {
  const folder =
    photoSet === SITE_VISIT_PHOTO_TAB_CONSTRUCTION ? SITE_VISIT_PHOTO_TAB_CONSTRUCTION : SITE_VISIT_PHOTO_TAB_PRE;
  return `${API_URL}/api/sitevisit/photo-file?projectId=${encodeURIComponent(String(projectId))}&name=${encodeURIComponent(fileName)}&photoSet=${encodeURIComponent(folder)}`;
}

function isHeicLikeSiteVisitFileName(name) {
  return /\.(hei[cf])$/i.test(name || "");
}

/** True when the server already sent a raster format the browser can draw (e.g. sharp HEIC→JPEG). */
function isBrowserFriendlyImageBlobType(mime) {
  const t = String(mime || "").toLowerCase();
  return (
    t === "image/jpeg" ||
    t === "image/png" ||
    t === "image/gif" ||
    t === "image/webp" ||
    t === "image/bmp" ||
    t === "image/svg+xml"
  );
}

/** Many stacks send JPEG bytes with empty or `application/octet-stream` MIME — sniff magic bytes. */
function sniffRasterMimeFromArrayBuffer(buffer) {
  const u = new Uint8Array(buffer);
  if (u.length >= 3 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return "image/jpeg";
  if (
    u.length >= 8 &&
    u[0] === 0x89 &&
    u[1] === 0x50 &&
    u[2] === 0x4e &&
    u[3] === 0x47 &&
    u[4] === 0x0d &&
    u[5] === 0x0a &&
    u[6] === 0x1a &&
    u[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    u.length >= 6 &&
    u[0] === 0x47 &&
    u[1] === 0x49 &&
    u[2] === 0x46 &&
    u[3] === 0x38 &&
    (u[4] === 0x37 || u[4] === 0x39) &&
    u[5] === 0x61
  ) {
    return "image/gif";
  }
  if (u.length >= 12 && u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46) {
    if (u[8] === 0x57 && u[9] === 0x45 && u[10] === 0x42 && u[11] === 0x50) return "image/webp";
  }
  if (u.length >= 2 && u[0] === 0x42 && u[1] === 0x4d) return "image/bmp";
  return "";
}

function responseBodyLooksLikeNonImage(buffer) {
  const u = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 80)));
  const s = new TextDecoder("utf-8", { fatal: false }).decode(u).trimStart();
  return s.startsWith("<") || s.startsWith("{") || s.startsWith("[");
}

/**
 * Fetch site-visit photo bytes; prefer real JPEG/PNG (by header); else heic2any for HEIC/HEIF.
 * Used for .heic/.heif names so we do not rely on `<img onError>` (unreliable for some HEIC responses).
 */
async function fetchSiteVisitPhotoAsDisplayableBlob(url, signal) {
  const res = await fetch(url, { signal, credentials: "same-origin" });
  if (!res.ok) throw new Error(String(res.status));
  const blob = await res.blob();
  if (isBrowserFriendlyImageBlobType(blob.type)) {
    return blob;
  }
  const buf = await blob.arrayBuffer();
  if (responseBodyLooksLikeNonImage(buf)) {
    throw new Error("not-image-body");
  }
  const sniffed = sniffRasterMimeFromArrayBuffer(buf);
  if (sniffed) {
    return new Blob([buf], { type: sniffed });
  }
  const mod = await import("heic2any");
  const heic2any = mod.default;
  const heicBlob = new Blob([buf], { type: blob.type && blob.type !== "application/octet-stream" ? blob.type : "image/heic" });
  const out = await heic2any({ blob: heicBlob, toType: "image/jpeg", quality: 0.88 });
  return Array.isArray(out) ? out[0] : out;
}

const SITE_VISIT_HEIC_LOADING_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * HEIC/HEIF: proactive fetch + decode (or use server JPEG). Other formats: plain URL in `<img>`.
 * Fallback `onError` for HEIC-like names if proactive path failed.
 */
function SiteVisitPhotoImg({
  projectId,
  fileName,
  photoSet = SITE_VISIT_PHOTO_TAB_PRE,
  alt,
  style,
  loading,
  draggable,
}) {
  const set =
    photoSet === SITE_VISIT_PHOTO_TAB_CONSTRUCTION ? SITE_VISIT_PHOTO_TAB_CONSTRUCTION : SITE_VISIT_PHOTO_TAB_PRE;
  const originalSrc = siteVisitPhotoSrc(projectId, fileName, set);
  const [src, setSrc] = useState(() =>
    isHeicLikeSiteVisitFileName(fileName) ? SITE_VISIT_HEIC_LOADING_PIXEL : originalSrc
  );
  const blobUrlRef = useRef(null);
  const displayableReadyRef = useRef(false);

  const revokeBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => revokeBlob();
  }, [revokeBlob]);

  useEffect(() => {
    const ac = new AbortController();
    displayableReadyRef.current = false;
    revokeBlob();

    if (!isHeicLikeSiteVisitFileName(fileName)) {
      setSrc(originalSrc);
      return () => {
        ac.abort();
      };
    }

    setSrc(SITE_VISIT_HEIC_LOADING_PIXEL);

    (async () => {
      try {
        const displayable = await fetchSiteVisitPhotoAsDisplayableBlob(originalSrc, ac.signal);
        if (ac.signal.aborted) return;
        const u = URL.createObjectURL(displayable);
        revokeBlob();
        blobUrlRef.current = u;
        displayableReadyRef.current = true;
        setSrc(u);
      } catch (e) {
        if (e?.name === "AbortError") return;
        console.warn("Site visit HEIC proactive load failed:", e);
        if (ac.signal.aborted) return;
        displayableReadyRef.current = false;
        setSrc(originalSrc);
      }
    })();

    return () => {
      ac.abort();
      revokeBlob();
    };
  }, [originalSrc, fileName, set, revokeBlob]);

  const tryHeicClientDecodeOnError = useCallback(async () => {
    if (displayableReadyRef.current || !isHeicLikeSiteVisitFileName(fileName)) return;
    displayableReadyRef.current = true;
    try {
      const displayable = await fetchSiteVisitPhotoAsDisplayableBlob(originalSrc, undefined);
      const u = URL.createObjectURL(displayable);
      revokeBlob();
      blobUrlRef.current = u;
      setSrc(u);
    } catch (e) {
      console.warn("Site visit HEIC onError decode failed:", e);
      displayableReadyRef.current = false;
    }
  }, [originalSrc, fileName, set, revokeBlob]);

  return (
    <img
      src={src}
      alt={alt}
      style={style}
      loading={loading}
      draggable={draggable}
      onError={() => {
        void tryHeicClientDecodeOnError();
      }}
    />
  );
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function SiteVisit({ project, onUpdate }) {
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [siteVisitPhotoFiles, setSiteVisitPhotoFiles] = useState([]);
  const [siteVisitPhotosLoading, setSiteVisitPhotosLoading] = useState(false);
  /** `pre` → Pre-Construction -Site Photos; `construction` → Construction Photos (same `5. PHOTOS` tree). */
  const [siteVisitPhotoTab, setSiteVisitPhotoTab] = useState(SITE_VISIT_PHOTO_TAB_PRE);
  /** null = closed; otherwise index into `siteVisitPhotoFiles` */
  const [photoViewerIndex, setPhotoViewerIndex] = useState(null);
  const [siteVisitNotes, setSiteVisitNotes] = useState(project?.site_visit_notes || "");
  const [, setUiButtonStyleRevision] = useState(0);
  
  const valuesRef = useRef({ siteVisitNotes });

  useEffect(() => {
    const refresh = () => setUiButtonStyleRevision((n) => n + 1);
    window.addEventListener("sgf-ui-button-styles-change", refresh);
    window.addEventListener("sgf-ui-theme-change", refresh);
    return () => {
      window.removeEventListener("sgf-ui-button-styles-change", refresh);
      window.removeEventListener("sgf-ui-theme-change", refresh);
    };
  }, []);

  useEffect(() => {
    if (photoViewerIndex === null) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [photoViewerIndex]);

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
    const setParam =
      siteVisitPhotoTab === SITE_VISIT_PHOTO_TAB_CONSTRUCTION
        ? SITE_VISIT_PHOTO_TAB_CONSTRUCTION
        : SITE_VISIT_PHOTO_TAB_PRE;
    setSiteVisitPhotosLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/sitevisit/photos?projectId=${encodeURIComponent(project.id)}&photoSet=${encodeURIComponent(setParam)}`
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
  }, [project?.id, siteVisitPhotoTab]);

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

  const preConstructionTabSelected = siteVisitPhotoTab === SITE_VISIT_PHOTO_TAB_PRE;
  const constructionTabSelected = siteVisitPhotoTab === SITE_VISIT_PHOTO_TAB_CONSTRUCTION;
  const preConstructionTabButtonStyle = mergeSiteVisitTabButtonStyle(preConstructionTabSelected, {
    ...siteVisitTabButtonBase,
    ...siteVisitTabButtonFallback(preConstructionTabSelected),
  });
  const constructionTabButtonStyle = mergeSiteVisitTabButtonStyle(constructionTabSelected, {
    ...siteVisitTabButtonBase,
    ...siteVisitTabButtonFallback(constructionTabSelected),
  });
  const preConstructionTabUsesSavedStyle = Boolean(
    buildSavedButtonStyle(SITE_VISIT_PHOTO_TAB_BUTTON_ID, preConstructionTabSelected)
  );
  const constructionTabUsesSavedStyle = Boolean(
    buildSavedButtonStyle(SITE_VISIT_PHOTO_TAB_BUTTON_ID, constructionTabSelected)
  );

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, alignSelf: "stretch" }}>
        <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT, flexShrink: 0 }}>
          Site Visit
        </h2>
        {project && (
          <div
            style={{
              marginTop: "24px",
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)",
              gap: "24px",
              alignItems: "stretch",
            }}
          >
            {/* Column 1 (1/3) — status, date, time + notes */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
                minHeight: 0,
                height: "100%",
                boxSizing: "border-box",
              }}
            >
              {/* Status, Date, Time — auto-width; wrap within column */}
              <div
                style={{
                  marginBottom: "16px",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                  alignItems: "flex-start",
                  minWidth: 0,
                  width: "100%",
                  flexShrink: 0,
                }}
              >
                <div style={{ flexShrink: 0, width: "max-content", maxWidth: "100%" }}>
                  <div
                    style={{
                      fontSize: "0.9rem",
                      color: UI.textMuted,
                      marginBottom: "6px",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
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
                      border: FIELD_OUTLINE,
                      background: WHITE,
                      width: "max-content",
                      maxWidth: "100%",
                      boxSizing: "border-box",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {SITE_VISIT_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                {project.site_visit_scheduled_date && (
                  <div style={{ flexShrink: 0, width: "max-content", maxWidth: "100%", minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        color: UI.textMuted,
                        marginBottom: "6px",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Date
                    </div>
                    <div
                      style={{
                        fontSize: "1rem",
                        color: MONUMENT,
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: FIELD_OUTLINE,
                        background: WHITE,
                        width: "max-content",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      {new Date(project.site_visit_scheduled_date + "T00:00:00").toLocaleDateString("en-AU", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                )}

                {project.site_visit_scheduled_period && (
                  <div style={{ flexShrink: 0, width: "max-content", maxWidth: "100%" }}>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        color: UI.textMuted,
                        marginBottom: "6px",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Time
                    </div>
                    <div
                      style={{
                        fontSize: "1rem",
                        color: MONUMENT,
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: FIELD_OUTLINE,
                        background: WHITE,
                        width: "max-content",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {project.site_visit_scheduled_period}
                    </div>
                  </div>
                )}
              </div>

              {(siteVisitStatus === "Booked" || siteVisitStatus === "Complete") && project.site_visit_date && (
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                    {siteVisitStatus === "Complete" ? "Completed Date" : "Date"}
                  </div>
                  <div
                    style={{
                      fontSize: "1rem",
                      color: MONUMENT,
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: FIELD_OUTLINE,
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
                  <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500 }}>
                    {siteVisitStatus === "Complete" ? "Completed Time" : "Time"}
                  </div>
                  <div
                    style={{
                      fontSize: "1rem",
                      color: MONUMENT,
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border: FIELD_OUTLINE,
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

              {siteVisitStatus !== "Complete" && siteVisitStatus === "Booked" && (
                <div style={{ marginBottom: "16px", display: "flex", gap: "12px", flexWrap: "wrap", flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => setShowCompleteModal(true)}
                    style={{
                      background: MONUMENT,
                      color: PAGE_TEXT,
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
                      color: PAGE_TEXT,
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
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  minHeight: 0,
                }}
              >
                <div style={{ fontSize: "0.9rem", color: UI.textMuted, marginBottom: "6px", fontWeight: 500, flexShrink: 0 }}>
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
                    minHeight: 0,
                    padding: "12px",
                    borderRadius: "8px",
                    border: FIELD_OUTLINE,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: WHITE,
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    resize: "none",
                  }}
                />
              </div>
            </div>

            {/* Column 2 (2/3) — site photos */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
                minWidth: 0,
                minHeight: 0,
                height: "100%",
                width: "100%",
                boxSizing: "border-box",
                containerType: "inline-size",
              }}
            >
              <div
                role="tablist"
                aria-label="Photo folder"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginBottom: "10px",
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={preConstructionTabSelected}
                  onClick={() => {
                    setPhotoViewerIndex(null);
                    setSiteVisitPhotoTab(SITE_VISIT_PHOTO_TAB_PRE);
                  }}
                  style={preConstructionTabButtonStyle}
                  {...siteVisitTabHoverHandlers(preConstructionTabUsesSavedStyle, preConstructionTabSelected)}
                >
                  Pre-construction
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={constructionTabSelected}
                  onClick={() => {
                    setPhotoViewerIndex(null);
                    setSiteVisitPhotoTab(SITE_VISIT_PHOTO_TAB_CONSTRUCTION);
                  }}
                  style={constructionTabButtonStyle}
                  {...siteVisitTabHoverHandlers(constructionTabUsesSavedStyle, constructionTabSelected)}
                >
                  Construction
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                  gridAutoRows: "auto",
                  gap: "8px",
                  alignItems: "start",
                  alignContent: "start",
                  width: "100%",
                  boxSizing: "border-box",
                  overflowY: "auto",
                  overflowX: "hidden",
                  padding: "8px",
                  flex: 1,
                  minHeight: 0,
                  border: FIELD_OUTLINE,
                  borderRadius: "8px",
                  background: WHITE,
                }}
              >
                  {siteVisitPhotosLoading ? (
                    <span
                      style={{
                        gridColumn: "1 / -1",
                        color: UI.textMuted,
                        fontSize: "0.875rem",
                      }}
                    >
                      Loading…
                    </span>
                  ) : siteVisitPhotoFiles.length === 0 ? (
                    <span
                      style={{
                        gridColumn: "1 / -1",
                        color: UI.textMuted,
                        fontSize: "0.875rem",
                      }}
                    >
                      No images in this folder
                    </span>
                  ) : (
                    siteVisitPhotoFiles.map((f, index) => (
                      <div
                        key={`${siteVisitPhotoTab}-${f.name}`}
                        style={{
                          width: "100%",
                          minWidth: 0,
                          aspectRatio: "1",
                          position: "relative",
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
                            photoSet={siteVisitPhotoTab}
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
        )}
      </div>

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
                key={`${siteVisitPhotoTab}-${siteVisitPhotoFiles[photoViewerIndex].name}`}
                projectId={project.id}
                fileName={siteVisitPhotoFiles[photoViewerIndex].name}
                photoSet={siteVisitPhotoTab}
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
                  color: "var(--sgf-page-text)",
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
                color: UI.textMuted,
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
                  color: PAGE_TEXT,
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
