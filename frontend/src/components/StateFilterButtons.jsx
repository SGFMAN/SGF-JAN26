import { useEffect, useState } from "react";
import { UI, STREAM, MENU, outlineBorder } from "../utils/uiThemeTokens.js";
import { setStateFilter as saveStateFilter } from "../utils/stateFilter";
import { buildSavedButtonStyle } from "../utils/uiButtonStyles.js";

const WHITE = UI.cardBg;
const MONUMENT = UI.textPrimary;
const OUTLINE_BORDER = outlineBorder;

const VIC_BUTTON_STYLE_ID = 1;
const QLD_BUTTON_STYLE_ID = 2;
const ALL_BUTTON_STYLE_ID = 3;

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
    border: selected ? `1px solid ${accent}` : OUTLINE_BORDER,
  };
}

export default function StateFilterButtons({ stateFilter, setStateFilter, buttonWidth, buttonStyle = {} }) {
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

  const select = (filter) => {
    setStateFilter(filter);
    saveStateFilter(filter);
  };

  const sizeStyle = buttonWidth
    ? { width: buttonWidth, minWidth: buttonWidth, maxWidth: buttonWidth, boxSizing: "border-box" }
    : {};

  const baseStyle = buttonWidth || Object.keys(buttonStyle).length > 0 ? { ...buttonStyle } : btnBase;

  const buildFilterButtonStyle = (styleId, selected, fallback) => {
    const savedStyle = buildSavedButtonStyle(styleId, selected);
    return {
      style: {
        ...baseStyle,
        ...(savedStyle ?? fallback),
        ...sizeStyle,
      },
      savedStyle,
    };
  };

  const vicSelected = stateFilter === "VIC";
  const qldSelected = stateFilter === "QLD";
  const allSelected = stateFilter === "All";

  const vicButton = buildFilterButtonStyle(
    VIC_BUTTON_STYLE_ID,
    vicSelected,
    stateFilterButtonStyle(vicSelected, STREAM.vicBlue, STREAM.vicBlueLight)
  );
  const qldButton = buildFilterButtonStyle(
    QLD_BUTTON_STYLE_ID,
    qldSelected,
    stateFilterButtonStyle(qldSelected, STREAM.qldRed, STREAM.qldRedLight)
  );
  const allButton = buildFilterButtonStyle(
    ALL_BUTTON_STYLE_ID,
    allSelected,
    stateFilterButtonStyle(allSelected, MENU.purple, MENU.purpleLight)
  );

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

  const hoverHandlers = (savedStyle, selected) =>
    savedStyle
      ? {}
      : {
          onMouseEnter: (e) => hoverUnselected(e, selected),
          onMouseLeave: (e) => hoverLeaveUnselected(e, selected),
        };

  return (
    <div style={{ display: "contents" }}>
      <button type="button" onClick={() => select("VIC")} style={vicButton.style} {...hoverHandlers(vicButton.savedStyle, vicSelected)}>
        VIC Only
      </button>
      <button type="button" onClick={() => select("QLD")} style={qldButton.style} {...hoverHandlers(qldButton.savedStyle, qldSelected)}>
        QLD Only
      </button>
      <button type="button" onClick={() => select("All")} style={allButton.style} {...hoverHandlers(allButton.savedStyle, allSelected)}>
        All States
      </button>
    </div>
  );
}
