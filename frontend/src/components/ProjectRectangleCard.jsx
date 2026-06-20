import React, { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CLASSIFICATION_BADGE_MAP } from "../utils/classifications";
import { getProjectStreamBadge } from "../utils/streamBadges";
import { projectPath } from "../utils/projectUrl";
import { OnHoldSash, CancelledSash } from "./ProjectStatusSash";

import { UI, PROJECT_CARD } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const CARD_TEXT = PROJECT_CARD.text;
const PAGE_TEXT = UI.pageText;
const OUTLINE = UI.outline;

const CARD_W = 200;
const CARD_H = 100;

/**
 * Same dark rectangle as the main /projects (Design Phase) grid.
 * @param {{ project: object, fitColumn?: boolean, onInteract?: () => void }} props — when fitColumn, scales to parent width. If onInteract is set, it runs instead of linking to the project page.
 */
export default function ProjectRectangleCard({ project, fitColumn = false, onInteract }) {
  const measureRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (!fitColumn) {
      setScale(1);
      return;
    }
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (!w) return;
      setScale(Math.min(2, w / CARD_W));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitColumn]);

  const classificationInfo = project.classification
    ? CLASSIFICATION_BADGE_MAP[project.classification]
    : null;
  const streamInfo = getProjectStreamBadge(project);
  const onHold = project.on_hold === "true" || project.on_hold === true;
  const cancelled = project.status === "Cancelled";

  const face = (
    <div
      className="project-folder-card"
      style={{
        width: `${CARD_W}px`,
        height: `${CARD_H}px`,
        borderRadius: "8px",
      }}
    >
      <div
        className="project-folder-card__face"
        style={{
          background: PROJECT_CARD.bg,
          borderRadius: "8px",
          border: `2px solid ${OUTLINE}`,
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
          width: "100%",
          height: "100%",
          color: SECTION_GREY,
          cursor: "pointer",
          transition: "opacity 0.2s",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
      {onHold && <OnHoldSash />}
      {cancelled && <CancelledSash />}
      {streamInfo && (
        <div
          style={{
            position: "absolute",
            bottom: "8px",
            left: "8px",
            fontSize: "0.85rem",
            fontWeight: 700,
            color: streamInfo.color,
            zIndex: onHold || cancelled ? 11 : 5,
            textShadow: "0 1px 2px rgba(0,0,0,0.3)",
          }}
        >
          {streamInfo.acronym}
        </div>
      )}
      {classificationInfo && (
        <div
          style={{
            position: "absolute",
            bottom: "8px",
            right: "8px",
            fontSize: "0.85rem",
            fontWeight: 700,
            color: CARD_TEXT,
            zIndex: onHold || cancelled ? 11 : 5,
            textShadow: "0 1px 2px rgba(0,0,0,0.3)",
          }}
        >
          {classificationInfo.acronym}
        </div>
      )}
      <div
        style={{
          fontWeight: 600,
          fontSize: "1.1rem",
          textAlign: "center",
          marginBottom: "4px",
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flex: 1,
          flexDirection: "column",
          gap: "4px",
          position: "relative",
          zIndex: onHold ? 1 : "auto",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: "1.1rem", color: CARD_TEXT }}>
          {(project.suburb || "Unknown Suburb").toUpperCase()}
        </div>
        <div style={{ fontSize: "0.95rem", color: CARD_TEXT, fontWeight: 400 }}>
          {project.street || "No address"}
        </div>
      </div>
      </div>
    </div>
  );

  const inner = fitColumn ? (
    <div
      ref={measureRef}
      className="project-folder-card-scaler"
      style={{
        width: "100%",
        height: CARD_H * scale,
        overflow: "hidden",
        borderRadius: "8px",
      }}
    >
      <div
        style={{
          width: CARD_W,
          height: CARD_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {face}
      </div>
    </div>
  ) : (
    face
  );

  const outerStyle = {
    textDecoration: "none",
    display: "block",
    width: fitColumn ? "100%" : undefined,
    minWidth: 0,
    ...(onInteract ? { cursor: "pointer" } : {}),
  };

  if (onInteract) {
    return (
      <div
        role="button"
        tabIndex={0}
        style={outerStyle}
        onClick={() => onInteract()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onInteract();
          }
        }}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link to={projectPath(project)} style={outerStyle}>
      {inner}
    </Link>
  );
}
