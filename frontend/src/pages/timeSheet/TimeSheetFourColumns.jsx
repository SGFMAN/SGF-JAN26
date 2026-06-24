import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PAY_PERIOD_WEEKDAY_ORDER } from "../../utils/timeSheetPayCycle";
import {
  createDefaultDayEntries,
  loadUserTemplate,
  saveUserTemplate,
  loadPayCycleSheet,
  savePayCycleSheet,
  WORK_HOUR_OPTIONS,
  BREAK_DURATION_OPTIONS,
  OFFICE_PROJECT_VALUE,
  DEFAULT_PROJECT_VALUE,
  SELECT_PROJECT_VALUE,
  SELECT_PROJECT_LABEL,
} from "../../utils/timeSheetTime";
import {
  formatConstructionProjectLabel,
  OFFICE_PROJECT_LABEL,
  getCachedConstructionProjects,
  prefetchConstructionProjectsForTimeSheet,
} from "../../utils/timeSheetProjects";
import TimeSelect from "./TimeSelect";
import { buildSavedButtonStyle } from "../../utils/uiButtonStyles.js";
import { measureTextWidth } from "../../utils/measureTextWidth.js";

import { TIMESHEET_GAP, TIMESHEET_WEEKEND_GAP, DISPLAY_ROWS_PER_WEEK } from "../../utils/timesheetLayout";
import { UI, TEXT, MENU, outlineBorder } from "../../utils/uiThemeTokens.js";

const MAIN_AREA_BG = UI.panelBg;
const LAYOUT_GAP = TIMESHEET_GAP;
const ROW_GAP_MIN = LAYOUT_GAP;
const CONTENT_INSET_X = LAYOUT_GAP;
const WEEK1_BUTTON_STYLE_ID = 1;
const WEEK2_BUTTON_STYLE_ID = 2;

/** Equal gaps: padding (top/bottom/left/right) + between 6 visible rows + weekend spacer. */
function useUniformCellGap(panelRefs, deps, enabled = true) {
  const [cellGap, setCellGap] = useState(ROW_GAP_MIN);

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const measure = () => {
      const panels = panelRefs.current.filter(Boolean);
      if (!panels.length) return;

      let gap = ROW_GAP_MIN;
      for (const panel of panels) {
        const rows = panel.querySelectorAll("[data-day-row]");
        if (rows.length !== DISPLAY_ROWS_PER_WEEK) continue;

        let rowsHeight = 0;
        rows.forEach((row) => {
          rowsHeight += row.getBoundingClientRect().height;
        });

        const weekendGap = panel.querySelector("[data-weekend-gap]");
        const weekendGapHeight = weekendGap?.getBoundingClientRect().height ?? TIMESHEET_WEEKEND_GAP;

        const panelHeight = panel.getBoundingClientRect().height;
        const next = (panelHeight - rowsHeight - weekendGapHeight) / 7;
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
  }, [enabled, ...deps]);

  return cellGap;
}

