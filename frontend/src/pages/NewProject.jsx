import React, { useState } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";

const STREAM_OPTIONS = [
  "SGF - VIC",
  "SGF - QLD",
  "Dual Dwelling",
  "ATA",
  "Pumped on Property",
  "Henderson",
  "Creat Cash Flow",
  "Maple Group",
];

export default function NewProject({ isOpen, onClose, onCreate }) {
  const [formData, setFormData] = useState({
    suburb: "",
    street: "",
    state: "",
    stream: "",
    deposit: "",
    customDeposit: "",
    clientName: "",
    email: "",
    phone: "",
  });
  const [addressPaste, setAddressPaste] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  function handleChange(e) {
    const { name, value } = e.target;
    if (name === "deposit") {
      setFormData({
        ...formData,
        deposit: value,
        // Clear customDeposit if not "Other"
        customDeposit: value === "Other" ? formData.customDeposit : "",
      });
    } else if (name === "customDeposit") {
      setFormData({
        ...formData,
        customDeposit: value,
        deposit: "Other", // Ensure deposit is set to "Other" when entering custom amount
      });
    } else {
      setFormData({
        ...formData,
        [name]: value,
      });
    }
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

    setFormData((prev) => ({
      ...prev,
      street,
      suburb,
      state,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onCreate(formData);
      // Reset form
      setFormData({
        suburb: "",
        street: "",
        state: "",
        stream: "",
        deposit: "",
        customDeposit: "",
        clientName: "",
        email: "",
        phone: "",
      });
      setAddressPaste("");
      onClose();
    } catch (error) {
      console.error("Error creating project:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    setFormData({
      suburb: "",
      street: "",
      state: "",
      stream: "",
      deposit: "",
      customDeposit: "",
      clientName: "",
      email: "",
      phone: "",
    });
    setAddressPaste("");
    onClose();
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
      }}
      onClick={onClose}
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
          New Project
        </h2>
        <form onSubmit={handleSubmit}>
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
          <div style={{ marginBottom: "16px", display: "flex", gap: "12px" }}>
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
                Deposit Amount
              </label>
              <select
                name="deposit"
                value={formData.deposit}
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
                  cursor: "pointer",
                }}
              >
                <option value="">Select Deposit</option>
                <option value="Full 5%">Full 5%</option>
                <option value="$5k only">$5k only</option>
                <option value="Other">Other</option>
              </select>
            </div>
            {formData.deposit === "Other" && (
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
                  Custom Amount
                </label>
                <input
                  type="text"
                  name="customDeposit"
                  value={formData.customDeposit}
                  onChange={handleChange}
                  placeholder="Enter custom amount"
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
            )}
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
              Client Name
            </label>
            <input
              type="text"
              name="clientName"
              value={formData.clientName}
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
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
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
          {/* Stream and Phone side by side with even BIGGER vertical gap before the buttons */}
          <div style={{ marginBottom: "96px", display: "flex", gap: "20px" }}>
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
                Stream
              </label>
              <select
                name="stream"
                value={formData.stream}
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
                  cursor: "pointer",
                }}
              >
                <option value="">Select Stream</option>
                {STREAM_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
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
                Phone
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
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
          <div
            style={{
              display: "flex",
              gap: "24px",
              justifyContent: "flex-end",
              marginBottom: 0, // ensure no extra space after buttons
            }}
          >
            <button
              type="button"
              onClick={handleCancel}
              style={{
                background: WHITE,
                color: MONUMENT,
                border: "none",
                borderRadius: "10px",
                padding: "12px 36px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.17s",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                background: MONUMENT,
                color: WHITE,
                border: "none",
                borderRadius: "10px",
                padding: "12px 36px",
                fontSize: "1rem",
                fontWeight: 500,
                cursor: isSubmitting ? "not-allowed" : "pointer",
                opacity: isSubmitting ? 0.6 : 1,
                transition: "background 0.17s",
              }}
            >
              {isSubmitting ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
