import { useEffect, useState } from "react";
import { UI, STREAM, MENU, INDICATOR, outlineBorder } from "../utils/uiThemeTokens.js";
import { buildSavedButtonStyle } from "../utils/uiButtonStyles.js";

const WHITE = UI.cardBg;
const MONUMENT = UI.textPrimary;
const OUTLINE_BORDER = outlineBorder;

function chipFallback(selected, accent, accentLight) {
  return {
    background: selected ? accentLight : WHITE,
    color: MONUMENT,
    border: selected ? `1px solid ${accent}` : OUTLINE_BORDER,
  };
}

export function useUiButtonStyleRevision() {
  const [, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1);
    window.addEventListener("sgf-ui-button-styles-change", refresh);
    window.addEventListener("sgf-ui-theme-change", refresh);
    return () => {
      window.removeEventListener("sgf-ui-button-styles-change", refresh);
      window.removeEventListener("sgf-ui-theme-change", refresh);
    };
  }, []);
}

export default function MobileStyledFilterButton({
  styleId,
  selected,
  onClick,
  children,
  stateKey,
  className = "mobile-styled-filter-btn",
}) {
  const savedStyle = styleId != null ? buildSavedButtonStyle(styleId, selected) : null;
  const fallback = stateKey
    ? mobileStateFallback(selected, stateKey)
    : chipFallback(selected, INDICATOR.orangeDark, INDICATOR.orangeLight);

  const hoverHandlers =
    savedStyle || !selected
      ? {}
      : {
          onMouseEnter: (e) => {
            e.currentTarget.style.background = UI.inputBg;
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.background = WHITE;
          },
        };

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      style={{
        ...(savedStyle ?? fallback),
        width: "100%",
        minWidth: 0,
        maxWidth: "none",
        boxSizing: "border-box",
        transition: "background 0.2s, border-color 0.2s, color 0.2s",
      }}
      {...hoverHandlers}
    >
      {children}
    </button>
  );
}

export const MOBILE_STATE_BUTTON_IDS = {
  VIC: 1,
  QLD: 2,
  All: 3,
};

export const MOBILE_STATUS_BUTTON_STYLE_ID = 4;

export function mobileStateFallback(selected, stateKey) {
  if (stateKey === "VIC") {
    return chipFallback(selected, STREAM.vicBlue, STREAM.vicBlueLight);
  }
  if (stateKey === "QLD") {
    return chipFallback(selected, STREAM.qldRed, STREAM.qldRedLight);
  }
  return chipFallback(selected, MENU.purple, MENU.purpleLight);
}
