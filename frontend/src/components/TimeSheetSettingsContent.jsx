import React, { useEffect, useMemo, useRef, useState } from "react";
import { getLoggedInUserId, isUserAdmin } from "../utils/auth";
import TimeSheetFourColumns from "../pages/timeSheet/TimeSheetFourColumns";
import TimeSheetSideMenu from "./TimeSheetSideMenu";
import { getPayCycleWednesdayForDate, getPayPeriodDays } from "../utils/timeSheetPayCycle";
import { TIMESHEET_GAP } from "../utils/timesheetLayout";
import { exportTimesheetToServer } from "../utils/timeSheetExport";
import { prefetchConstructionProjectsForTimeSheet } from "../utils/timeSheetProjects";
import { TEXT } from "../utils/uiThemeTokens";

export default function TimeSheetSettingsContent() {
  const loggedInUserId = getLoggedInUserId() || "";
  const [resetSignal, setResetSignal] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dayEntriesRef = useRef(null);

  const currentCycleWednesday = useMemo(() => getPayCycleWednesdayForDate(), []);
  const currentPeriodDays = useMemo(
    () => getPayPeriodDays(currentCycleWednesday),
    [currentCycleWednesday]
  );
  const cycleKey = currentCycleWednesday.toISOString().slice(0, 10);

  useEffect(() => {
    let cancelled = false;
    isUserAdmin().then((admin) => {
      if (!cancelled) setIsAdmin(admin);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loggedInUserId) {
    return (
      <p style={{ margin: 0, color: TEXT.dark }}>Could not determine the logged-in user.</p>
    );
  }

  async function handleExport() {
    if (exporting) return;
    try {
      setExporting(true);
      await prefetchConstructionProjectsForTimeSheet();
      const result = await exportTimesheetToServer({
        cycleKey,
        periodDays: currentPeriodDays,
        cycleWednesday: currentCycleWednesday,
        dayEntries: dayEntriesRef.current,
      });
      alert(`Time sheet saved to:\n${result.filePath}`);
    } catch (error) {
      console.error("Time sheet export:", error);
      alert(error.message || "Failed to export time sheet.");
    } finally {
      setExporting(false);
    }
  }

  function handleSend() {
    handleExport();
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
      <TimeSheetSideMenu
        onSend={handleSend}
        onReset={handleReset}
        onExport={handleExport}
        showExport={isAdmin}
        exporting={exporting}
      />
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
