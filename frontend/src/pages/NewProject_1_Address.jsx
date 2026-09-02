import React, { useState } from "react";
import ModalBackdrop from "../components/ModalBackdrop";
import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const ERROR_BORDER = "1px solid #cc3333";
const ERROR_TEXT = "#cc3333";

const STATE_OPTIONS = ["VIC", "QLD"];

/** Label row — when errored, show red message in the same space (no modal resize). */
function FieldLabel({ children, error }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: "0.9rem",
        color: error ? ERROR_TEXT : UI.textMuted,
        marginBottom: "6px",
        fontWeight: 500,
        lineHeight: 1.25,
        minHeight: "1.125rem",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {error || children}
    </label>
  );
}

/** Map paste fragments to VIC | QLD, or "" if unknown. */
function deriveStateFromText(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const upper = s.toUpperCase();
  const abbr = upper.match(/\b(VIC|QLD)\b/);
  if (abbr) return abbr[1];
  if (/\bVICTORIA\b/.test(upper)) return "VIC";
  if (/\bQUEENSLAND\b/.test(upper)) return "QLD";
  return "";
}

function isValidState(value) {
  return STATE_OPTIONS.includes(String(value || "").trim().toUpperCase());
}

function suburbContainsNumbers(suburb) {
  return /\d/.test(String(suburb || ""));
}

/**
 * @param {object} props
 * @param {string[]} [props.streamOptions] When provided (hotlist), show + require Stream.
 */
