import React, { useEffect, useState } from "react";
import MobilePreviewFrame from "./MobilePreviewFrame";

const PHONE_W = 393;
const PHONE_H = 852;

function usePhoneScale() {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function measure() {
      const availW = window.innerWidth - 48;
      const availH = window.innerHeight - 108;
      const next = Math.min(1, availW / PHONE_W, availH / PHONE_H);
      setScale(next > 0 ? next : 1);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return scale;
}

export default function RunningLogSplash() {
  const scale = usePhoneScale();

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0d10",
      }}
    >
      <div style={{ width: PHONE_W * scale, height: PHONE_H * scale }}>
        <div
          style={{
            width: PHONE_W,
            height: PHONE_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <MobilePreviewFrame>
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "28px 28px 36px",
                boxSizing: "border-box",
                background:
                  "radial-gradient(ellipse at 50% 18%, rgba(255, 176, 92, 0.55) 0%, rgba(255, 176, 92, 0) 42%), linear-gradient(180deg, #1a120c 0%, #2a2118 38%, #121814 100%)",
                color: "#f6f1ea",
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
                textAlign: "center",
                position: "relative",
              }}
            >
              <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
                <circle cx="46" cy="46" r="40" fill="none" stroke="rgba(246,241,234,0.28)" strokeWidth="2" />
                <circle cx="46" cy="46" r="28" fill="none" stroke="#f0b429" strokeWidth="3" />
                <path
                  d="M30 58c6-14 10-14 16-4s8 2 16-16"
                  fill="none"
                  stroke="#f6f1ea"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div
                style={{
                  marginTop: 28,
                  fontSize: 13,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  opacity: 0.72,
                }}
              >
                Log
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 52,
                  fontWeight: 650,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                Running
              </div>
              <div style={{ marginTop: 14, fontSize: 17, opacity: 0.78, maxWidth: 240, lineHeight: 1.35 }}>
                Every run, kept.
              </div>
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: 10,
                  transform: "translateX(-50%)",
                  width: 134,
                  height: 5,
                  borderRadius: 3,
                  background: "rgba(246,241,234,0.85)",
                }}
              />
            </div>
          </MobilePreviewFrame>
        </div>
      </div>
    </div>
  );
}
