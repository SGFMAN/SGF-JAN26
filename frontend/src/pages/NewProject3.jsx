import React, { useState, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

export default function NewProject3({ isOpen, onClose, formData, onFormDataChange, onBack, onNext }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Only accept PDF files
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setSelectedFile(file);
      } else {
        alert("Please select a PDF file");
      }
    }
  }

  function handleFileSelect(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Only accept PDF files
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setSelectedFile(file);
      } else {
        alert("Please select a PDF file");
      }
    }
  }

  function handleBrowseClick() {
    fileInputRef.current?.click();
  }

  function handleNext() {
    // Store the selected file in formData temporarily
    if (selectedFile) {
      onFormDataChange({
        ...formData,
        proposalFile: selectedFile,
      });
    }
    // Move to next step (NewProject4)
    if (onNext) {
      onNext();
    }
  }

  function handleCancel() {
    setSelectedFile(null);
    setIsDragging(false);
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
        zIndex: 2000,
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
          Upload Proposal
        </h2>

        {/* Dropzone */}
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleBrowseClick}
          style={{
            border: `2px dashed ${isDragging ? MONUMENT : "#ccc"}`,
            borderRadius: "12px",
            padding: "48px 24px",
            textAlign: "center",
            cursor: "pointer",
            background: isDragging ? "rgba(50, 50, 51, 0.05)" : WHITE,
            transition: "all 0.2s",
            marginBottom: "24px",
            minHeight: "200px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              fontSize: "3rem",
              color: isDragging ? MONUMENT : "#999",
            }}
          >
            📄
          </div>
          {selectedFile ? (
            <>
              <div
                style={{
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: MONUMENT,
                }}
              >
                {selectedFile.name}
              </div>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#666",
                }}
              >
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </div>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#666",
                  marginTop: "8px",
                }}
              >
                Click to select a different file
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: MONUMENT,
                }}
              >
                {isDragging ? "Drop PDF file here" : "Drag and drop a PDF file here"}
              </div>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#666",
                }}
              >
                or click to browse
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          <button
            type="button"
            onClick={onBack}
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
            Back
          </button>
          <button
            type="button"
            onClick={handleCancel}
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
            disabled={!selectedFile}
            style={{
              background: MONUMENT,
              color: WHITE,
              border: "none",
              borderRadius: "10px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: selectedFile ? "pointer" : "not-allowed",
              transition: "background 0.17s",
              opacity: selectedFile ? 1 : 0.6,
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
 