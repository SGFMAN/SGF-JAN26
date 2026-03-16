import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";

export default function Inbox() {
  const [htmlContent, setHtmlContent] = useState("");
  const [userRequest, setUserRequest] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const playgroundRef = useRef(null);

  const loadPlayground = async () => {
    try {
      const response = await fetch("/playground.html");
      if (!response.ok) {
        throw new Error(`Failed to load playground.html: ${response.status} ${response.statusText}`);
      }
      const html = await response.text();
      
      // Extract body content and styles from the HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      
      // Get styles from head
      const styles = doc.querySelector("style")?.innerHTML || "";
      
      // Get scripts from head or body
      const scripts = Array.from(doc.querySelectorAll("script"))
        .map(script => script.textContent || script.innerHTML)
        .join("\n");
      
      // Get body content (without scripts, we'll execute them separately)
      const bodyClone = doc.body.cloneNode(true);
      Array.from(bodyClone.querySelectorAll("script")).forEach(script => script.remove());
      const bodyContent = bodyClone.innerHTML;
      
      // Store as object with separate styles, body, and scripts
      const fullContent = {
        styles: styles,
        body: bodyContent,
        scripts: scripts,
      };
      
      setHtmlContent(fullContent);
    } catch (error) {
      console.error("Error loading playground.html:", error);
      setHtmlContent({
        styles: '',
        body: `<div style='padding: 20px; color: red;'>Error loading playground.html: ${error.message}</div>`,
        scripts: '',
      });
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Are you sure you want to reset the playground to its original state? This will undo all changes.")) {
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch("/api/playground/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Failed to reset playground: ${response.status}`);
      }

      // Reload the playground to show the reset content
      await loadPlayground();
      
      // Clear the input
      setUserRequest("");
    } catch (error) {
      console.error("Error resetting playground:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAIEdit = async () => {
    if (!userRequest.trim()) {
      alert("Please enter a request");
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch("/api/playground/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          request: userRequest.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Failed to edit playground: ${response.status}`);
      }

      const data = await response.json();
      
      // Reload the playground to show the updated content
      await loadPlayground();
      
      // Clear the input
      setUserRequest("");
    } catch (error) {
      console.error("Error editing playground:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    loadPlayground();
  }, []);

  // Execute scripts when htmlContent changes
  useEffect(() => {
    if (!htmlContent || !playgroundRef.current) return;
    
    if (typeof htmlContent === 'string') {
      // Old format - just set innerHTML
      playgroundRef.current.innerHTML = htmlContent;
    } else {
      // New format - has styles, body, and scripts
      const container = playgroundRef.current;
      
      // Clear previous content
      container.innerHTML = '';
      
      // Add styles
      if (htmlContent.styles) {
        const styleEl = document.createElement('style');
        styleEl.textContent = htmlContent.styles;
        container.appendChild(styleEl);
      }
      
      // Add body content
      const bodyDiv = document.createElement('div');
      bodyDiv.innerHTML = htmlContent.body || '';
      container.appendChild(bodyDiv);
      
      // Execute scripts after DOM is ready
      if (htmlContent.scripts) {
        // Use requestAnimationFrame to ensure DOM is fully rendered
        requestAnimationFrame(() => {
          setTimeout(() => {
            try {
              // Execute script directly without wrapping to maintain variable scope
              // This allows variables to be accessible to event handlers
              const scriptElement = document.createElement('script');
              scriptElement.textContent = htmlContent.scripts;
              // Append to the container so it executes in the right context
              container.appendChild(scriptElement);
              // Remove after execution to keep DOM clean
              setTimeout(() => {
                if (scriptElement.parentNode) {
                  scriptElement.parentNode.removeChild(scriptElement);
                }
              }, 100);
            } catch (error) {
              console.error('Error executing playground script:', error);
              console.error('Script content:', htmlContent.scripts);
            }
          }, 50);
        });
      }
    }
  }, [htmlContent]);

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
      {/* Section 1: Heading */}
      <div
        style={{
          margin: "32px auto 24px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 32px",
          boxSizing: "border-box",
        }}
      >
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
            Playground
          </h1>
        </div>
      </div>

      {/* Sections 2 & 3 */}
      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "50px auto 0 auto",
          gap: "32px",
        }}
      >
        {/* Section 2: Menu */}
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "32px 12px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "18px",
            color: MONUMENT,
            overflowY: "auto",
          }}
        >
          <div style={{ flex: 1 }} />

          {/* Back to Main */}
          <Link
            to="/projects"
            style={{
              background: WHITE,
              color: MONUMENT,
              border: "none",
              borderRadius: "10px",
              padding: "13px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "background 0.17s",
              marginBottom: "4px",
              display: "block",
            }}
          >
            ← Back to Main
          </Link>
        </div>

        {/* Section 3: Main Content */}
        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: "758px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "24px 32px",
            boxSizing: "border-box",
            overflow: "auto",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {/* AI Input Section */}
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "16px",
              display: "flex",
              gap: "12px",
              alignItems: "flex-end",
            }}
          >
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                AI Request:
              </label>
              <input
                type="text"
                value={userRequest}
                onChange={(e) => setUserRequest(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && !isProcessing) {
                    handleAIEdit();
                  }
                }}
                placeholder="Prompt goes here.."
                disabled={isProcessing}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  fontSize: "1rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <button
              onClick={handleReset}
              disabled={isProcessing}
              style={{
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 500,
                color: MONUMENT,
                background: isProcessing ? SECTION_GREY : WHITE,
                border: `1px solid ${SECTION_GREY}`,
                borderRadius: "8px",
                cursor: isProcessing ? "not-allowed" : "pointer",
                transition: "background 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              Reset
            </button>
            <button
              onClick={handleAIEdit}
              disabled={isProcessing || !userRequest.trim()}
              style={{
                padding: "10px 24px",
                fontSize: "1rem",
                fontWeight: 500,
                color: WHITE,
                background: isProcessing || !userRequest.trim() ? SECTION_GREY : MONUMENT,
                border: "none",
                borderRadius: "8px",
                cursor: isProcessing || !userRequest.trim() ? "not-allowed" : "pointer",
                transition: "background 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              {isProcessing ? "Processing..." : "Apply"}
            </button>
          </div>
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "0",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "auto",
            }}
          >
            {htmlContent ? (
              <div
                ref={playgroundRef}
                style={{
                  width: "100%",
                  height: "100%",
                  flex: 1,
                }}
              />
            ) : (
              <div style={{ padding: "20px", textAlign: "center" }}>
                Loading playground...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

