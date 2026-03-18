import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const MONUMENT = "#323233";
const WHITE = "#fff";
const SECTION_GREY = "#a1a1a3";
const API_URL = "";

export default function PortalProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchPortalProjects() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`${API_URL}/api/portal/projects`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to fetch portal projects");
        }

        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("Portal projects fetch error:", e);
        setError(e.message || "Failed to load portal projects");
      } finally {
        setLoading(false);
      }
    }

    fetchPortalProjects();
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#42464d",
        minHeight: "100vh",
        width: "100vw",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          margin: "32px auto 0 auto",
          width: "calc(100vw - 64px)",
          maxWidth: "1100px",
          padding: "0 32px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
          <div style={{ color: WHITE, fontSize: "2.0rem", fontWeight: 800 }}>SGF WWW Portal</div>
          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.95rem" }}>Read-only</div>
        </div>

        <div
          style={{
            background: WHITE,
            borderRadius: "16px",
            padding: "24px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem", color: MONUMENT }}>Design Phase Projects</h2>
            <div style={{ fontSize: "0.95rem", color: SECTION_GREY, fontWeight: 600 }}>
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </div>
          </div>

          {loading && <div style={{ color: "#32323399" }}>Loading...</div>}
          {!loading && error && <div style={{ color: "#cc3333" }}>Error: {error}</div>}

          {!loading && !error && projects.length === 0 && (
            <div style={{ color: "#32323399" }}>No Design Phase projects available.</div>
          )}

          {!loading && !error && projects.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {projects.map((p) => {
                const suburb = p.suburb || "";
                const street = p.street || "";
                const classification = p.classification || "";
                const clientName = p.clientName || "";

                return (
                  <Link
                    key={p.id}
                    to={`/portal/projects/${p.id}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div
                      style={{
                        border: `2px solid ${SECTION_GREY}`,
                        borderRadius: "12px",
                        padding: "14px 14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px" }}>
                        <div style={{ fontWeight: 800, color: MONUMENT, fontSize: "1.05rem" }}>
                          {suburb.toUpperCase() || "UNKNOWN SUBURB"} {street ? `- ${street}` : ""}
                        </div>
                      </div>
                      <div style={{ color: "#32323399", fontSize: "0.95rem" }}>
                        Classification: {classification}
                      </div>
                      <div style={{ color: "#32323399", fontSize: "0.95rem" }}>
                        Client: {clientName}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

