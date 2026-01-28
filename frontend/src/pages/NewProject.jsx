import React, { useState } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";

export default function NewProject({ isOpen, onClose, formData, onFormDataChange, onNext }) {
  const [addressPaste, setAddressPaste] = useState("");

  if (!isOpen) return null;

  function handleChange(e) {
    const { name, value } = e.target;
    onFormDataChange({
      ...formData,
      [name]: value,
    });
  }

  // Address parser: expects format like "30 Macedon St, Hoppers Crossing, VIC 3029, Australia"
  // Extracts: street, suburb, and state (ignores postcode and country)
  function handleAddressPasteChange(e) {
    const value = e.target.value;
    setAddressPaste(value);

    let street = "";
    let suburb = "";
    let state = "";

    if (value.includes(",")) {
      // Split by comma and trim each part
      const parts = value.split(",").map(part => part.trim()).filter(part => part);
      
      // First part = street
      if (parts.length > 0) {
        street = parts[0];
      }
      
      // Second part = suburb
      if (parts.length > 1) {
        suburb = parts[1];
      }
      
      // Third part (if exists) = state (may include postcode like "VIC 3029")
      if (parts.length > 2) {
        const thirdPart = parts[2];
        // Extract state abbreviation (2-4 uppercase letters, e.g. "VIC", "NSW", "QLD")
        const stateMatch = thirdPart.match(/^([A-Z]{2,4})/);
        if (stateMatch) {
          state = stateMatch[1];
        } else {
          // Fallback: if it looks like a state abbreviation (all uppercase, short)
          if (/^[A-Z]{2,4}$/.test(thirdPart)) {
            state = thirdPart;
          }
        }
      }
    } else {
      // If no commas, try to parse from space-separated format
      const parts = value.trim().split(/\s+/);
      if (parts.length >= 2) {
        // Last 1-2 words might be suburb/state
        // Try to find state abbreviation (2-4 uppercase letters)
        let stateIndex = -1;
        for (let i = parts.length - 1; i >= 0; i--) {
          if (/^[A-Z]{2,4}$/.test(parts[i])) {
            stateIndex = i;
            state = parts[i];
            break;
          }
        }
        
        if (stateIndex > 0) {
          // Suburb is before state
          suburb = parts.slice(stateIndex - 1, stateIndex).join(" ");
          street = parts.slice(0, stateIndex - 1).join(" ");
        } else {
          // No state found, treat last word as suburb
          suburb = parts.slice(-1)[0];
          street = parts.slice(0, -1).join(" ");
        }
      } else {
        // Fallback: just use as street
        street = value;
      }
    }

    onFormDataChange({
      ...formData,
      street,
      suburb,
      state,
    });
  }

  function handleNext() {
    onNext();
  }

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
          Project Address
        </h2>
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.95rem",
              marginBottom: "10px",
              fontWeight: 500,
              color: "#323233dd",
            }}
          >
            Paste address (optional)
          </label>
          <input
            type="text"
            name="addressPaste"
            placeholder="e.g. 12 Ocean Ave, Bondi"
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
          <small style={{ color: "#32323399" }}>
            You can paste an address to fill below, or just type in the boxes.
          </small>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "0.9rem",
              color: "#32323399",
              marginBottom: "6px",
              fontWeight: 500,
            }}
          >
            Street
          </label>
          <input
            type="text"
            name="street"
            value={formData.street}
            onChange={handleChange}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: "none",
              fontSize: "1rem",
              color: MONUMENT,
              background: WHITE,
              boxSizing: "border-box",
            }}
            autoComplete="off"
          />
        </div>
        <div style={{ marginBottom: "16px", display: "flex", gap: "12px" }}>
          <div style={{ flex: 3 }}>
            <label
              style={{
                display: "block",
                fontSize: "0.9rem",
                color: "#32323399",
                marginBottom: "6px",
                fontWeight: 500,
              }}
            >
              Suburb
            </label>
            <input
              type="text"
              name="suburb"
              value={formData.suburb}
              onChange={handleChange}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
              }}
              autoComplete="off"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label
              style={{
                display: "block",
                fontSize: "0.9rem",
                color: "#32323399",
                marginBottom: "6px",
                fontWeight: 500,
              }}
            >
              State
            </label>
            <input
              type="text"
              name="state"
              value={formData.state}
              onChange={handleChange}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "1rem",
                color: MONUMENT,
                background: WHITE,
                boxSizing: "border-box",
              }}
              autoComplete="off"
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "#e0e0e0",
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
              color: WHITE,
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
    </div>
  );
}
