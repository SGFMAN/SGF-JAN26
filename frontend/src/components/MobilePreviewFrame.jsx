import React, { useEffect, useState } from "react";
import "../mobile/mobile-preview.css";

function MobilePreviewStatusBar() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const date = now.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="mobile-preview-device__status-bar" aria-hidden="true">
      <div className="mobile-preview-device__status-left">
        <span className="mobile-preview-device__status-time">{time}</span>
        <span className="mobile-preview-device__status-date">{date}</span>
      </div>
      <div className="mobile-preview-device__status-right">
        <span className="mobile-preview-device__status-icon" title="Signal">
          ●●●●
        </span>
        <span className="mobile-preview-device__status-icon mobile-preview-device__status-wifi" title="Wi‑Fi">
          ⌁
        </span>
        <span className="mobile-preview-device__status-battery" title="Battery">
          <span className="mobile-preview-device__status-battery-fill" />
        </span>
      </div>
    </div>
  );
}

export default function MobilePreviewFrame({ children }) {
  return (
    <div className="mobile-preview-device" aria-label="Mobile preview (iPhone 15 size)">
      <div className="mobile-preview-device__screen">
        <div className="mobile-preview-device__island" aria-hidden="true" />
        <MobilePreviewStatusBar />
        <div className="mobile-preview-device__app">{children}</div>
      </div>
    </div>
  );
}
