import React from "react";
import { Link } from "react-router-dom";
import { CLASSIFICATION_BADGE_MAP } from "../utils/classifications";
import { projectPath } from "../utils/projectUrl";

export default function MobileProjectCard({ project }) {
  const classification = project.classification
    ? CLASSIFICATION_BADGE_MAP[project.classification]
    : null;
  const clientName = project.client_name || project.client1_name || "";

  return (
    <Link to={projectPath(project)} className="mobile-project-card">
      <div className="mobile-project-card__suburb">
        {(project.suburb || "Unknown suburb").toUpperCase()}
      </div>
      <div className="mobile-project-card__street">{project.street || "No address"}</div>
      <div className="mobile-project-card__meta">
        <span className="mobile-project-card__badge">{project.status || "—"}</span>
        {project.state ? (
          <span className="mobile-project-card__badge">{project.state}</span>
        ) : null}
        {classification ? (
          <span
            className="mobile-project-card__badge"
            style={{ color: classification.color, fontWeight: 700 }}
          >
            {classification.acronym}
          </span>
        ) : null}
        {clientName ? (
          <span className="mobile-project-card__client">{clientName}</span>
        ) : null}
      </div>
    </Link>
  );
}
