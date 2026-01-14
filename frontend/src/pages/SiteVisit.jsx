const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";

export default function SiteVisit({ project }) {
  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Site Visit
      </h2>
      {project && (
        <div style={{ marginTop: "24px" }}>
          <p style={{ color: "#32323399" }}>
            Site Visit content for {project.name}
          </p>
        </div>
      )}
    </div>
  );
}
