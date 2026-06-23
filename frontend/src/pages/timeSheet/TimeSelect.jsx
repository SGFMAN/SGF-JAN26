import React from "react";
import { UI, TEXT, outlineBorder } from "../../utils/uiThemeTokens";
import { SELECT_DURATION_MINUTES } from "../../utils/timeSheetTime";

export default function TimeSelect({ value, onChange, options, disabled = false }) {
  return (
    <select
      value={Number.isFinite(Number(value)) ? String(value) : String(SELECT_DURATION_MINUTES)}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        width: "100%",
        fontSize: "0.95rem",
        fontWeight: 600,
        padding: "5px 6px",
        borderRadius: "4px",
        border: outlineBorder,
        color: TEXT.dark,
        background: UI.cardBg,
        boxSizing: "border-box",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.65 : 1,
      }}
    >
      {options.map((option) => (
        <option key={`${option.minutes}-${option.label}`} value={String(option.minutes)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
