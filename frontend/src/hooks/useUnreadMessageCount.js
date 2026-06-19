import { useCallback, useEffect, useState } from "react";
import { getApiHeaders } from "../utils/auth";

const API_URL = "";
const DEFAULT_POLL_MS = 5_000;

export function useUnreadMessageCount({ enabled = true, pollMs = DEFAULT_POLL_MS } = {}) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setUnreadCount(0);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/messages/unread-count`, {
        headers: getApiHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setUnreadCount(0);
        return;
      }
      setUnreadCount(Number(data.count) || 0);
    } catch {
      setUnreadCount(0);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setUnreadCount(0);
      return;
    }

    refresh();
    const intervalId = window.setInterval(refresh, pollMs);

    const handleVisibility = () => {
      if (!document.hidden) {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, pollMs, refresh]);

  return {
    unreadCount,
    hasUnread: unreadCount > 0,
    refresh,
  };
}
