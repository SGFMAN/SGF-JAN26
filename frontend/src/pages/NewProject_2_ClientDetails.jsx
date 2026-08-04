import React, { useState } from "react";

import { UI } from "../utils/uiThemeTokens.js";
const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const WHITE = UI.cardBg;
const PAGE_TEXT = UI.pageText;
const ERROR_BORDER = "1px solid #cc3333";

function looksLikeEmail(value) {
  const s = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function NewProject2({
  isOpen,
  onClose,
  formData,
  onFormDataChange,
  onBack,
  onNext,
  nextLabel = "Next",
}) {
  const [fieldErrors, setFieldErrors] = useState({});

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
    clearError(name);
    onFormDataChange({
      ...formData,
      [name]: value,
    });
  }

  function handleNext() {
    const clientName = String(formData.clientName || "").trim();
    const email = String(formData.email || "").trim();

    // One field at a time — highlight only the first problem.
    if (!clientName) {
      setFieldErrors({ clientName: true });
      return;
    }
    if (!email || !looksLikeEmail(email)) {
      setFieldErrors({ email: true });
      return;
    }

    setFieldErrors({});
    if (formData.clientName !== clientName || formData.email !== email) {
      onFormDataChange({ ...formData, clientName, email });
    }
    onNext();
  }

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
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        pointerEvents: "auto",
      }}
    >
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
          Client Details
        </h2>
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.9rem",
              color: UI.textMuted,
              marginBottom: "6px",
              fontWeight: 500,
            }}
          >
            Client Name
          </label>
          <input
            type="text"
            name="clientName"
            value={formData.clientName}
            onChange={handleChange}
            style={inputStyle(!!fieldErrors.clientName)}
            autoComplete="off"
          />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.9rem",
              color: UI.textMuted,
              marginBottom: "6px",
              fontWeight: 500,
            }}
          >
            Email
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            style={inputStyle(!!fieldErrors.email)}
            autoComplete="off"
          />
        </div>
        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.9rem",
              color: UI.textMuted,
              marginBottom: "6px",
              fontWeight: 500,
            }}
          >
            Phone
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            style={inputStyle(false)}
            autoComplete="off"
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button
            type="button"
            onClick={onBack}
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
            Back
          </button>
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
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
