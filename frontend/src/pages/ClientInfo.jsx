const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";

export default function ClientInfo({ project }) {
  return (
    <div>
      <h2 style={{ fontSize: "1.15rem", marginTop: 0, color: MONUMENT }}>
        Client Info
      </h2>
      {project && (
        <div style={{ marginTop: "24px" }}>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "4px" }}>
              Client Name
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 500 }}>
              {project.client_name || project.clientName || "-"}
            </div>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "4px" }}>
              Email
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 500 }}>
              {project.email || "-"}
            </div>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "0.9rem", color: "#32323399", marginBottom: "4px" }}>
              Phone
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 500 }}>
              {project.phone || "-"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
