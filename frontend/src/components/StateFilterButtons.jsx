import { UI, STREAM, MENU } from "../utils/uiThemeTokens.js";
import { setStateFilter as saveStateFilter } from "../utils/stateFilter";

const WHITE = UI.cardBg;
const MONUMENT = UI.textPrimary;
const OUTLINE_BORDER = `2px solid ${UI.outline}`;

const btnBase = {
  borderRadius: "8px",
  padding: "10px 20px",
  fontSize: "1rem",
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 0.2s, border-color 0.2s, color 0.2s",
};

function stateFilterButtonStyle(selected, accent, accentLight) {
  return {
    background: selected ? accentLight : WHITE,
    color: MONUMENT,
    border: selected ? `2px solid ${accent}` : OUTLINE_BORDER,
  };
}

export default function StateFilterButtons({ stateFilter, setStateFilter, buttonWidth, buttonStyle = {} }) {
  const select = (filter) => {
    setStateFilter(filter);
    saveStateFilter(filter);
  };

  const sizeStyle = buttonWidth
    ? { width: buttonWidth, minWidth: buttonWidth, maxWidth: buttonWidth, boxSizing: "border-box" }
    : {};

  const baseStyle = buttonWidth || Object.keys(buttonStyle).length > 0 ? { ...buttonStyle } : btnBase;

  const hoverUnselected = (e, selected) => {
    if (!selected) {
      e.currentTarget.style.background = UI.inputBg;
    }
  };

  const hoverLeaveUnselected = (e, selected) => {
    if (!selected) {
      e.currentTarget.style.background = WHITE;
    }
  };

  return (
    <div style={{ display: "contents" }}>
      <button
        type="button"
        onClick={() => select("VIC")}
        style={{
          ...baseStyle,
          ...sizeStyle,
          ...stateFilterButtonStyle(stateFilter === "VIC", STREAM.vicBlue, STREAM.vicBlueLight),
        }}
        onMouseEnter={(e) => hoverUnselected(e, stateFilter === "VIC")}
        onMouseLeave={(e) => hoverLeaveUnselected(e, stateFilter === "VIC")}
      >
        VIC Only
      </button>
      <button
        type="button"
        onClick={() => select("QLD")}
        style={{
          ...baseStyle,
          ...sizeStyle,
          ...stateFilterButtonStyle(stateFilter === "QLD", STREAM.qldRed, STREAM.qldRedLight),
        }}
        onMouseEnter={(e) => hoverUnselected(e, stateFilter === "QLD")}
        onMouseLeave={(e) => hoverLeaveUnselected(e, stateFilter === "QLD")}
      >
        QLD Only
      </button>
      <button
        type="button"
        onClick={() => select("All")}
        style={{
          ...baseStyle,
          ...sizeStyle,
          ...stateFilterButtonStyle(stateFilter === "All", MENU.purple, MENU.purpleLight),
        }}
        onMouseEnter={(e) => hoverUnselected(e, stateFilter === "All")}
        onMouseLeave={(e) => hoverLeaveUnselected(e, stateFilter === "All")}
      >
        All Projects
      </button>
    </div>
  );
}
