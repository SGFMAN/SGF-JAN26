import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

const MONUMENT = "#323233";
const WHITE = "#fff";
const SECTION_GREY = "#a1a1a3";
const API_URL = "";

function Field({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: "0.85rem", color: "#32323399", fontWeight: 600, marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "1.05rem", color: MONUMENT, fontWeight: 600 }}>{value || "-"}</div>
    </div>
  );
}

export default function PortalProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchPortalProject() {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(`${API_URL}/api/portal/projects/${id}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to fetch portal project");
        }

        const data = await res.json();
        setProject(data || null);
      } catch (e) {
        console.error("Portal project detail fetch error:", e);
        setError(e.message || "Failed to load portal project");
      } finally {
        setLoading(false);
      }
    }

    if (id) fetchPortalProject();
  }, [id]);

  const drawingUrl = `/api/portal/projects/${id}/drawing`;

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
          maxWidth: "900px",
          padding: "0 32px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <Link
            to="/portal"
            style={{
              color: WHITE,
              textDecoration: "none",
              fontWeight: 800,
              fontSize: "1rem",
            }}
          >
            ← Back
          </Link>
          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.95rem", fontWeight: 600 }}>Read-only</div>
        </div>

        <div
          style={{
            background: WHITE,
            borderRadius: "16px",
            padding: "24px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.25rem", color: MONUMENT, marginBottom: "16px" }}>Project Details</h2>

          {loading && <div style={{ color: "#32323399" }}>Loading...</div>}
          {!loading && error && <div style={{ color: "#cc3333" }}>Error: {error}</div>}

          {!loading && !error && !project && (
            <div style={{ color: "#32323399" }}>Project not found.</div>
          )}

          {!loading && !error && project && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
                <Field label="Suburb" value={project.suburb} />
                <Field label="Street" value={project.street} />
                <Field label="Classification" value={project.classification} />
                <Field label="Client Name" value={project.clientName} />
                <Field label="Client Email" value={project.clientEmail} />
                <Field label="Phone Number" value={project.phoneNumber} />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "8px" }}>
                <a
                  href={drawingUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    textDecoration: "none",
                    fontWeight: 800,
                    color: WHITE,
                    background: MONUMENT,
                    borderRadius: "10px",
                    padding: "12px 18px",
                    border: `2px solid ${MONUMENT}`,
                    display: "inline-block",
                  }}
                >
                  View Drawing PDF
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

