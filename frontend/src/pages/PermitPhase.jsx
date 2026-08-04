import React from "react";
import ProjectStatusListPage from "./ProjectStatusListPage";
import { isPermitPhaseStatus, PERMIT_PHASE } from "../utils/projectStatus";

export default function PermitPhase() {
  return (
    <ProjectStatusListPage
      title={PERMIT_PHASE}
      pathname="/permit-phase"
      matchStatus={isPermitPhaseStatus}
      emptyLabel="No permit phase projects found."
    />
  );
}