export default function NewProject({
  isOpen,
  onClose,
  formData,
  onFormDataChange,
  onNext,
  streamOptions = null,
}) {
  const [addressPaste, setAddressPaste] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const requireStream = Array.isArray(streamOptions);

  if (!isOpen) return null;

  function clearError(name) {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function handleChange(e) {
    const { name, value } = e.target;
    let processedValue = value;
    if (name === "street" || name === "suburb") {
      processedValue = value.replace(/[/\\]/g, "_");
    }
    clearError(name);
    onFormDataChange({
      ...formData,
      [name]: processedValue,
    });
  }

  function handleAddressPasteChange(e) {
    const value = e.target.value;
    setAddressPaste(value);

    let street = "";
    let suburb = "";
    let state = "";

    if (value.includes(",")) {
      const parts = value.split(",").map((part) => part.trim()).filter((part) => part);
      if (parts.length > 0) street = parts[0].replace(/[/\\]/g, "_");
      if (parts.length > 1) suburb = parts[1].replace(/[/\\]/g, "_");
      if (parts.length > 2) {
        for (let i = 2; i < parts.length; i++) {
          const derived = deriveStateFromText(parts[i]);
          if (derived) {
            state = derived;
            break;
          }
        }
      }
      if (!state) state = deriveStateFromText(value);
    } else {
      const parts = value.trim().split(/\s+/);
      if (parts.length >= 2) {
        let stateIndex = -1;
        for (let i = parts.length - 1; i >= 0; i--) {
          const derived = deriveStateFromText(parts[i]);
          if (derived) {
            stateIndex = i;
            state = derived;
            break;
          }
        }
        if (stateIndex > 0) {
          suburb = parts.slice(stateIndex - 1, stateIndex).join(" ").replace(/[/\\]/g, "_");
          street = parts.slice(0, stateIndex - 1).join(" ").replace(/[/\\]/g, "_");
        } else {
          suburb = parts.slice(-1)[0].replace(/[/\\]/g, "_");
          street = parts.slice(0, -1).join(" ").replace(/[/\\]/g, "_");
          state = deriveStateFromText(value);
        }
      } else {
        street = value.replace(/[/\\]/g, "_");
        state = deriveStateFromText(value);
      }
    }

    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.street;
      delete next.suburb;
      delete next.state;
      return next;
    });

    onFormDataChange({
      ...formData,
      street,
      suburb,
      state,
    });
  }

  function handleNext() {
    const state = String(formData.state || "").trim().toUpperCase();
    const street = String(formData.street || "").trim();
    const suburb = String(formData.suburb || "").trim();
    const stream = String(formData.stream || "").trim();

    // One field at a time — highlight only the first problem.
    if (!street) {
      setFieldErrors({ street: "Please enter street" });
      return;
    }
    if (!suburb) {
      setFieldErrors({ suburb: "Please enter suburb" });
      return;
    }
    if (suburbContainsNumbers(suburb)) {
      setFieldErrors({ suburb: "Please check suburb (contains numbers)" });
      return;
    }
    if (!isValidState(state)) {
      setFieldErrors({ state: "Please select state" });
      return;
    }
    if (requireStream && !stream) {
      setFieldErrors({ stream: "Please select stream" });
      return;
    }

    if (formData.state !== state || formData.street !== street || formData.suburb !== suburb) {
      onFormDataChange({
        ...formData,
        street,
        suburb,
        state,
        ...(requireStream ? { stream } : {}),
      });
    }
    setFieldErrors({});
    onNext();
  }

  const selectedState = isValidState(formData.state)
    ? String(formData.state).trim().toUpperCase()
    : "";

  const inputStyle = (hasError) => ({
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: hasError ? ERROR_BORDER : "none",
    fontSize: "1rem",
    color: MONUMENT,
    background: WHITE,
    boxSizing: "border-box",
  });

  return (
    <ModalBackdrop onClick={onClose}>
      <div
        style={{
          background: SECTION_GREY,
          borderRadius: "18px",
          padding: "32px",
          width: "90%",
          maxWidth: "500px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: "1.5rem",
            fontWeight: 600,
            marginTop: 0,
            marginBottom: "24px",
            color: MONUMENT,
          }}
        >
          Project Address
        </h2>
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.95rem",
              marginBottom: "10px",
              fontWeight: 500,
              color: "var(--sgf-text-primary)",
            }}
          >
            Paste address (optional)
          </label>
          <input
            type="text"
            name="addressPaste"
            placeholder="e.g. 12 Ocean Ave, Bondi, QLD 2026"
            value={addressPaste}
            onChange={handleAddressPasteChange}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px dashed #aaa",
              fontSize: "1rem",
              background: "#f6f6f7",
              color: MONUMENT,
              marginBottom: "2px",
              boxSizing: "border-box",
            }}
            autoComplete="off"
          />
          <small style={{ color: UI.textMuted }}>
            You can paste an address to fill below, or just type in the boxes.
          </small>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <FieldLabel error={fieldErrors.street}>Street</FieldLabel>
          <input
            type="text"
            name="street"
            value={formData.street}
            onChange={handleChange}
            style={inputStyle(!!fieldErrors.street)}
            autoComplete="off"
          />
        </div>
        <div style={{ marginBottom: "16px", display: "flex", gap: "12px" }}>
          <div style={{ flex: 3 }}>
            <FieldLabel error={fieldErrors.suburb}>Suburb</FieldLabel>
            <input
              type="text"
              name="suburb"
              value={formData.suburb}
              onChange={handleChange}
              style={inputStyle(!!fieldErrors.suburb)}
              autoComplete="off"
            />
          </div>
          <div style={{ flex: 1, minWidth: "110px" }}>
            <FieldLabel error={fieldErrors.state}>State</FieldLabel>
            <select
              name="state"
              value={selectedState}
              onChange={handleChange}
              style={{
                ...inputStyle(!!fieldErrors.state),
                color: selectedState ? MONUMENT : UI.textMuted,
                cursor: "pointer",
              }}
            >
              <option value="">Select…</option>
              {STATE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {requireStream ? (
          <div style={{ marginBottom: "16px" }}>
            <FieldLabel error={fieldErrors.stream}>Stream</FieldLabel>
            <select
              name="stream"
              value={formData.stream || ""}
              onChange={handleChange}
              style={{
                ...inputStyle(!!fieldErrors.stream),
                color: formData.stream ? MONUMENT : UI.textMuted,
                cursor: "pointer",
              }}
            >
              <option value="">Select stream…</option>
              {streamOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              {formData.stream && !streamOptions.includes(formData.stream) ? (
                <option value={formData.stream}>{formData.stream} (current)</option>
              ) : null}
            </select>
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: UI.inputBg,
              color: MONUMENT,
              border: "none",
              borderRadius: "10px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.17s",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleNext}
            style={{
              background: MONUMENT,
              color: PAGE_TEXT,
              border: "none",
              borderRadius: "10px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "background 0.17s",
            }}
          >
            Next
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
