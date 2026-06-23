import React from "react";
import { TIMESHEET_GAP } from "../utils/timesheetLayout";
import { UI, TEXT, MENU, outlineBorder } from "../utils/uiThemeTokens";

const menuItemStyle = {
  background: "transparent",
  color: TEXT.dark,
  border: "none",
  borderRadius: "10px",
  padding: "8px 8px",
  fontSize: "0.95rem",
  fontWeight: 500,
  textAlign: "center",
  cursor: "pointer",
  width: "100%",
  lineHeight: 1.4,
  letterSpacing: "0.5px",
  transition: "background 0.18s, color 0.15s",
};

function hoverOn(e) {
  e.currentTarget.style.background = MENU.greenActive;
  e.currentTarget.style.color = MENU.activeText;
}

function hoverOff(e) {
  e.currentTarget.style.background = "transparent";
  e.currentTarget.style.color = TEXT.dark;
}

function MenuButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={menuItemStyle}
      onMouseEnter={hoverOn}
      onMouseLeave={hoverOff}
    >
      {children}
    </button>
  );
}

function MenuGroup({ children }) {
  return (
    <div
      style={{
        background: MENU.green,
        borderRadius: "10px",
        padding: "4px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        border: outlineBorder,
      }}
    >
      {children}
    </div>
  );
}

export default function TimeSheetSideMenu({ onSend, onReset }) {
  return (
    <aside
      className="sidebar-menu"
      style={{
        background: UI.panelBg,
        borderRadius: "16px",
        width: "160px",
        minWidth: "160px",
        alignSelf: "stretch",
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.13)",
        padding: TIMESHEET_GAP,
        boxSizing: "border-box",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: TIMESHEET_GAP,
        border: outlineBorder,
      }}
    >
      <MenuGroup>
        <MenuButton onClick={onSend}>Send</MenuButton>
      </MenuGroup>
      <MenuGroup>
        <MenuButton onClick={onReset}>Reset</MenuButton>
      </MenuGroup>
    </aside>
  );
}
