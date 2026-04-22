const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "src", "pages", "HomePage.jsx");
let s = fs.readFileSync(file, "utf8");
const anchor = "{filteredProjects.map((project, index) => {";
const i = s.indexOf(anchor);
if (i < 0) {
  console.error("anchor not found");
  process.exit(1);
}
const endMarker = "                })}\n              </div>";
const j = s.indexOf(endMarker, i);
if (j < 0) {
  console.error("end not found");
  process.exit(1);
}
const end = j + "                })}".length;

const newBlock = `                {(() => {
                  const displayGroups = buildDuplicateChainGroups(filteredProjects);

                  function renderDesignPhaseCard(project) {
                    const classificationInfo = project.classification
                      ? CLASSIFICATION_BADGE_MAP[project.classification]
                      : null;
                    const streamInfo = project.stream ? DESIGN_PHASE_STREAM_MAP[project.stream] : null;
                    const isCopy =
                      project.duplicate_source_project_id != null &&
                      String(project.duplicate_source_project_id).trim() !== "";
                    return (
                      <Link
                        key={project.id}
                        to={"/project/" + project.id}
                        style={{
                          textDecoration: "none",
                          display: "block",
                        }}
                      >
                        <div
                          style={{
                            background: MONUMENT,
                            borderRadius: "8px",
                            width: "200px",
                            height: "100px",
                            color: SECTION_GREY,
                            cursor: "pointer",
                            transition: "opacity 0.2s",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            position: "relative",
                            overflow: "hidden",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                        >
                          {isCopy && (
                            <div
                              style={{
                                position: "absolute",
                                top: "6px",
                                right: "6px",
                                fontSize: "0.62rem",
                                fontWeight: 700,
                                color: WHITE,
                                background: "rgba(0,0,0,0.34)",
                                padding: "2px 7px",
                                borderRadius: "5px",
                                zIndex: 12,
                              }}
                            >
                              Copy
                            </div>
                          )}
                          {(project.on_hold === 'true' || project.on_hold === true) && (
                            <div
                              style={{
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%) rotate(-45deg)",
                                width: "280px",
                                height: "40px",
                                background: "#0066cc",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                zIndex: 10,
                                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                              }}
                            >
                              <span
                                style={{
                                  color: WHITE,
                                  fontWeight: 700,
                                  fontSize: "1.1rem",
                                  letterSpacing: "2px",
                                  textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                                }}
                              >
                                ON HOLD
                              </span>
                            </div>
                          )}
                          {project.status === "Cancelled" && (
                            <div
                              style={{
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%) rotate(-45deg)",
                                width: "280px",
                                height: "40px",
                                background: "#cc0000",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                zIndex: 10,
                                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                              }}
                            >
                              <span
                                style={{
                                  color: WHITE,
                                  fontWeight: 700,
                                  fontSize: "1.1rem",
                                  letterSpacing: "2px",
                                  textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                                }}
                              >
                                CANCELLED
                              </span>
                            </div>
                          )}
                          {streamInfo && (
                            <div
                              style={{
                                position: "absolute",
                                bottom: "8px",
                                left: "8px",
                                fontSize: "0.85rem",
                                fontWeight: 700,
                                color: streamInfo.color,
                                zIndex:
                                  (project.on_hold === 'true' || project.on_hold === true) ||
                                  project.status === "Cancelled"
                                    ? 11
                                    : 5,
                                textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                              }}
                            >
                              {streamInfo.acronym}
                            </div>
                          )}
                          {classificationInfo && (
                            <div
                              style={{
                                position: "absolute",
                                bottom: "8px",
                                right: "8px",
                                fontSize: "0.85rem",
                                fontWeight: 700,
                                color: classificationInfo.color,
                                zIndex:
                                  (project.on_hold === 'true' || project.on_hold === true) ||
                                  project.status === "Cancelled"
                                    ? 11
                                    : 5,
                                textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                              }}
                            >
                              {classificationInfo.acronym}
                            </div>
                          )}
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: "1.1rem",
                              textAlign: "center",
                              marginBottom: "4px",
                              width: "100%",
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                              flex: 1,
                              flexDirection: "column",
                              gap: "4px",
                              position: "relative",
                              zIndex: project.on_hold === 'true' || project.on_hold === true ? 1 : "auto",
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: "1.1rem", color: WHITE }}>
                              {(project.suburb || "Unknown Suburb").toUpperCase()}
                            </div>
                            <div style={{ fontSize: "0.95rem", color: WHITE, fontWeight: 400 }}>
                              {project.street || "No address"}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: "0.9rem",
                              color: "#323233cc",
                              textAlign: "center",
                              position: "relative",
                              zIndex: project.on_hold === 'true' || project.on_hold === true ? 1 : "auto",
                            }}
                          >
                            Status: {project.status}
                          </div>
                        </div>
                      </Link>
                    );
                  }

                  return displayGroups.map((group, gi) => {
                    const primary = group.type === "pair" ? group.a : group.project;
                    const prevPrimary =
                      gi > 0
                        ? displayGroups[gi - 1].type === "pair"
                          ? displayGroups[gi - 1].a
                          : displayGroups[gi - 1].project
                        : null;

                    const suburbName = (primary.suburb || "").trim();
                    const prevSuburbName = (prevPrimary?.suburb || "").trim();

                    const classificationName = (primary.classification || "").trim();
                    const prevClassificationName = (prevPrimary?.classification || "").trim();

                    const streamName = (primary.stream || "").trim();
                    const prevStreamName = (prevPrimary?.stream || "").trim();

                    const groupKey =
                      sortMode === "suburb"
                        ? suburbName
                          ? suburbName[0].toUpperCase()
                          : ""
                        : sortMode === "class"
                          ? classificationName
                          : sortMode === "stream"
                            ? streamName
                            : "";

                    const prevGroupKey =
                      sortMode === "suburb"
                        ? prevSuburbName
                          ? prevSuburbName[0].toUpperCase()
                          : ""
                        : sortMode === "class"
                          ? prevClassificationName
                          : sortMode === "stream"
                            ? prevStreamName
                            : "";

                    const showGroupHeader = groupKey && groupKey !== prevGroupKey;
                    const groupLabel = groupKey;

                    return (
                      <React.Fragment
                        key={
                          group.type === "pair"
                            ? "pair-" + group.a.id + "-" + group.b.id
                            : "single-" + group.project.id
                        }
                      >
                        {showGroupHeader && (
                          <div style={{ flexBasis: "100%", width: "100%", marginTop: "18px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <div
                                style={{
                                  fontSize: "1.3rem",
                                  fontWeight: 800,
                                  color: MONUMENT,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {groupLabel}
                              </div>
                              <div style={{ height: "2px", background: MONUMENT, flex: 1, opacity: 0.4 }} />
                            </div>
                          </div>
                        )}
                        {group.type === "pair" ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "14px",
                              flexWrap: "wrap",
                            }}
                          >
                            {renderDesignPhaseCard(group.a)}
                            <span
                              style={{
                                fontSize: "1.55rem",
                                lineHeight: 1,
                                color: SECTION_GREY,
                                userSelect: "none",
                                flexShrink: 0,
                              }}
                              title="Same job folder on disk"
                            >
                              ⛓
                            </span>
                            {renderDesignPhaseCard(group.b)}
                          </div>
                        ) : (
                          renderDesignPhaseCard(group.project)
                        )}
                      </React.Fragment>
                    );
                  });
                })()}`;

fs.writeFileSync(file, s.slice(0, i) + newBlock + s.slice(end));
console.log("OK", { start: i, end, replacedLen: end - i });
