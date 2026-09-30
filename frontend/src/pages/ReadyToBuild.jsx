import React from "react";
import ProjectStatusListPage from "./ProjectStatusListPage";
import { isReadyToBuildStatus, READY_TO_BUILD } from "../utils/projectStatus";
import { getReadyToBuildSewerNote } from "../constants/planningStatusFields";

export default function ReadyToBuild() {
  return (
    <ProjectStatusListPage
      title={READY_TO_BUILD}
      pathname="/ready-to-build"
      matchStatus={isReadyToBuildStatus}
      emptyLabel="No ready to build projects found."
      getCardNote={getReadyToBuildSewerNote}
    />
  );
}
