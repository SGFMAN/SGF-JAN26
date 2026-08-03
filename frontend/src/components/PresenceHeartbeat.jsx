import { useEffect } from "react";
import {
  getApiHeaders,
  getLoggedInUserId,
  startStaffAuthPeerResponder,
} from "../utils/auth";

const API_URL = "";
const HEARTBEAT_MS = 10_000;

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
    // Answer cross-tab "is anyone logged in?" probes for email / new-window auth
    const stopPeerResponder = startStaffAuthPeerResponder();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      stopPeerResponder();
    };
  }, []);

  return null;
}
