import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../images/logo.png";
import MapsSidebar, {
  LIGHT_MONUMENT,
  MONUMENT,
  SECTION_GREY,
  sgfContentPanelStyle,
  sgfPageHeadingStyle,
  sgfSectionsContainerStyle,
  WHITE,
} from "../components/MapsSidebar";
import {
  formatRecentSearchWhen,
  loadRecentMapSearches,
  sortRecentMapSearches,
} from "../utils/mapsRecentSearches";

const EXPLORER_BG = "#f3f3f3";
const EXPLORER_BORDER = "#d1d1d1";

export default function MapsRecent() {
  const navigate = useNavigate();
  const [recentSort, setRecentSort] = useState("chrono");
  const [recentSearches, setRecentSearches] = useState(() => loadRecentMapSearches());

  useEffect(() => {
    setRecentSearches(loadRecentMapSearches());
  }, []);

  const displayedRecent = useMemo(
    () => sortRecentMapSearches(recentSearches, recentSort),
    [recentSearches, recentSort]
  );

  function onSelectRecent(item) {
    navigate("/maps", { state: { searchQuery: item.query } });
  }

  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        minHeight: "100vh",
        width: "100vw",
        overflowY: "auto",
      }}
    >
      <div style={sgfPageHeadingStyle}>
        <Link to="/projects" style={{ position: "absolute", left: "40px", cursor: "pointer" }}>
          <img
            src={logo}
            alt="SGF Logo"
            style={{
              width: "120px",
              height: "auto",
            }}
          />
        </Link>
        <div style={{ display: "flex", alignItems: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: WHITE,
              letterSpacing: "1px",
            }}
          >
            Recent searches
          </h1>
        </div>
      </div>

      <div className="sections-container" style={sgfSectionsContainerStyle}>
        <MapsSidebar activeView="recent" />

        <div
          className="content-section"
          style={{
            ...sgfContentPanelStyle,
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              background: EXPLORER_BG,
              borderRadius: "12px",
              border: `1px solid ${EXPLORER_BORDER}`,
              padding: "12px 14px",
            }}
          >
            <div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700, color: MONUMENT }}>
                {displayedRecent.length} {displayedRecent.length === 1 ? "address" : "addresses"}
              </div>
              <div style={{ fontSize: "0.82rem", color: "#555", marginTop: "4px" }}>
                Click an address to open it on the map.
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setRecentSort("chrono")}
                style={{
                  padding: "10px 16px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  borderRadius: "10px",
                  border: `1px solid ${EXPLORER_BORDER}`,
                  cursor: "pointer",
                  background: recentSort === "chrono" ? MONUMENT : WHITE,
                  color: recentSort === "chrono" ? WHITE : MONUMENT,
                }}
              >
                Recent
              </button>
              <button
                type="button"
                onClick={() => setRecentSort("alpha")}
                style={{
                  padding: "10px 16px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  borderRadius: "10px",
                  border: `1px solid ${EXPLORER_BORDER}`,
                  cursor: "pointer",
                  background: recentSort === "alpha" ? MONUMENT : WHITE,
                  color: recentSort === "alpha" ? WHITE : MONUMENT,
                }}
              >
                A–Z
              </button>
            </div>
          </div>

          <div
            style={{
              flex: "1 1 auto",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              minHeight: 0,
            }}
          >
            {displayedRecent.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "32px 24px",
                  background: EXPLORER_BG,
                  borderRadius: "12px",
                  border: `1px solid ${EXPLORER_BORDER}`,
                  color: "#555",
                  fontSize: "1rem",
                  lineHeight: 1.5,
                  textAlign: "center",
                }}
              >
                No searches yet. Use the map to search for an address — it will appear here.
              </div>
            ) : (
              displayedRecent.map((item) => {
                const address = item.label || item.query;
                return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectRecent(item)}
                  title={address}
                  style={{
                    padding: "12px 16px",
                    borderRadius: "12px",
                    border: `1px solid ${EXPLORER_BORDER}`,
                    background: WHITE,
                    color: MONUMENT,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "16px",
                    width: "100%",
                    boxSizing: "border-box",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      flex: "1 1 auto",
                      minWidth: 0,
                      fontSize: "0.95rem",
                      fontWeight: 400,
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                    }}
                  >
                    {address}
                  </span>
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: "0.78rem",
                      color: "#888",
                      whiteSpace: "nowrap",
                      textAlign: "right",
                    }}
                  >
                    {formatRecentSearchWhen(item.searchedAt)}
                  </span>
                </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
