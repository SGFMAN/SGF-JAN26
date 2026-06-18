import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { hasUserAccess } from "../utils/userAccess";

export default function AdminAccessRoute({ children }) {
  const [ready, setReady] = useState(false);
  const [hasAdmin, setHasAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      setHasAdmin(await hasUserAccess("admin"));
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

  if (!hasAdmin) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}
