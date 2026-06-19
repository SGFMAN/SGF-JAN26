import { useEffect, useState } from "react";
import { getApiHeaders, getLoggedInUserId, isAuthenticated } from "../utils/auth";
import craig3 from "../images/craig3.jpg";

const API_URL = "";
const CHECK_INTERVAL_MS = 8000;
const WAIT_MS = 5000;
const FADE_MS = 1500;
const VISIBLE_OPACITY = 0.3;

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function CooperSmithScreenFlip() {
  const [active, setActive] = useState(false);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function checkTarget() {
      if (!isAuthenticated() || !getLoggedInUserId()) {
        if (!cancelled) setActive(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/prank/cooper-screen-flip`, {
          headers: getApiHeaders(),
        });
        const data = await response.json().catch(() => ({}));
        if (!cancelled) {
          setActive(Boolean(data.enabled));
        }
      } catch {
        if (!cancelled) setActive(false);
      }
    }

    checkTarget();
    const intervalId = window.setInterval(checkTarget, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!active) {
      setOpacity(0);
      return undefined;
    }

    let cancelled = false;

    async function runCycle() {
      while (!cancelled) {
        setOpacity(0);
        await wait(WAIT_MS);
        if (cancelled) break;

        setOpacity(VISIBLE_OPACITY);
        await wait(FADE_MS + WAIT_MS);
        if (cancelled) break;

        setOpacity(0);
        await wait(FADE_MS);
      }
    }

    runCycle();

    return () => {
      cancelled = true;
    };
  }, [active]);

  if (!active) {
    return null;
  }

  return (
    <img
      src={craig3}
      alt=""
      aria-hidden="true"
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        height: "100vh",
        width: "auto",
        maxWidth: "100vw",
        objectFit: "contain",
        opacity,
        transition: `opacity ${FADE_MS}ms ease-in-out`,
        pointerEvents: "none",
        zIndex: 10004,
      }}
    />
  );
}
