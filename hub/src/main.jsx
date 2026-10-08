import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./centralEmbed";
import "./index.css";
import App from "./App.jsx";
import PublicDefectJob from "./pages/PublicDefectJob.jsx";

// /defect-job is a no-login contractor link (the access code in the URL is
// the credential) — it bypasses the authenticated SGFHUB shell entirely.
const Root = window.location.pathname === "/defect-job" ? PublicDefectJob : App;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
