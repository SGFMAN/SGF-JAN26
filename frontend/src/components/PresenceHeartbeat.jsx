import { useEffect } from "react";
import { getApiHeaders, getLoggedInUserId } from "../utils/auth";

const API_URL = "";
const HEARTBEAT_MS = 20_000;

export default function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false;

    const ping = () => {
      const userId = getLoggedInUserId();
      if (!userId || cancelled) return;

      fetch(`${API_URL}/api/auth/presence`, {
        method: "POST",
        headers: getApiHeaders(),
      }).catch(() => {});
    };

    ping();
    const intervalId = window.setInterval(ping, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
