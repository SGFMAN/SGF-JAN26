import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import ToolsSidebarMenu from "../components/ToolsSidebarMenu";
import useAppLogo from "../hooks/useAppLogo.js";
import { getLoggedInUserId, getLoggedInUserName, getPasswordType } from "../utils/auth";
import { UI } from "../utils/uiThemeTokens.js";

const MONUMENT = UI.textPrimary;
const SECTION_GREY = UI.panelBg;
const LIGHT_MONUMENT = UI.pageBg;
const PAGE_TEXT = UI.pageText;

function hubOrigin() {
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:5176`;
}

export default function Dan() {
  const logo = useAppLogo();
  const frameRef = useRef(null);

  useEffect(() => {
    function sendStaffSession() {
      const frame = frameRef.current?.contentWindow;
      if (!frame) return;
      const userId = getLoggedInUserId();
      if (!userId) return;
      frame.postMessage(
        {
          type: "sgf-central-staff",
          userId,
          userName: getLoggedInUserName(),
          passwordType: getPasswordType(),
        },
        hubOrigin()
      );
    }

    function onHubReady(event) {
      if (event.origin !== hubOrigin()) return;
      if (event.data?.type !== "sgfhub-ready") return;
      if (event.source !== frameRef.current?.contentWindow) return;
      sendStaffSession();
    }

    const frame = frameRef.current;
    sendStaffSession();
    frame?.addEventListener("load", sendStaffSession);
    window.addEventListener("message", onHubReady);
    return () => {
      frame?.removeEventListener("load", sendStaffSession);
      window.removeEventListener("message", onHubReady);
    };
  }, []);

  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          margin: "24px auto 16px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 32px",
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img src={logo} alt="SGF Logo" style={{ width: "120px", height: "auto" }} />
        </Link>
        <div style={{ display: "flex", alignItems: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: PAGE_TEXT,
              letterSpacing: "1px",
            }}
          >
            Dan
          </h1>
        </div>
      </div>

      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "0 auto 24px auto",
          gap: "32px",
          flex: 1,
          minHeight: 0,
        }}
      >
        <ToolsSidebarMenu activePath="/dan" fillHeight />
        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: 0,
            height: "100%",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "12px",
            boxSizing: "border-box",
            overflow: "hidden",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <p style={{ margin: "0 4px", fontSize: "0.9rem", color: MONUMENT, flexShrink: 0 }}>
            Dan&apos;s screens. Job tracking uses Central projects. A missing field shows its name with *.
          </p>
          <iframe
            ref={frameRef}
            title="Dan"
            src={`${hubOrigin()}/`}
            style={{
              flex: 1,
              width: "100%",
              minHeight: 0,
              border: "none",
              borderRadius: "12px",
              background: "#f4f6f8",
            }}
          />
        </div>
      </div>
    </div>
  );
}
