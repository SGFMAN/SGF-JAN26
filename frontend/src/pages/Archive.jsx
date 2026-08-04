import { Navigate } from "react-router-dom";

/** Archive entry — open Completed list with the archive submenu. */
export default function Archive() {
  return <Navigate to="/finished-projects" replace />;
}
