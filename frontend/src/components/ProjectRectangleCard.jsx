import React, { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CLASSIFICATION_BADGE_MAP } from "../utils/classifications";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";

const CARD_W = 200;
const CARD_H = 100;

const DESIGN_PHASE_STREAM_MAP = {
  "SGF - VIC": { acronym: "VIC", color: "#4D93D9" },
  "SGF - QLD": { acronym: "QLD", color: "#D54358" },
  "Dual Dwelling": { acronym: "DDI", color: "#92D050" },
  ATA: { acronym: "ATA", color: "#92D050" },
  "Pumped on Property": { acronym: "POP", color: "#92D050" },
  "Pumped On Property": { acronym: "POP", color: "#92D050" },
  Henderson: { acronym: "HEN", color: "#92D050" },
  "Creat Cash Flow": { acronym: "CCF", color: "#92D050" },
  "Create Cash Flow": { acronym: "CCF", color: "#92D050" },
  "Fresh Start Advisory": { acronym: "FSA", color: "#92D050" },
};

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
  const streamInfo = project.stream ? DESIGN_PHASE_STREAM_MAP[project.stream] : null;
  const onHold = project.on_hold === "true" || project.on_hold === true;
  const cancelled = project.status === "Cancelled";

  const face = (
    <div
      style={{
        background: MONUMENT,
        borderRadius: "8px",
        width: `${CARD_W}px`,
        height: `${CARD_H}px`,
        color: SECTION_GREY,
        cursor: "pointer",
        transition: "opacity 0.2s",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      {onHold && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%) rotate(-45deg)",
            width: "280px",
            height: "40px",
            background: "#0066cc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          <span
            style={{
              color: WHITE,
              fontWeight: 700,
              fontSize: "1.1rem",
              letterSpacing: "2px",
              textShadow: "0 1px 2px rgba(0,0,0,0.3)",
            }}
          >
            ON HOLD
          </span>
        </div>
      )}
      {cancelled && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%) rotate(-45deg)",
            width: "280px",
            height: "40px",
            background: "#cc0000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          <span
            style={{
              color: WHITE,
              fontWeight: 700,
              fontSize: "1.1rem",
              letterSpacing: "2px",
              textShadow: "0 1px 2px rgba(0,0,0,0.3)",
            }}
          >
            CANCELLED
          </span>
        </div>
      )}
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
            color: classificationInfo.color,
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
        <div style={{ fontWeight: 600, fontSize: "1.1rem", color: WHITE }}>
          {(project.suburb || "Unknown Suburb").toUpperCase()}
        </div>
        <div style={{ fontSize: "0.95rem", color: WHITE, fontWeight: 400 }}>
          {project.street || "No address"}
        </div>
      </div>
      <div
        style={{
          fontSize: "0.9rem",
          color: "#323233cc",
          textAlign: "center",
          position: "relative",
          zIndex: onHold ? 1 : "auto",
        }}
      >
        Status: {project.status}
      </div>
    </div>
  );

  const inner = fitColumn ? (
    <div
      ref={measureRef}
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
    <Link to={`/project/${project.id}`} style={outerStyle}>
      {inner}
    </Link>
  );
}
