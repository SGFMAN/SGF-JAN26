import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PAY_PERIOD_WEEKDAY_ORDER } from "../../utils/timeSheetPayCycle";
import {
  createDefaultDayEntries,
  formatBreakMinutes,
  formatOvertimeMinutes,
  formatWorkHoursMinutes,
  loadUserTemplate,
  saveUserTemplate,
  loadPayCycleSheet,
  savePayCycleSheet,
  getUserTemplateEntries,
  stepBreakMinutes,
  stepOvertimeMinutes,
  stepWorkMinutes,
  OFFICE_PROJECT_VALUE,
  DEFAULT_PROJECT_VALUE,
  SELECT_PROJECT_VALUE,
  SELECT_PROJECT_LABEL,
} from "../../utils/timeSheetTime";
import {
  filterConstructionProjects,
  formatConstructionProjectLabel,
  OFFICE_PROJECT_LABEL,
} from "../../utils/timeSheetProjects";
import TimeStepper from "./TimeStepper";

import { UI } from "../../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const BLACK = "#000000";
const ROW_GAP_MIN = 8;
const API_URL = "";

/** 8 equal gaps: padding (top/bottom/left/right) + 6 between 7 rows → (panelHeight - rows) / 8 */
function useUniformCellGap(panelRefs, deps) {
  const [cellGap, setCellGap] = useState(ROW_GAP_MIN);

  useLayoutEffect(() => {
    const measure = () => {
      const panels = panelRefs.current.filter(Boolean);
      if (!panels.length) return;

      let gap = ROW_GAP_MIN;
      for (const panel of panels) {
        const rows = panel.querySelectorAll("[data-day-row]");
        if (rows.length !== 7) continue;

        let rowsHeight = 0;
        rows.forEach((row) => {
          rowsHeight += row.getBoundingClientRect().height;
        });

        const panelHeight = panel.getBoundingClientRect().height;
        const next = (panelHeight - rowsHeight) / 8;
        if (next > 0) gap = Math.max(gap, next);
      }

      setCellGap(gap);
    };

    measure();
    const observers = panelRefs.current
      .filter(Boolean)
      .map((panel) => {
        const ro = new ResizeObserver(measure);
        ro.observe(panel);
        return ro;
      });

    return () => observers.forEach((ro) => ro.disconnect());
  }, deps);

  return cellGap;
}

function shortWeekday(weekday) {
  return weekday.slice(0, 3);
}

function shortDate(dateLabel) {
  if (!dateLabel) return "";
  const parts = dateLabel.split(" ");
  if (parts.length < 2) return dateLabel;
  return `${parts[0]} ${parts[1].slice(0, 3)}`;
}

