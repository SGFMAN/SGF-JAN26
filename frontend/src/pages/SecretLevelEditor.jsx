import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** Legacy URL — sends users to the secret area with the level editor overlay. */
export default function SecretLevelEditor() {
  const navigate = useNavigate();
  const location = useLocation();
  const planningReturnTo = location.state?.secretReturnTo || location.state?.returnTo || "/projects";

  useEffect(() => {
    navigate("/secret-area", {
      replace: true,
      state: { returnTo: planningReturnTo, openLevelEditor: true },
    });
  }, [navigate, planningReturnTo]);

  return null;
}
