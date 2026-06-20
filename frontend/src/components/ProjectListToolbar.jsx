import React from "react";
import StateFilterButtons from "./StateFilterButtons";
import {
  FIELD_DEFINITIONS,
  FILTER_BY_FIELD_LABELS,
  PROJECT_LIST_ACTION_BUTTON_LABELS,
  filterSelectWidth,
} from "../utils/projectListFilters";
import { UI, MENU, INDICATOR } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;

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
    border: `2px solid ${UI.outline}`,
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
    return {
      ...toolbarButtonStyle,
      background: selected ? INDICATOR.orangeLight : WHITE,
      color: MONUMENT,
      border: selected ? `2px solid ${INDICATOR.orangeDark}` : `2px solid ${UI.outline}`,
      transition: "background 0.2s, border-color 0.2s, color 0.2s",
    };
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
                border: `2px solid ${UI.outline}`,
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
          <button type="button" onClick={() => setSortMode("suburb")} style={sortButtonStyle("suburb")}>
            Sort by Suburb
          </button>
          <button type="button" onClick={() => setSortMode("class")} style={sortButtonStyle("class")}>
            Sort By Class
          </button>
          <button type="button" onClick={() => setSortMode("stream")} style={sortButtonStyle("stream")}>
            Sort By Stream
          </button>
        </div>
      </div>
    </div>
  );
}