export default function TimeSheetFourColumns({
  users,
  selectedUserId,
  onUserChange,
  loadingUsers,
  showDates = false,
  periodDays = [],
  persistTemplate = false,
  cycleKey = "",
}) {
  const [dayEntries, setDayEntries] = useState(createDefaultDayEntries);
  const [constructionProjects, setConstructionProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const week1PanelRef = useRef(null);
  const week2PanelRef = useRef(null);
  const weekPanelRefs = useRef([]);
  const skipAutoSaveRef = useRef(false);

  const isTemplate = !showDates;
  const hasUser = Boolean(selectedUserId);

  const days = showDates
    ? periodDays
    : PAY_PERIOD_WEEKDAY_ORDER.map((weekday, index) => ({ key: `template-${index}`, weekday }));

  weekPanelRefs.current = [week1PanelRef.current, week2PanelRef.current];
  const cellGap = useUniformCellGap(weekPanelRefs, [dayEntries, showDates, days.length]);

  const userSelectPlaceholder = loadingUsers
    ? "Loading..."
    : users.length === 0
      ? "No users"
      : "Select a user";

  const longestUserLabel = useMemo(() => {
    const labels = [userSelectPlaceholder, ...users.map((u) => u.name || "")];
    return labels.reduce((longest, label) => (label.length > longest.length ? label : longest), "");
  }, [users, userSelectPlaceholder]);

  const measureUserLabelRef = useRef(null);
  const [userSelectWidth, setUserSelectWidth] = useState(undefined);

  useLayoutEffect(() => {
    const el = measureUserLabelRef.current;
    if (!el) return;
    el.textContent = longestUserLabel;
    setUserSelectWidth(el.offsetWidth + 44);
  }, [longestUserLabel]);

  useEffect(() => {
    if (!selectedUserId) {
      setDayEntries(createDefaultDayEntries());
      return;
    }
    skipAutoSaveRef.current = true;
    if (persistTemplate) {
      setDayEntries(loadUserTemplate(selectedUserId) ?? createDefaultDayEntries());
    } else if (showDates && cycleKey) {
      setDayEntries(loadPayCycleSheet(selectedUserId, cycleKey) ?? createDefaultDayEntries());
    } else {
      setDayEntries(createDefaultDayEntries());
    }
  }, [selectedUserId, persistTemplate, showDates, cycleKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingProjects(true);
        const response = await fetch(`${API_URL}/api/projects`);
        if (!response.ok) throw new Error("Failed to fetch projects");
        const data = await response.json();
        if (!cancelled && Array.isArray(data)) {
          setConstructionProjects(filterConstructionProjects(data));
        }
      } catch (e) {
        console.error("TimeSheet projects fetch:", e);
        if (!cancelled) setConstructionProjects([]);
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    if (persistTemplate) {
      saveUserTemplate(selectedUserId, dayEntries);
    } else if (showDates && cycleKey) {
      savePayCycleSheet(selectedUserId, cycleKey, dayEntries);
    }
  }, [dayEntries, persistTemplate, showDates, cycleKey, selectedUserId]);

  function handleUseTemplate() {
    if (!hasUser) return;
    const template = getUserTemplateEntries(selectedUserId);
    if (!template) {
      alert("No template saved for this user.");
      return;
    }
    setDayEntries(template.map((entry) => ({ ...entry })));
  }

  function updateDayEntry(index, updater) {
    if (!hasUser) return;
    setDayEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, ...updater(entry) } : entry))
    );
  }

  const rowColumns = "58px 108px 108px 108px minmax(0, 1fr)";
  const uniformGapStyle = {
    gap: cellGap,
    padding: cellGap,
    boxSizing: "border-box",
  };

  const projectSelectStyle = {
    width: "100%",
    fontSize: "0.72rem",
    padding: "5px 6px",
    borderRadius: "4px",
    border: "none",
    color: MONUMENT,
    background: WHITE,
    boxSizing: "border-box",
    cursor: hasUser ? "pointer" : "not-allowed",
    opacity: hasUser ? 1 : 0.65,
  };

  const headerCell = {
    fontSize: "0.72rem",
    fontWeight: 600,
    color: UI.textMuted,
    textAlign: "center",
  };

  function renderDayRow(day, index) {
    const entry = dayEntries[index] ?? createDefaultDayEntries()[0];
    return (
      <div
        key={day.iso ?? day.key}
        data-day-row
        style={{
          display: "grid",
          gridTemplateColumns: rowColumns,
          columnGap: "12px",
          alignItems: "center",
          backgroundColor: MONUMENT,
          padding: "5px 10px",
          borderRadius: "4px",
          flex: "0 0 auto",
          boxSizing: "border-box",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: "0.82rem",
              color: WHITE,
              lineHeight: 1.2,
            }}
          >
            {shortWeekday(day.weekday)}
          </span>
          {showDates && day.dateLabel && (
            <span style={{ fontSize: "0.68rem", color: "#ffffff99", marginTop: "1px" }}>
              {shortDate(day.dateLabel)}
            </span>
          )}
        </div>

        <TimeStepper
          dark
          disabled={!hasUser}
          value={entry.workMinutes}
          formatValue={formatWorkHoursMinutes}
          onStepUp={() =>
            updateDayEntry(index, (e) => ({
              workMinutes: stepWorkMinutes(e.workMinutes, 1),
            }))
          }
          onStepDown={() =>
            updateDayEntry(index, (e) => ({
              workMinutes: stepWorkMinutes(e.workMinutes, -1),
            }))
          }
        />

        <TimeStepper
          dark
          disabled={!hasUser}
          value={entry.breakMinutes}
          formatValue={formatBreakMinutes}
          onStepUp={() =>
            updateDayEntry(index, (e) => ({
              breakMinutes: stepBreakMinutes(e.breakMinutes, 1),
            }))
          }
          onStepDown={() =>
            updateDayEntry(index, (e) => ({
              breakMinutes: stepBreakMinutes(e.breakMinutes, -1),
            }))
          }
        />

        <TimeStepper
          dark
          disabled={!hasUser}
          value={entry.overtimeMinutes}
          formatValue={formatOvertimeMinutes}
          onStepUp={() =>
            updateDayEntry(index, (e) => ({
              overtimeMinutes: stepOvertimeMinutes(e.overtimeMinutes, 1),
            }))
          }
          onStepDown={() =>
            updateDayEntry(index, (e) => ({
              overtimeMinutes: stepOvertimeMinutes(e.overtimeMinutes, -1),
            }))
          }
        />

        <select
          value={entry.projectId ?? DEFAULT_PROJECT_VALUE}
          disabled={!hasUser || loadingProjects}
          onChange={(e) =>
            updateDayEntry(index, () => ({
              projectId: e.target.value,
            }))
          }
          style={projectSelectStyle}
        >
          <option value={SELECT_PROJECT_VALUE}>{SELECT_PROJECT_LABEL}</option>
          <option value={OFFICE_PROJECT_VALUE}>{OFFICE_PROJECT_LABEL}</option>
          {constructionProjects.map((project) => (
            <option key={project.id} value={String(project.id)}>
              {formatConstructionProjectLabel(project)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function renderWeekBlock(title, weekDays, weekStartIndex, panelRef) {
    return (
      <div
        style={{
          background: WHITE,
          borderRadius: "12px",
          padding: "14px 18px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          flex: "1 1 0",
          minWidth: 0,
          minHeight: 0,
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        <h3
          style={{
            margin: "0 0 8px",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: MONUMENT,
          }}
        >
          {title}
        </h3>
        <div
          style={{
            paddingLeft: cellGap,
            paddingRight: cellGap,
            paddingBottom: "6px",
            boxSizing: "border-box",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: rowColumns,
              columnGap: "12px",
              width: "100%",
            }}
          >
            <div style={{ ...headerCell, textAlign: "left" }}>Day</div>
            <div style={headerCell}>Hours</div>
            <div style={headerCell}>Break</div>
            <div style={headerCell}>Overtime</div>
            <div style={headerCell}>Project</div>
          </div>
        </div>
        <div
          ref={panelRef}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: "1 1 0",
            minHeight: 0,
            backgroundColor: BLACK,
            borderRadius: "6px",
            ...uniformGapStyle,
          }}
        >
          {weekDays.map((day, i) => renderDayRow(day, weekStartIndex + i))}
        </div>
      </div>
    );
  }

  const week1Days = days.slice(0, 7);
  const week2Days = days.slice(7, 14);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        height: "100%",
        minHeight: 0,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          gap: "12px",
          alignItems: "flex-end",
          flexShrink: 0,
          alignSelf: "flex-start",
        }}
      >
        <span
          ref={measureUserLabelRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            visibility: "hidden",
            whiteSpace: "nowrap",
            fontSize: "0.95rem",
            fontWeight: 400,
            fontFamily: "inherit",
            pointerEvents: "none",
          }}
        />
        <div>
          <h2 style={{ fontSize: "1.05rem", marginTop: 0, marginBottom: "12px", fontWeight: 600 }}>User</h2>
          <select
            value={selectedUserId}
            onChange={onUserChange}
            disabled={loadingUsers}
            style={{
              width: userSelectWidth ? `${userSelectWidth}px` : "max-content",
              minWidth: "120px",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "none",
              fontSize: "0.95rem",
              color: MONUMENT,
              background: WHITE,
              boxSizing: "border-box",
              cursor: "pointer",
              display: "block",
            }}
          >
            <option value="">{userSelectPlaceholder}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
        {!isTemplate && (
          <button
            type="button"
            onClick={handleUseTemplate}
            disabled={!hasUser}
            style={{
              flexShrink: 0,
              width: "max-content",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "none",
              fontSize: "0.9rem",
              fontWeight: 600,
              color: WHITE,
              background: hasUser ? MONUMENT : "#32323355",
              cursor: hasUser ? "pointer" : "not-allowed",
              whiteSpace: "nowrap",
            }}
          >
            Use Template
          </button>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "24px",
          alignItems: "stretch",
          flex: "1 1 0",
          minHeight: 0,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {renderWeekBlock("Week 1", week1Days, 0, week1PanelRef)}
        {renderWeekBlock("Week 2", week2Days, 7, week2PanelRef)}
      </div>
    </div>
  );
}
