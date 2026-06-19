import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  TAB_COORDINATOR_CHANNEL,
  getTabId,
} from "../utils/tabCoordinator";

export default function AppTabCoordinator() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      return undefined;
    }

    const channel = new BroadcastChannel(TAB_COORDINATOR_CHANNEL);
    const tabId = getTabId();

    channel.onmessage = (event) => {
      const data = event.data;
      if (!data || data.tabId === tabId) {
        return;
      }

      if (data.type === "ping-open") {
        channel.postMessage({ type: "pong-open", tabId, fromTabId: tabId });
      }

      if (data.type === "navigate") {
        const target = `${data.pathname || ""}${data.search || ""}${data.hash || ""}`;
        navigate(target, { replace: true });
        window.focus();
      }
    };

    return () => {
      channel.close();
    };
  }, [navigate]);

  return null;
}
