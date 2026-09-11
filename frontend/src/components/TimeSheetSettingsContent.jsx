import React, { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getLoggedInUserId } from "../utils/auth";
import TimeSheetFourColumns from "../pages/timeSheet/TimeSheetFourColumns";
import TimeSheetSideMenu from "./TimeSheetSideMenu";
import { getPayCycleWednesdayForDate, getPayPeriodDays } from "../utils/timeSheetPayCycle";
import { TIMESHEET_GAP } from "../utils/timesheetLayout";
import { saveTimesheetToServer } from "../utils/timeSheetExport";
import { prefetchConstructionProjectsForTimeSheet } from "../utils/timeSheetProjects";
import { UI, TEXT, outlineBorder } from "../utils/uiThemeTokens";

const SENT_MODAL_Z = 10020;

export default function TimeSheetSettingsContent() {
  const loggedInUserId = getLoggedInUserId() || "";
  const [resetSignal, setResetSignal] = useState(0);
  const [sending, setSending] = useState(false);
  const [showSentModal, setShowSentModal] = useState(false);
  const dayEntriesRef = useRef(null);

  const currentCycleWednesday = useMemo(() => getPayCycleWednesdayForDate(), []);
  const currentPeriodDays = useMemo(
    () => getPayPeriodDays(currentCycleWednesday),
    [currentCycleWednesday]
  );
  const cycleKey = currentCycleWednesday.toISOString().slice(0, 10);

  if (!loggedInUserId) {
    return (
      <p style={{ margin: 0, color: TEXT.dark }}>Could not determine the logged-in user.</p>
    );
  }

  async function handleSend() {
    if (sending) return;
    try {
      setSending(true);
      await prefetchConstructionProjectsForTimeSheet();
      await saveTimesheetToServer({
        cycleKey,
        periodDays: currentPeriodDays,
        dayEntries: dayEntriesRef.current,
      });
      setShowSentModal(true);
    } catch (error) {
      console.error("Time sheet send:", error);
      alert(error.message || "Failed to send time sheet.");
    } finally {
      setSending(false);
    }
  }

  function handleReset() {
    setResetSignal((n) => n + 1);
  }

  function closeSentModal() {
    setShowSentModal(false);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap: TIMESHEET_GAP,
        alignItems: "stretch",
      }}
    >
      <TimeSheetSideMenu onSend={handleSend} onReset={handleReset} sending={sending} />
      <TimeSheetFourColumns
        users={[]}
        selectedUserId={loggedInUserId}
        onUserChange={() => {}}
        loadingUsers={false}
        showDates
        periodDays={currentPeriodDays}
        cycleKey={cycleKey}
        hideUserSelect
        autoSize
        resetSignal={resetSignal}
        exportDayEntriesRef={dayEntriesRef}
      />
      {showSentModal
        ? createPortal(
            <div
              role="presentation"
              onClick={closeSentModal}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0, 0, 0, 0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: SENT_MODAL_Z,
                padding: "24px",
                boxSizing: "border-box",
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="timesheet-sent-title"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: UI.cardBg,
                  borderRadius: "16px",
                  padding: "28px 32px",
                  width: "min(420px, 92vw)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "20px",
                  color: TEXT.dark,
                  textAlign: "center",
                }}
              >
                <h2
                  id="timesheet-sent-title"
                  style={{
                    margin: 0,
                    fontSize: "1.25rem",
                    fontWeight: 600,
                    color: TEXT.dark,
                    lineHeight: 1.35,
                  }}
                >
                  Timesheet has been sent.
                </h2>
                <button
                  type="button"
                  onClick={closeSentModal}
                  style={{
                    height: "36px",
                    padding: "0 20px",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: TEXT.dark,
                    background: UI.cardBg,
                    border: outlineBorder,
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  OK
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