function shortWeekday(weekday) {
  return weekday.slice(0, 3);
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ordinalSuffix(day) {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function formatDayDateLine(day, includeDate) {
  const weekday = shortWeekday(day.weekday);
  if (!includeDate || !day.date) return weekday;

  const date = day.date instanceof Date ? day.date : new Date(day.date);
  if (Number.isNaN(date.getTime())) return weekday;

  const dayNum = date.getDate();
  return `${weekday} - ${dayNum}${ordinalSuffix(dayNum)} ${SHORT_MONTHS[date.getMonth()]}`;
}

function startOfLocalDay(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getDayHighlight(day, showDates) {
  if (!showDates || !day.date) {
    return { rowStyle: {}, dayTextColor: TEXT.dark };
  }

  const dayMs = startOfLocalDay(day.date);
  const todayMs = startOfLocalDay(new Date());

  if (dayMs === todayMs) {
    return {
      rowStyle: { backgroundColor: MENU.purpleLight, borderRadius: "4px", border: outlineBorder },
      dayTextColor: TEXT.dark,
    };
  }

  if (dayMs < todayMs) {
    return {
      rowStyle: { backgroundColor: MENU.purple, borderRadius: "4px" },
      dayTextColor: MENU.activeText,
    };
  }

  return { rowStyle: {}, dayTextColor: TEXT.dark };
}

function isSunday(day) {
  return (day.weekday ?? day.expectedWeekday) === "Sunday";
}

function buildWeekDisplayItems(weekDays, weekStartIndex) {
  const items = [];
  let lastWeekday = null;

  for (let i = 0; i < weekDays.length; i++) {
    const day = weekDays[i];
    if (isSunday(day)) continue;

    if (day.weekday === "Monday" && lastWeekday === "Saturday") {
      items.push({ type: "weekendGap", key: `weekend-gap-${weekStartIndex + i}` });
    }

    items.push({
      type: "day",
      day,
      index: weekStartIndex + i,
      key: day.iso ?? day.key ?? `day-${weekStartIndex + i}`,
    });
    lastWeekday = day.weekday ?? day.expectedWeekday;
  }

  return items;
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
  hideUserSelect = false,
  autoSize = false,
  resetSignal = 0,
  exportDayEntriesRef = null,
}) {
  const [dayEntries, setDayEntries] = useState(createDefaultDayEntries);
  const [constructionProjects, setConstructionProjects] = useState(
    () => getCachedConstructionProjects() ?? []
  );
  const [loadingProjects, setLoadingProjects] = useState(
    () => getCachedConstructionProjects() == null
  );
  const week1PanelRef = useRef(null);
  const week2PanelRef = useRef(null);
  const weekPanelRefs = useRef([]);
  const skipAutoSaveRef = useRef(false);

  const [, setUiButtonStyleRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setUiButtonStyleRevision((n) => n + 1);
    window.addEventListener("sgf-ui-button-styles-change", refresh);
    window.addEventListener("sgf-ui-theme-change", refresh);
    return () => {
      window.removeEventListener("sgf-ui-button-styles-change", refresh);
      window.removeEventListener("sgf-ui-theme-change", refresh);
    };
  }, []);

  const hasUser = Boolean(selectedUserId);

  const days = showDates
    ? periodDays
    : PAY_PERIOD_WEEKDAY_ORDER.map((weekday, index) => ({ key: `template-${index}`, weekday }));

  weekPanelRefs.current = [week1PanelRef.current, week2PanelRef.current];
  const cellGap = useUniformCellGap(
    weekPanelRefs,
    [dayEntries, showDates, days.length],
    !autoSize
  );

  const userSelectPlaceholder = loadingUsers
    ? "Loading..."
    : users.length === 0
      ? "No users"
      : "Select a user";

  const longestUserLabel = useMemo(() => {
    const labels = [userSelectPlaceholder, ...users.map((u) => u.name || "")];
    return labels.reduce((longest, label) => (label.length > longest.length ? label : longest), "");
  }, [users, userSelectPlaceholder]);

  const userSelectWidth = useMemo(
    () => Math.ceil(measureTextWidth(longestUserLabel, { sizeRem: 0.95, weight: 400 }) + 44),
    [longestUserLabel]
  );

  const longestProjectLabel = useMemo(() => {
    const labels = [
      SELECT_PROJECT_LABEL,
      OFFICE_PROJECT_LABEL,
      ...constructionProjects.map((project) => formatConstructionProjectLabel(project)),
    ];
    return labels.reduce(
      (longest, label) => (label.length > longest.length ? label : longest),
      SELECT_PROJECT_LABEL
    );
  }, [constructionProjects]);

  const projectColumnWidth = useMemo(
    () => Math.ceil(measureTextWidth(longestProjectLabel, { sizeRem: 0.95, weight: 600 }) + 36),
    [longestProjectLabel]
  );

  const longestHourLabel = useMemo(() => {
    const labels = [...WORK_HOUR_OPTIONS, ...BREAK_DURATION_OPTIONS].map((option) => option.label);
    return labels.reduce(
      (longest, label) => (label.length > longest.length ? label : longest),
      labels[0] ?? ""
    );
  }, []);

  const timeColumnWidth = useMemo(
    () => Math.ceil(measureTextWidth(longestHourLabel, { sizeRem: 0.95, weight: 600 }) + 36),
    [longestHourLabel]
  );

  const longestDayLabel = useMemo(() => {
    if (!showDates) {
      return PAY_PERIOD_WEEKDAY_ORDER.reduce((longest, weekday) => {
        const label = shortWeekday(weekday);
        return label.length > longest.length ? label : longest;
      }, "");
    }
    return days.reduce((longest, day) => {
      const label = formatDayDateLine(day, true);
      return label.length > longest.length ? label : longest;
    }, "");
  }, [days, showDates]);

  const dayColumnWidth = useMemo(
    () => Math.ceil(measureTextWidth(longestDayLabel, { sizeRem: 0.82, weight: 600 }) + 8),
    [longestDayLabel]
  );

  const rowColumns = `${dayColumnWidth}px ${timeColumnWidth}px ${timeColumnWidth}px ${timeColumnWidth}px ${projectColumnWidth}px`;

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
    if (!resetSignal) return;
    skipAutoSaveRef.current = true;
    setDayEntries(createDefaultDayEntries());
  }, [resetSignal]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!getCachedConstructionProjects()) setLoadingProjects(true);
        const projects = await prefetchConstructionProjectsForTimeSheet();
        if (!cancelled) setConstructionProjects(projects);
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

  useEffect(() => {
    if (exportDayEntriesRef) {
      exportDayEntriesRef.current = dayEntries;
    }
  }, [dayEntries, exportDayEntriesRef]);

  function updateDayEntry(index, updater) {
    if (!hasUser) return;
    setDayEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, ...updater(entry) } : entry))
    );
  }

  const projectSelectStyle = {
    width: "100%",
    fontSize: "0.95rem",
    fontWeight: 600,
    padding: "5px 6px",
    borderRadius: "4px",
    border: outlineBorder,
    color: TEXT.dark,
    background: UI.cardBg,
    boxSizing: "border-box",
    cursor: hasUser ? "pointer" : "not-allowed",
    opacity: hasUser ? 1 : 0.65,
  };

  const headerCell = {
    fontSize: "0.72rem",
    fontWeight: 600,
    color: TEXT.dark,
    textAlign: "center",
  };

  const uniformGapStyle = {
    gap: autoSize ? ROW_GAP_MIN : cellGap,
    paddingLeft: autoSize ? CONTENT_INSET_X : cellGap,
    paddingRight: autoSize ? CONTENT_INSET_X : cellGap,
    paddingBottom: autoSize ? CONTENT_INSET_X : cellGap,
    paddingTop: autoSize ? CONTENT_INSET_X : cellGap,
    boxSizing: "border-box",
    overflow: "visible",
  };

  function weekHeadingStyle(buttonStyleId) {
    const saved = buildSavedButtonStyle(buttonStyleId, true);
    return {
      ...(saved ?? {
        color: TEXT.dark,
        background: UI.cardBg,
        border: outlineBorder,
      }),
      margin: "0 auto",
      maxWidth: "100%",
      fontSize: "0.82rem",
      fontWeight: 600,
      textAlign: "center",
      padding: saved?.padding ?? "3px 8px",
      lineHeight: 1.15,
      borderRadius: "8px",
      boxSizing: "border-box",
      cursor: "default",
      userSelect: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    };
  }

  function renderDayRow(day, index) {
    const entry = dayEntries[index] ?? createDefaultDayEntries()[0];
    const { rowStyle, dayTextColor } = getDayHighlight(day, showDates);
    return (
      <div
        key={day.iso ?? day.key}
        data-day-row
        style={{
          display: "grid",
          gridTemplateColumns: rowColumns,
          columnGap: "12px",
          alignItems: "center",
          padding: "4px 6px",
          flex: "0 0 auto",
          boxSizing: "border-box",
          width: "max-content",
          minWidth: "100%",
          overflow: "visible",
          ...rowStyle,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: "0.82rem",
              color: dayTextColor,
              lineHeight: 1.2,
            }}
          >
            {formatDayDateLine(day, showDates)}
          </span>
        </div>

        <TimeSelect
          disabled={!hasUser}
          value={entry.workMinutes}
          options={WORK_HOUR_OPTIONS}
          onChange={(minutes) =>
            updateDayEntry(index, () => ({
              workMinutes: minutes,
            }))
          }
        />

        <TimeSelect
          disabled={!hasUser}
          value={entry.breakMinutes}
          options={BREAK_DURATION_OPTIONS}
          onChange={(minutes) =>
            updateDayEntry(index, () => ({
              breakMinutes: minutes,
            }))
          }
        />

        <TimeSelect
          disabled={!hasUser}
          value={entry.overtimeMinutes}
          options={WORK_HOUR_OPTIONS}
          onChange={(minutes) =>
            updateDayEntry(index, () => ({
              overtimeMinutes: minutes,
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

  function renderColumnHeaderRow() {
    return (
      <div style={{ paddingBottom: "4px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: rowColumns,
            columnGap: "12px",
            width: "max-content",
            maxWidth: "100%",
          }}
        >
          <div style={{ ...headerCell, textAlign: "left" }}>Day</div>
          <div style={headerCell}>Hours</div>
          <div style={headerCell}>Break</div>
          <div style={headerCell}>Overtime</div>
          <div style={headerCell}>Project</div>
        </div>
      </div>
    );
  }

  const weekPanelStyle = {
    background: MAIN_AREA_BG,
    borderRadius: "12px",
    padding: LAYOUT_GAP,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    border: outlineBorder,
    boxSizing: "border-box",
    overflow: "visible",
  };

  function renderWeekSection(title, buttonStyleId, weekDays, weekStartIndex, panelRef) {
    return (
      <div
        ref={panelRef}
        style={{
          ...weekPanelStyle,
          display: "flex",
          flexDirection: "column",
          gap: autoSize ? ROW_GAP_MIN : cellGap,
          ...(autoSize
            ? { flex: "0 0 auto", width: "100%" }
            : { flex: "1 1 0", minHeight: 0, ...uniformGapStyle }),
        }}
      >
        <div style={weekHeadingStyle(buttonStyleId)} aria-hidden="true">
          {title}
        </div>
        {renderColumnHeaderRow()}
        <div style={{ width: "max-content", minWidth: "100%" }}>
          {buildWeekDisplayItems(weekDays, weekStartIndex).map((item) => {
            if (item.type === "weekendGap") {
              return (
                <div
                  key={item.key}
                  data-weekend-gap
                  aria-hidden="true"
                  style={{ height: TIMESHEET_WEEKEND_GAP, flexShrink: 0 }}
                />
              );
            }
            return renderDayRow(item.day, item.index);
          })}
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
        ...(autoSize ? {} : { height: "100%", minHeight: 0 }),
        width: autoSize ? "max-content" : "100%",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {!hideUserSelect && (
        <div
          style={{
            display: "inline-flex",
            gap: "12px",
            alignItems: "flex-end",
            flexShrink: 0,
            alignSelf: "flex-start",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.05rem", marginTop: 0, marginBottom: "12px", fontWeight: 600, color: TEXT.dark }}>User</h2>
            <select
              value={selectedUserId}
              onChange={onUserChange}
              disabled={loadingUsers}
              style={{
                width: `${userSelectWidth}px`,
                minWidth: "120px",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.95rem",
                color: TEXT.dark,
                background: UI.cardBg,
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
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: LAYOUT_GAP,
          ...(autoSize
            ? { flex: "0 0 auto", width: "100%" }
            : { flex: "1 1 0", minWidth: 0, minHeight: 0, width: "100%", height: "100%" }),
          boxSizing: "border-box",
        }}
      >
        {renderWeekSection("Week 1", WEEK1_BUTTON_STYLE_ID, week1Days, 0, week1PanelRef)}
        {renderWeekSection("Week 2", WEEK2_BUTTON_STYLE_ID, week2Days, 7, week2PanelRef)}
      </div>
    </div>
  );
}
