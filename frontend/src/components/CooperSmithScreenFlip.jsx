import { useEffect, useState } from "react";
import { getLoggedInUserId, getLoggedInUserName, isAuthenticated } from "../utils/auth";

const TARGET_USER = "cooper smith";
const FLIP_INTERVAL_MS = 5000;

function isCooperSmith(name) {
  return (name || "").trim().toLowerCase() === TARGET_USER;
}

export default function CooperSmithScreenFlip() {
  const [active, setActive] = useState(false);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      setActive(false);
      return;
    }

    const storedName = getLoggedInUserName();
    if (isCooperSmith(storedName)) {
      setActive(true);
      return;
    }

    const userId = getLoggedInUserId();
    if (!userId) {
      setActive(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/users");
        if (!response.ok || cancelled) return;
        const users = await response.json();
        const user = users.find((u) => String(u.id) === String(userId));
        if (!cancelled) {
          setActive(isCooperSmith(user?.name));
        }
      } catch {
        if (!cancelled) setActive(false);
      }
    })();

    return () => {
      cancelled = true;
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
    const body = document.body;
    if (!active) {
      body.classList.remove("cooper-smith-flipped");
      body.style.transition = "";
      return undefined;
    }

    body.style.transition = "transform 0.35s ease-in-out";
    body.classList.toggle("cooper-smith-flipped", flipped);

    return () => {
      body.classList.remove("cooper-smith-flipped");
      body.style.transition = "";
    };
  }, [active, flipped]);

  return null;
}
