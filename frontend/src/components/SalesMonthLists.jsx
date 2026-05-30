import React from "react";

const MONUMENT = "#323233";
const WHITE = "#fff";

const COLUMN1_STREAM = "SGF - VIC";
const COLUMN2_STREAM = "SGF - QLD";
const COLUMN3_STREAMS = ["Dual Dwelling", "ATA", "Pumped On Property"];
const COLUMN4_STREAMS = ["Henderson", "Create Cash Flow", "Fresh Start Advisory"];

function streamMatches(projectStream, stream) {
  if (stream === "Pumped On Property") {
    return projectStream === "Pumped On Property" || projectStream === "Pumped on Property";
  }
  if (stream === "Create Cash Flow") {
    return projectStream === "Create Cash Flow" || projectStream === "Creat Cash Flow";
  }
  return projectStream === stream;
}

function getStreamProjects(monthFilteredProjects, stream) {
  return monthFilteredProjects
    .filter((project) => streamMatches(project.stream || "", stream))
    .sort((a, b) => {
      const dateA = a.year ? a.year.toString() : "";
      const dateB = b.year ? b.year.toString() : "";
      if (dateA.includes("-") && dateB.includes("-")) {
        const dayA = parseInt(dateA.split("-")[2] || "0", 10);
        const dayB = parseInt(dateB.split("-")[2] || "0", 10);
        return dayA - dayB;
      }
      return 0;
    });
}

function formatProjectCost(project) {
  if (!project?.project_cost) return "";
  const cost = parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0, 10);
  return cost ? `$${cost.toLocaleString()}` : "";
}

function ProjectCell({ project, currentCellColor, hoverColor, suburb, street, projectCost, onProjectClick }) {
  const stateCode = (project?.state || "").toString().trim().toUpperCase();
  const stateSuffix = stateCode ? ` [${stateCode}]` : "";
  const interactive = Boolean(onProjectClick);

  return (
    <div
      onClick={interactive ? () => onProjectClick(project) : undefined}
      style={{
        cursor: interactive ? "pointer" : "default",
        color: MONUMENT,
        fontSize: "0.65rem",
        fontWeight: 400,
        lineHeight: "18px",
        padding: "0 4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        border: "1px solid #000000",
        backgroundColor: currentCellColor,
        height: "18px",
        overflow: "hidden",
      }}
      onMouseEnter={
        interactive ? (e) => {
          e.currentTarget.style.background = hoverColor;
        } : undefined
      }
      onMouseLeave={
        interactive
          ? (e) => {
              e.currentTarget.style.background = currentCellColor;
            }
          : undefined
      }
    >
      <span
        style={{
          textAlign: "left",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {suburb} - {street}
        {stateSuffix}
        {(project?.classification || "").trim() === "Renovation" ? (
          <span style={{ fontWeight: 700 }}> [RENOVATION]</span>
        ) : null}
      </span>
      {projectCost ? <span style={{ flexShrink: 0, textAlign: "right" }}>{projectCost}</span> : null}
    </div>
  );
}

function StreamGrid({ stream, streamProjects, gridSize, cellColorLight, cellColorExtraLight, darkerColor, hoverColor, onProjectClick }) {
  const totalCost = streamProjects.reduce((sum, project) => {
    if (project?.project_cost) {
      return sum + parseInt(project.project_cost.toString().replace(/[^0-9]/g, "") || 0, 10);
    }
    return sum;
  }, 0);
  const totalCostFormatted = `$${totalCost.toLocaleString()}`;
  const middleRowCount = gridSize - 2;
  const borderHeight = middleRowCount * 18 + (middleRowCount - 1);

  const allCells = Array.from({ length: gridSize }, (_, i) => {
    if (i === 0) return "HEADING";
    if (i === gridSize - 1) return "TOTAL";
    return streamProjects[i - 1] || null;
  });

  return (
    <div style={{ display: "flex", width: "100%", border: "2px solid #000000" }}>
      <div style={{ width: "6px", backgroundColor: darkerColor }} />
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateRows: `repeat(${gridSize}, 18px)`,
          gap: "1px",
          minWidth: 0,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "19px",
            left: 0,
            right: 0,
            height: `${borderHeight}px`,
            border: "1px solid #000000",
            pointerEvents: "none",
          }}
        />
        {allCells.map((cell, index) => {
          const isEvenRow = (index - 1) % 2 === 0;
          const currentCellColor = isEvenRow ? cellColorLight : cellColorExtraLight;

          if (cell === "HEADING") {
            return (
              <div
                key={`heading-${stream}-${index}`}
                style={{
                  backgroundColor: darkerColor,
                  height: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  color: WHITE,
                }}
              >
                <span>
                  {stream.toUpperCase()} SALES: {streamProjects.length}
                </span>
              </div>
            );
          }

          if (cell === "TOTAL") {
            return (
              <div
                key={`total-${stream}-${index}`}
                style={{
                  borderBottom: "1px solid #000000",
                  backgroundColor: darkerColor,
                  height: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 4px",
                  fontWeight: 700,
                  fontSize: "0.75rem",
                  color: WHITE,
                }}
              >
                <span>TOTAL</span>
                <span style={{ flexShrink: 0 }}>{totalCostFormatted}</span>
              </div>
            );
          }

          if (!cell) {
            return (
              <div
                key={`empty-${stream}-${index}`}
                style={{
                  border: "1px solid #000000",
                  backgroundColor: currentCellColor,
                  height: "18px",
                }}
              />
            );
          }

          const project = cell;
          return (
            <ProjectCell
              key={project.id}
              project={project}
              currentCellColor={currentCellColor}
              hoverColor={hoverColor}
              suburb={(project.suburb || "Unknown Suburb").toUpperCase()}
              street={project.street || "No address"}
              projectCost={formatProjectCost(project)}
              onProjectClick={onProjectClick}
            />
          );
        })}
      </div>
      <div style={{ width: "6px", backgroundColor: darkerColor }} />
    </div>
  );
}

