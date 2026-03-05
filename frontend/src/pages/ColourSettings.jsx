import React from "react";
import { COLORBOND_COLOURS } from "../constants/colorbondColours";

const MONUMENT = "#323233";
const WHITE = "#fff";
const SECTION_GREY = "#a1a1a3";

export default function ColourSettings() {
  const getColourHex = (r, g, b) => {
    return `#${[r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('')}`;
  };

  return (
    <div style={{ width: "100%", height: "100%", padding: "24px 32px", display: "flex", flexDirection: "column", gap: "24px", overflow: "auto" }}>
      <h2 style={{ fontSize: "1.5rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
        Colour Settings
      </h2>

      {/* 5 Column Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "24px", flex: 1, minHeight: 0 }}>
        {/* Column 1: Colorbond Colours */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", paddingRight: "8px" }}>
          <h3 style={{ fontSize: "1.1rem", margin: 0, color: MONUMENT, fontWeight: 600 }}>
            Colorbond Colours
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {COLORBOND_COLOURS.map((colour, index) => {
              const hex = getColourHex(colour.r, colour.g, colour.b);
              return (
                <div
                  key={index}
                  style={{
                    background: "transparent",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    padding: "12px 8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "4px",
                      backgroundColor: hex,
                      border: "1px solid #ccc",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.9rem", fontWeight: 500, color: MONUMENT }}>
                      {colour.name}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#666" }}>
                      R: {colour.r} G: {colour.g} B: {colour.b}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 2: Empty for now */}
        <div style={{ display: "flex", flexDirection: "column" }}>
        </div>

        {/* Column 3: Empty for now */}
        <div style={{ display: "flex", flexDirection: "column" }}>
        </div>

        {/* Column 4: Empty for now */}
        <div style={{ display: "flex", flexDirection: "column" }}>
        </div>

        {/* Column 5: Empty for now */}
        <div style={{ display: "flex", flexDirection: "column" }}>
        </div>
      </div>
    </div>
  );
}
