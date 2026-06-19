import { useEffect, useState } from "react";
import { getApiHeaders, getLoggedInUserId, isAuthenticated } from "../utils/auth";

const API_URL = "";
const FLIP_INTERVAL_MS = 5000;
const CHECK_INTERVAL_MS = 8000;

export default function CooperSmithScreenFlip() {
  const [active, setActive] = useState(false);
  const [flipped, setFlipped] = useState(false);

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
      setFlipped(false);
      return undefined;
    }

    const interval = window.setInterval(() => {
      setFlipped((prev) => !prev);
    }, FLIP_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [active]);

  useEffect(() => {
    const root = document.documentElement;
    if (!active) {
      root.classList.remove("cooper-smith-flipped");
      root.style.transition = "";
      return undefined;
    }

    root.style.transition = "transform 0.35s ease-in-out";
    root.classList.toggle("cooper-smith-flipped", flipped);

    return () => {
      root.classList.remove("cooper-smith-flipped");
      root.style.transition = "";
    };
  }, [active, flipped]);

  return null;
}
