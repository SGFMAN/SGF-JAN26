import React, { useCallback, useEffect, useState } from "react";
import useAppLogo from "../hooks/useAppLogo.js";
import { UI } from "../utils/uiThemeTokens";
import { APP_VERSION } from "../utils/appVersion";

const API_URL = "";
const LIGHT_MONUMENT = UI.pageBg;
const PAGE_TEXT = UI.pageText;
const WHITE = UI.cardBg;
const MONUMENT = UI.textPrimary;

const fieldStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  border: "none",
  fontSize: "1rem",
  color: MONUMENT,
  background: WHITE,
  boxSizing: "border-box",
};

function formatDateLabel(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  // Prefer YYYY-MM-DD display as stored
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function ProjectOverviewCard({ project }) {
  const dates = project.importantDates || {};
  const dateRows = [
    ["Site visit", formatDateLabel(dates.siteVisitDate)],
    ["Site visit scheduled", formatDateLabel(dates.siteVisitScheduledDate)],
    ["Contract sent", formatDateLabel(dates.contractSentDate)],
    ["Contract complete", formatDateLabel(dates.contractCompleteDate)],
    ["Drawings sent", formatDateLabel(dates.drawingsSentToClientDate)],
    ["Colours sent", formatDateLabel(dates.coloursSentDate)],
  ].filter(([, v]) => v);

  return (
    <section
      style={{
        background: UI.panelBg,
        borderRadius: "12px",
        padding: "20px 22px",
        color: PAGE_TEXT,
        width: "100%",
        maxWidth: "560px",
        boxSizing: "border-box",
      }}
    >
      <h2 style={{ margin: "0 0 4px", fontSize: "1.25rem", fontWeight: 600 }}>
        {project.address || "Project"}
      </h2>
      <div style={{ opacity: 0.85, marginBottom: "16px", fontSize: "0.95rem" }}>
        Overview
      </div>

      <OverviewRow label="Current status" value={project.status} />
      <OverviewRow
        label="Substatus"
        value={
          project.substatus
            ? project.substatusDetail
              ? `${project.substatus} — ${project.substatusDetail}`
              : project.substatus
            : null
        }
      />
      <OverviewRow label="Sales consultant" value={project.salesConsultant} />
      <OverviewRow label="Project consultant" value={project.projectConsultant} />
      <OverviewRow label="Expected next step" value={project.expectedNextStep} />

      {dateRows.length > 0 ? (
        <div style={{ marginTop: "18px" }}>
          <div style={{ fontWeight: 600, marginBottom: "8px", fontSize: "0.95rem" }}>
            Important dates
          </div>
          {dateRows.map(([label, value]) => (
            <OverviewRow key={label} label={label} value={value} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function OverviewRow({ label, value }) {
  if (value == null || String(value).trim() === "") return null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        marginBottom: "10px",
      }}
    >
      <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>{label}</div>
      <div style={{ fontSize: "1rem", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

/**
 * Client Portal host experience: magic-link login + read-only project overview.
 */
export default function ClientPortalApp() {
  const logo = useAppLogo();
  const [phase, setPhase] = useState("loading"); // loading | login | consuming | app
  const [email, setEmail] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState("");
  const [consumeError, setConsumeError] = useState("");
  const [client, setClient] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectsError, setProjectsError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const loadSessionAndProjects = useCallback(async () => {
    const sessionRes = await fetch(`${API_URL}/api/client/auth/session`, {
      credentials: "same-origin",
    });
    if (!sessionRes.ok) {
      setClient(null);
      setProjects([]);
      setPhase("login");
      return;
    }
    const sessionData = await sessionRes.json();
    setClient(sessionData.client || null);

    const projectsRes = await fetch(`${API_URL}/api/client/projects`, {
      credentials: "same-origin",
    });
    if (!projectsRes.ok) {
      setProjectsError("Unable to load your projects.");
      setProjects([]);
    } else {
      const data = await projectsRes.json();
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setProjectsError("");
    }
    setPhase("app");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const params = new URLSearchParams(window.location.search);
      const path = window.location.pathname || "";
      const tokenFromQuery = params.get("token");
      const isMagicPath = path === "/auth/magic" || path.endsWith("/auth/magic");

      if (isMagicPath && tokenFromQuery) {
        setPhase("consuming");
        try {
          const res = await fetch(`${API_URL}/api/client/auth/consume`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ token: tokenFromQuery }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || "This login link is invalid or expired");
          }
          // Clean token from URL without full reload
          window.history.replaceState({}, "", "/");
          if (!cancelled) {
            await loadSessionAndProjects();
          }
        } catch (e) {
          if (!cancelled) {
            setConsumeError(e.message || "Unable to sign in");
            setPhase("login");
            window.history.replaceState({}, "", "/");
          }
        }
        return;
      }

      try {
        if (!cancelled) await loadSessionAndProjects();
      } catch {
        if (!cancelled) setPhase("login");
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [loadSessionAndProjects]);

  async function handleRequestLink(e) {
    e.preventDefault();
    setRequestError("");
    setRequestMessage("");
    const trimmed = email.trim();
    if (!trimmed) {
      setRequestError("Enter your email address");
      return;
    }
    setRequesting(true);
    try {
      const res = await fetch(`${API_URL}/api/client/auth/request-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Unable to send login link");
      }
      setRequestMessage(
        data.message || "If that email is registered, a login link has been sent."
      );
    } catch (err) {
      setRequestError(err.message || "Unable to send login link");
    } finally {
      setRequesting(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch(`${API_URL}/api/client/auth/logout`, {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      /* ignore */
    } finally {
      setClient(null);
      setProjects([]);
      setPhase("login");
      setLoggingOut(false);
    }
  }

  const shell = {
    position: "fixed",
    inset: 0,
    background: LIGHT_MONUMENT,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    overflow: "auto",
    padding: "32px 16px 48px",
    boxSizing: "border-box",
  };

  if (phase === "loading" || phase === "consuming") {
    return (
      <div style={shell}>
        <img
          src={logo}
          alt="Superior Granny Flats"
          style={{ maxWidth: "420px", width: "90%", objectFit: "contain", marginBottom: "24px" }}
        />
        <div style={{ color: PAGE_TEXT, opacity: 0.9 }}>
          {phase === "consuming" ? "Signing you in…" : "Loading…"}
        </div>
      </div>
    );
  }

  if (phase === "login") {
    return (
      <div style={shell}>
        <img
          src={logo}
          alt="Superior Granny Flats"
          style={{ maxWidth: "520px", width: "90%", objectFit: "contain", marginBottom: "8px" }}
        />
        <div
          style={{
            fontSize: "0.75rem",
            color: "#ffffff",
            opacity: 0.7,
            marginBottom: "16px",
          }}
        >
          {APP_VERSION}
        </div>
        <h1
          style={{
            margin: "0 0 20px",
            color: PAGE_TEXT,
            fontSize: "1.6rem",
            fontWeight: 600,
          }}
        >
          Client Portal
        </h1>

        <form
          onSubmit={handleRequestLink}
          style={{
            width: "100%",
            maxWidth: "360px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                color: PAGE_TEXT,
                fontSize: "0.9rem",
                marginBottom: "6px",
                fontWeight: 500,
              }}
            >
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={requesting}
              style={fieldStyle}
              autoComplete="email"
              required
            />
          </div>
          <button
            type="submit"
            disabled={requesting}
            style={{
              padding: "12px 20px",
              fontSize: "1rem",
              fontWeight: 500,
              color: UI.buttonPrimaryText,
              background: requesting ? "#666" : UI.buttonPrimary,
              border: "none",
              borderRadius: "8px",
              cursor: requesting ? "not-allowed" : "pointer",
            }}
          >
            {requesting ? "Sending…" : "Send me a login link"}
          </button>
          {requestMessage ? (
            <div style={{ color: PAGE_TEXT, opacity: 0.95, fontSize: "0.95rem", lineHeight: 1.4 }}>
              {requestMessage}
            </div>
          ) : null}
          {requestError ? (
            <div style={{ color: "#f88", fontSize: "0.95rem" }}>{requestError}</div>
          ) : null}
          {consumeError ? (
            <div style={{ color: "#f88", fontSize: "0.95rem" }}>{consumeError}</div>
          ) : null}
        </form>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <img
          src={logo}
          alt="Superior Granny Flats"
          style={{ maxWidth: "220px", width: "55%", objectFit: "contain" }}
        />
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            padding: "8px 14px",
            fontSize: "0.9rem",
            fontWeight: 500,
            color: PAGE_TEXT,
            background: "transparent",
            border: `1px solid ${WHITE}`,
            borderRadius: "8px",
            cursor: loggingOut ? "not-allowed" : "pointer",
          }}
        >
          {loggingOut ? "Signing out…" : "Logout"}
        </button>
      </div>

      <div style={{ width: "100%", maxWidth: "560px", marginBottom: "16px", color: PAGE_TEXT }}>
        <div style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "6px" }}>{APP_VERSION}</div>
        <h1 style={{ margin: "0 0 4px", fontSize: "1.5rem", fontWeight: 600 }}>Client Portal</h1>
        {client?.email ? (
          <div style={{ opacity: 0.85, fontSize: "0.95rem" }}>Signed in as {client.email}</div>
        ) : null}
      </div>

      {projectsError ? (
        <div style={{ color: "#f88", marginBottom: "12px" }}>{projectsError}</div>
      ) : null}

      {projects.length === 0 ? (
        <div style={{ color: PAGE_TEXT, opacity: 0.9, maxWidth: "560px" }}>
          No projects are linked to this account yet. If you expected to see a project, ask your
          Superior Granny Flats consultant to send an invitation.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%", alignItems: "center" }}>
          {projects.map((p) => (
            <ProjectOverviewCard key={p.projectId} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