/**
 * Monthly sales list grid — same layout as the Sales page (/sales).
 */
export default function SalesMonthLists({ monthFilteredProjects, pageTitle, onProjectClick }) {
  const vicProjects = getStreamProjects(monthFilteredProjects, COLUMN1_STREAM);
  const qldProjects = getStreamProjects(monthFilteredProjects, COLUMN2_STREAM);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {pageTitle ? (
        <h2
          style={{
            margin: 0,
            fontSize: "1.6rem",
            fontWeight: 700,
            color: MONUMENT,
            letterSpacing: "0.5px",
          }}
        >
          {pageTitle}
        </h2>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <StreamGrid
            stream={COLUMN1_STREAM}
            streamProjects={vicProjects}
            gridSize={35}
            cellColorLight="#C5DDF5"
            cellColorExtraLight="#E3F2FC"
            darkerColor="#4D93D9"
            hoverColor="#4D93D9"
            onProjectClick={onProjectClick}
          />
        </div>

        <div style={{ minWidth: 0 }}>
          <StreamGrid
            stream={COLUMN2_STREAM}
            streamProjects={qldProjects}
            gridSize={35}
            cellColorLight="#F9B5C0"
            cellColorExtraLight="#FCD4DC"
            darkerColor="#D54358"
            hoverColor="#D54358"
            onProjectClick={onProjectClick}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
          {COLUMN3_STREAMS.map((stream, index) => (
            <div key={stream} style={{ marginTop: index > 0 ? "13px" : 0 }}>
              <StreamGrid
                stream={stream}
                streamProjects={getStreamProjects(monthFilteredProjects, stream)}
                gridSize={11}
                cellColorLight="#D9F0C1"
                cellColorExtraLight="#E8F7D8"
                darkerColor="#92D050"
                hoverColor="#92D050"
                onProjectClick={onProjectClick}
              />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
          {COLUMN4_STREAMS.map((stream, index) => (
            <div key={stream} style={{ marginTop: index > 0 ? "13px" : 0 }}>
              <StreamGrid
                stream={stream}
                streamProjects={getStreamProjects(monthFilteredProjects, stream)}
                gridSize={11}
                cellColorLight="#D9F0C1"
                cellColorExtraLight="#E8F7D8"
                darkerColor="#92D050"
                hoverColor="#92D050"
                onProjectClick={onProjectClick}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
