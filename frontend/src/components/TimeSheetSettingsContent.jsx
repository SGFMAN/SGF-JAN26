import React, { useMemo } from "react";
import { getLoggedInUserId } from "../utils/auth";
import TimeSheetFourColumns from "../pages/timeSheet/TimeSheetFourColumns";
import { getPayCycleWednesdayForDate, getPayPeriodDays } from "../utils/timeSheetPayCycle";
import { UI } from "../utils/uiThemeTokens";

export default function TimeSheetSettingsContent() {
  const loggedInUserId = getLoggedInUserId() || "";

  const currentCycleWednesday = useMemo(() => getPayCycleWednesdayForDate(), []);
  const currentPeriodDays = useMemo(
    () => getPayPeriodDays(currentCycleWednesday),
    [currentCycleWednesday]
  );

  if (!loggedInUserId) {
    return (
      <>
        <h3
          style={{
            margin: "0 0 16px 0",
            fontSize: "1.2rem",
            fontWeight: 600,
            color: UI.textPrimary,
          }}
        >
          Time Sheet
        </h3>
        <p style={{ margin: 0, color: UI.textMuted }}>Could not determine the logged-in user.</p>
      </>
    );
  }

  return (
    <>
      <h3
        style={{
          margin: "0 0 16px 0",
          fontSize: "1.2rem",
          fontWeight: 600,
          color: UI.textPrimary,
        }}
      >
        Time Sheet
      </h3>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "480px",
          height: "100%",
        }}
      >
        <TimeSheetFourColumns
          users={[]}
          selectedUserId={loggedInUserId}
          onUserChange={() => {}}
          loadingUsers={false}
          showDates
          periodDays={currentPeriodDays}
          cycleKey={currentCycleWednesday.toISOString().slice(0, 10)}
          hideUserSelect
        />
      </div>
    </>
  );
}
