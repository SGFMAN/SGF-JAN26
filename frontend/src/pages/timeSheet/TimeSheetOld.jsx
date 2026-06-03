import React from "react";

const MONUMENT = "#323233";

export default function TimeSheetOld() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "min(100%, 640px)",
          height: "280px",
          background: "#6b8cce",
          borderRadius: "12px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        }}
        title="Old Time Sheets placeholder"
      />
      <p style={{ marginTop: "16px", textAlign: "center", fontSize: "0.95rem", color: MONUMENT }}>
        Placeholder — Old Time Sheets
      </p>
    </div>
  );
}
