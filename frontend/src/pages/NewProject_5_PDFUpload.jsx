import React, { useState, useRef } from "react";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const WHITE = "#fff";
const API_URL = "";

export default function NewProject_5_PDFUpload({ isOpen, onClose, formData, onFormDataChange, onBack, onNext, onCreate }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const API_URL = "";

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

  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Only accept PDF files
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setSelectedFile(file);
        // Upload immediately when file is dropped
        await handleFileUpload(file);
      } else {
        alert("Please select a PDF file");
      }
    }
  }

  async function handleFileSelect(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Only accept PDF files
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setSelectedFile(file);
        // Upload immediately when file is selected
        await handleFileUpload(file);
      } else {
        alert("Please select a PDF file");
      }
    }
  }

  function handleBrowseClick() {
    fileInputRef.current?.click();
  }

  async function handleFileUpload(file) {
    if (!file || !formData.folderPath) {
      console.error("Cannot upload: missing file or folder path");
      return;
    }

    setIsUploading(true);
    
    try {
      let newProject;
      if (onCreate) {
        // Hotlist "Sold" flow: upgrade hotlist item to project via API, then upload PDF
        newProject = await onCreate(formData);
        if (!newProject || !newProject.id) throw new Error("Failed to create project");
      } else {
        // Normal new project: create via POST /api/projects
        const projectResponse = await fetch(`${API_URL}/api/projects`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: `${formData.street}, ${formData.suburb}`.trim() || "New Project",
            suburb: formData.suburb || null,
            street: formData.street || null,
            state: formData.state || null,
            stream: formData.stream || null,
            deposit: formData.deposit || null,
            project_cost: formData.projectCost || null,
            salesperson: formData.salesperson || null,
            client_name: formData.clientName || null,
            email: formData.email || null,
            phone: formData.phone || null,
          }),
        });

        if (!projectResponse.ok) {
          const errorData = await projectResponse.json().catch(() => ({ error: "Failed to create project" }));
          throw new Error(errorData.error || "Failed to create project");
        }

        newProject = await projectResponse.json();
      }

      // Now upload the PDF to the project folder
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("projectId", newProject.id.toString());
      uploadFormData.append("projectPath", formData.folderPath);

      const uploadResponse = await fetch(`${API_URL}/api/files/upload-proposal`, {
        method: "POST",
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ error: "Failed to upload proposal" }));
        throw new Error(errorData.error || "Failed to upload proposal");
      }

      // Store project in formData
      onFormDataChange({
        ...formData,
        createdProject: newProject,
      });

      setIsUploading(false);
      
      // Proceed to email modal - pass project directly
      if (onNext) {
        // Call onNext with the project so it can be used immediately
        await onNext(newProject);
      }
    } catch (error) {
      console.error("Error uploading proposal:", error);
      alert(`Failed to upload proposal: ${error.message || "Unknown error"}`);
      setIsUploading(false);
    }
  }

  async function handleNext() {
    // If file was already uploaded and project created, just proceed
    if (formData.createdProject && onNext) {
      await onNext(formData.createdProject);
      return;
    }

    // If file is selected but not uploaded yet, upload it now
    if (selectedFile && !isUploading) {
      await handleFileUpload(selectedFile);
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
              {isUploading ? (
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: MONUMENT,
                    marginTop: "8px",
                    fontWeight: 500,
                  }}
                >
                  Uploading and creating project...
                </div>
              ) : formData.createdProject ? (
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "#4caf50",
                    marginTop: "8px",
                    fontWeight: 500,
                  }}
                >
                  ✓ Uploaded successfully
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: "#666",
                    marginTop: "8px",
                  }}
                >
                  Click to select a different file
                </div>
              )}
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
            disabled={!selectedFile || isUploading}
            style={{
              background: MONUMENT,
              color: WHITE,
              border: "none",
              borderRadius: "10px",
              padding: "10px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: (selectedFile && !isUploading) ? "pointer" : "not-allowed",
              transition: "background 0.17s",
              opacity: (selectedFile && !isUploading) ? 1 : 0.6,
            }}
          >
            {isUploading ? "Uploading..." : (formData.createdProject ? "Next" : "Next")}
          </button>
        </div>
      </div>
    </div>
  );
}
 