import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { hasUserAccess } from "../utils/userAccess";

export default function SalesAccessRoute({ children }) {
  const [ready, setReady] = useState(false);
  const [hasSales, setHasSales] = useState(false);

  useEffect(() => {
    (async () => {
      setHasSales(await hasUserAccess("sales"));
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#42464d",
          color: "#fff",
          fontSize: "1rem",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!hasSales) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}
