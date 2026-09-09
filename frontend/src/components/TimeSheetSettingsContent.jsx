import React, { useMemo, useRef, useState } from "react";
import { getLoggedInUserId } from "../utils/auth";
import TimeSheetFourColumns from "../pages/timeSheet/TimeSheetFourColumns";
import TimeSheetSideMenu from "./TimeSheetSideMenu";
import { useEmailSendOverlay } from "./EmailSendOverlay";
import { getPayCycleWednesdayForDate, getPayPeriodDays } from "../utils/timeSheetPayCycle";
import { TIMESHEET_GAP } from "../utils/timesheetLayout";
import { saveTimesheetToServer } from "../utils/timeSheetExport";
import { prefetchConstructionProjectsForTimeSheet } from "../utils/timeSheetProjects";
import { TEXT } from "../utils/uiThemeTokens";

export default function TimeSheetSettingsContent() {
  const loggedInUserId = getLoggedInUserId() || "";
  const [resetSignal, setResetSignal] = useState(0);
  const [sending, setSending] = useState(false);
  const dayEntriesRef = useRef(null);
  const { runWithEmailOverlay } = useEmailSendOverlay();

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
      await runWithEmailOverlay(async () => {
        await prefetchConstructionProjectsForTimeSheet();
        await saveTimesheetToServer({
          cycleKey,
          periodDays: currentPeriodDays,
          dayEntries: dayEntriesRef.current,
        });
        await new Promise((resolve) => setTimeout(resolve, 700));
      });
      alert("Time sheet sent.");
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
    </div>
  );
}
