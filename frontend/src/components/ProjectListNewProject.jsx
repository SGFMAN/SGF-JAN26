import React, { useState } from "react";
import NewProject from "../pages/NewProject_1_Address";
import NewProject2 from "../pages/NewProject_2_ClientDetails";
import NewProject_5_PDFUpload from "../pages/NewProject_5_PDFUpload";
import NewProject_3_ProjectCost from "../pages/NewProject_3_ProjectCost";
import {
  filterSelectWidth,
  PROJECT_LIST_ACTION_BUTTON_LABELS,
} from "../utils/projectListFilters";
import { UI, STREAM } from "../utils/uiThemeTokens.js";
import { streamColorHover } from "../utils/streamColors.js";

const PAGE_TEXT = UI.pageText;
const API_URL = "";

export const EMPTY_NEW_PROJECT_FORM = {
  suburb: "",
  street: "",
  state: "",
  stream: "",
  deposit: "",
  customDeposit: "",
  projectCost: "",
  salesperson: "",
  specs: "",
  classification: "",
  clientName: "",
  email: "",
  phone: "",
};

export function getNewProjectButtonStyle() {
  const actionButtonWidth = filterSelectWidth(PROJECT_LIST_ACTION_BUTTON_LABELS);
  return {
    height: "48px",
    padding: "0 16px",
    borderRadius: "8px",
    width: actionButtonWidth,
    minWidth: actionButtonWidth,
    maxWidth: actionButtonWidth,
    fontSize: "0.9rem",
    fontWeight: 500,
    whiteSpace: "nowrap",
    textAlign: "center",
    cursor: "pointer",
    background: STREAM.streamGreen,
    color: PAGE_TEXT,
    border: `1px solid ${UI.outline}`,
    transition: "background 0.2s",
    boxSizing: "border-box",
  };
}

export function ProjectListNewProjectButton({ isAdmin, onClick }) {
  if (!isAdmin) return null;

  const newProjectButtonStyle = getNewProjectButtonStyle();

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...newProjectButtonStyle,
        position: "absolute",
        top: "20px",
        right: "32px",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = streamColorHover(STREAM.streamGreen);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = STREAM.streamGreen;
      }}
    >
      + New Project
    </button>
  );
}

async function createProjectFromForm(formData) {
  const projectName = `${formData.street}, ${formData.suburb}`.trim() || "New Project";
  const response = await fetch(`${API_URL}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: projectName,
      status: "Design Phase",
      suburb: formData.suburb || null,
      street: formData.street || null,
      state: formData.state || null,
      stream: formData.stream || null,
      deposit: formData.deposit || null,
      project_cost: formData.projectCost || null,
      salesperson: formData.salesperson || null,
      specs: formData.specs || null,
      classification: formData.classification || null,
      client_name: formData.clientName || null,
      email: formData.email || null,
      phone: formData.phone || null,
      client1_name: formData.clientName || null,
      client1_email: formData.email || null,
      client1_phone: formData.phone || null,
      year: new Date().toISOString().split("T")[0],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errorData.error || "Failed to create project");
  }

  return response.json();
}

function ProjectListNewProjectModals({
  isOpen,
  step,
  formData,
  setFormData,
  setStep,
  onReset,
  onComplete,
}) {
  const closeAndReset = () => onReset();

  return (
    <>
      <NewProject
        isOpen={isOpen && step === 1}
        onClose={closeAndReset}
        formData={formData}
        onFormDataChange={setFormData}
        onNext={() => setStep(2)}
      />
      <NewProject2
        isOpen={isOpen && step === 2}
        onClose={closeAndReset}
        formData={formData}
        onFormDataChange={setFormData}
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
      />
      <NewProject_3_ProjectCost
        isOpen={isOpen && step === 3}
        onClose={closeAndReset}
        formData={formData}
        onFormDataChange={setFormData}
        onBack={() => setStep(2)}
        onNext={() => setStep(4)}
      />
      <NewProject_5_PDFUpload
        isOpen={isOpen && step === 4}
        onClose={() => {
          closeAndReset();
          onComplete?.();
        }}
        formData={formData}
        onFormDataChange={setFormData}
        onBack={() => setStep(3)}
        onCreate={createProjectFromForm}
      />
    </>
  );
}

export function useProjectListNewProject(onComplete) {
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newProjectStep, setNewProjectStep] = useState(1);
  const [newProjectFormData, setNewProjectFormData] = useState(EMPTY_NEW_PROJECT_FORM);

  const resetNewProject = () => {
    setIsNewProjectOpen(false);
    setNewProjectStep(1);
    setNewProjectFormData({ ...EMPTY_NEW_PROJECT_FORM });
  };

  return {
    openNewProject: () => setIsNewProjectOpen(true),
    newProjectModals: (
      <ProjectListNewProjectModals
        isOpen={isNewProjectOpen}
        step={newProjectStep}
        formData={newProjectFormData}
        setFormData={setNewProjectFormData}
        setStep={setNewProjectStep}
        onReset={resetNewProject}
        onComplete={onComplete}
      />
    ),
  };
}
