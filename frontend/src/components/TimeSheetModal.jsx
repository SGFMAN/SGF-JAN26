import React, { useMemo } from "react";
import TimeSheetSettingsContent from "./TimeSheetSettingsContent";
import { UI, TEXT } from "../utils/uiThemeTokens";
import { TIMESHEET_GAP } from "../utils/timesheetLayout";
import {
  formatPeriodRange,
  getPayCycleWednesdayForDate,
  getPayPeriodBounds,
} from "../utils/timeSheetPayCycle";

export default function TimeSheetModal({ open, onClose }) {
  const title = useMemo(() => {
    const cycleWednesday = getPayCycleWednesdayForDate();
    const { periodStart, periodEnd } = getPayPeriodBounds(cycleWednesday);
    return `Time Sheet - ${formatPeriodRange(periodStart, periodEnd)}`;
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10006,
        padding: "24px",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="timesheet-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: UI.cardBg,
          borderRadius: "16px",
          padding: TIMESHEET_GAP,
          width: "max-content",
          maxWidth: "min(1200px, 95vw)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: TIMESHEET_GAP,
          color: TEXT.dark,
          overflow: "visible",
        }}
      >
        <div
          style={{
            position: "relative",
            flexShrink: 0,
            textAlign: "center",
            minHeight: "1.5rem",
          }}
        >
          <h2
            id="timesheet-modal-title"
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 600,
              color: TEXT.dark,
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              border: "none",
              background: "transparent",
              fontSize: "1.5rem",
              lineHeight: 1,
              cursor: "pointer",
              color: TEXT.dark,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        <TimeSheetSettingsContent />
      </div>
    </div>
  );
}
