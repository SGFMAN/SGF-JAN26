import React, { useEffect, useState } from "react";
import StateFilterButtons from "./StateFilterButtons";
import {
  FIELD_DEFINITIONS,
  FILTER_BY_FIELD_LABELS,
  PROJECT_LIST_ACTION_BUTTON_LABELS,
  filterSelectWidth,
} from "../utils/projectListFilters";
import { UI, MENU, INDICATOR, outlineBorder } from "../utils/uiThemeTokens.js";
import { buildSavedButtonStyle } from "../utils/uiButtonStyles.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const SORT_BUTTON_STYLE_ID = 4;

export default function ProjectListToolbar({
  searchQuery,
  setSearchQuery,
  selectedField,
  setSelectedField,
  selectedValue,
  setSelectedValue,
  stateFilter,
  setStateFilter,
  sortMode,
  setSortMode,
  availableValues = [],
  onClearFilters,
}) {
  const [, setStyleRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setStyleRevision((n) => n + 1);
    window.addEventListener("sgf-ui-button-styles-change", refresh);
    window.addEventListener("sgf-ui-theme-change", refresh);
    return () => {
      window.removeEventListener("sgf-ui-button-styles-change", refresh);
      window.removeEventListener("sgf-ui-theme-change", refresh);
    };
  }, []);

  const filterByFieldWidth = filterSelectWidth(FILTER_BY_FIELD_LABELS);
  const filterByValueWidth = filterSelectWidth("All values", availableValues);
  const actionButtonWidth = filterSelectWidth(PROJECT_LIST_ACTION_BUTTON_LABELS);

  const filterLabelStyle = {
    display: "block",
    fontSize: "0.9rem",
    color: UI.textMuted,
    marginBottom: "6px",
    marginTop: 0,
    fontWeight: 500,
    lineHeight: 1.35,
    minHeight: "1.215rem",
  };

  const filterControlStyle = {
    height: "48px",
    padding: "0 16px",
    borderRadius: "8px",
    border: outlineBorder,
    fontSize: "1rem",
    boxSizing: "border-box",
    outline: "none",
  };

  const toolbarButtonStyle = {
    ...filterControlStyle,
    width: actionButtonWidth,
    minWidth: actionButtonWidth,
    maxWidth: actionButtonWidth,
    fontSize: "0.9rem",
    fontWeight: 500,
    whiteSpace: "nowrap",
    textAlign: "center",
    cursor: "pointer",
  };

  const sortButtonStyle = (mode) => {
    const selected = sortMode === mode;
    const savedStyle = buildSavedButtonStyle(SORT_BUTTON_STYLE_ID, selected);
    const fallback = {
      background: selected ? INDICATOR.orangeLight : WHITE,
      color: MONUMENT,
      border: selected ? `1px solid ${INDICATOR.orangeDark}` : outlineBorder,
    };
    return {
      style: {
        ...toolbarButtonStyle,
        ...(savedStyle ?? fallback),
        transition: "background 0.2s, border-color 0.2s, color 0.2s",
      },
      savedStyle,
      selected,
    };
  };

  const sortButtonHoverHandlers = ({ savedStyle, selected }) =>
    savedStyle
      ? {}
      : {
          onMouseEnter: (e) => {
            if (!selected) e.currentTarget.style.background = UI.inputBg;
          },
          onMouseLeave: (e) => {
            if (!selected) e.currentTarget.style.background = WHITE;
          },
        };

  return (
    <div
      className="project-list-toolbar"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: "16px",
        marginBottom: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "8px",
          flex: "1 1 auto",
          flexWrap: "nowrap",
          alignItems: "stretch",
          marginTop: 0,
          position: "relative",
          minWidth: 0,
        }}
      >
        <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column" }}>
          <label style={filterLabelStyle}>Search</label>
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              ...filterControlStyle,
              width: "360px",
              color: MONUMENT,
              background: WHITE,
            }}
          />
        </div>

        <div style={{ flex: "0 0 auto", marginLeft: "10px", display: "flex", flexDirection: "column" }}>
          <label style={filterLabelStyle}>Filter by Field</label>
          <select
            value={selectedField}
            onChange={(e) => setSelectedField(e.target.value)}
            style={{
              ...filterControlStyle,
              width: filterByFieldWidth,
              minWidth: filterByFieldWidth,
              maxWidth: filterByFieldWidth,
              color: MONUMENT,
              background: WHITE,
              cursor: "pointer",
            }}
          >
            <option value="">All fields</option>
            {Object.entries(FIELD_DEFINITIONS).map(([key, def]) => (
              <option key={key} value={key}>
                {def.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: "0 0 auto", marginLeft: "10px", display: "flex", flexDirection: "column" }}>
          <label style={filterLabelStyle}>Filter by Value</label>
          <select
            value={selectedValue}
            onChange={(e) => setSelectedValue(e.target.value)}
            disabled={!selectedField}
            style={{
              ...filterControlStyle,
              width: filterByValueWidth,
              minWidth: filterByValueWidth,
              maxWidth: filterByValueWidth,
              color: selectedField ? MONUMENT : "#999",
              background: selectedField ? WHITE : UI.inputBg,
              cursor: selectedField ? "pointer" : "not-allowed",
            }}
          >
            <option value="">All values</option>
            {selectedField &&
              availableValues.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
          </select>
        </div>

        {(selectedField || searchQuery.trim()) && (
          <div style={{ flex: "0 0 auto", marginLeft: "10px", display: "flex", flexDirection: "column" }}>
            <label style={{ ...filterLabelStyle, visibility: "hidden" }} aria-hidden="true">
              Clear
            </label>
            <button
              type="button"
              onClick={onClearFilters}
              style={{
                ...filterControlStyle,
                background: MENU.purpleLight,
                color: PAGE_TEXT,
                border: outlineBorder,
                cursor: "pointer",
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "0 0 auto", flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "row", gap: "10px" }}>
          <StateFilterButtons
            stateFilter={stateFilter}
            setStateFilter={setStateFilter}
            buttonWidth={actionButtonWidth}
            buttonStyle={toolbarButtonStyle}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "row", gap: "10px" }}>
          {[
            { mode: "suburb", label: "Sort by Suburb" },
            { mode: "class", label: "Sort By Class" },
            { mode: "stream", label: "Sort By Stream" },
          ].map(({ mode, label }) => {
            const button = sortButtonStyle(mode);
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                style={button.style}
                {...sortButtonHoverHandlers(button)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
