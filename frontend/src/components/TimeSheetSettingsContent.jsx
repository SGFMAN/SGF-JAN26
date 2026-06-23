import React, { useMemo, useState } from "react";
import { getLoggedInUserId } from "../utils/auth";
import TimeSheetFourColumns from "../pages/timeSheet/TimeSheetFourColumns";
import TimeSheetSideMenu from "./TimeSheetSideMenu";
import { getPayCycleWednesdayForDate, getPayPeriodDays } from "../utils/timeSheetPayCycle";
import { TIMESHEET_GAP } from "../utils/timesheetLayout";
import { TEXT } from "../utils/uiThemeTokens";

export default function TimeSheetSettingsContent() {
  const loggedInUserId = getLoggedInUserId() || "";
  const [resetSignal, setResetSignal] = useState(0);

  const currentCycleWednesday = useMemo(() => getPayCycleWednesdayForDate(), []);
  const currentPeriodDays = useMemo(
    () => getPayPeriodDays(currentCycleWednesday),
    [currentCycleWednesday]
  );

  if (!loggedInUserId) {
    return (
      <p style={{ margin: 0, color: TEXT.dark }}>Could not determine the logged-in user.</p>
    );
  }

  function handleSend() {
    // Placeholder — send workflow to be wired up later.
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
      <TimeSheetSideMenu onSend={handleSend} onReset={handleReset} />
      <TimeSheetFourColumns
        users={[]}
        selectedUserId={loggedInUserId}
        onUserChange={() => {}}
        loadingUsers={false}
        showDates
        periodDays={currentPeriodDays}
        cycleKey={currentCycleWednesday.toISOString().slice(0, 10)}
        hideUserSelect
        autoSize
        resetSignal={resetSignal}
      />
    </div>
  );
}
