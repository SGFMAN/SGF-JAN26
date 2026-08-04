import React from "react";
import ProjectStatusListPage from "./ProjectStatusListPage";
import { isPreEngagementPhaseStatus, PRE_ENGAGEMENT_PHASE } from "../utils/projectStatus";

export default function PreEngagementPhase() {
  return (
    <ProjectStatusListPage
      title={PRE_ENGAGEMENT_PHASE}
      pathname="/pre-engagement-phase"
      matchStatus={isPreEngagementPhaseStatus}
      emptyLabel="No pre-engagement phase projects found."
    />
  );
}
