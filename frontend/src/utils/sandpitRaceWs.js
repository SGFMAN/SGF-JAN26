/** WebSocket URL for the Sandpit race room. */
export function getSandpitRaceWsUrl(userId, name) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  // Vite's /ws proxy drops this socket; in dev talk to the API host directly.
  const host = import.meta.env.DEV
    ? `${window.location.hostname}:3001`
    : window.location.host;
  const params = new URLSearchParams();
  if (userId != null && String(userId).trim()) params.set("userId", String(userId));
  if (name) params.set("name", String(name).slice(0, 40));
  const q = params.toString();
  return `${proto}//${host}/ws/sandpit-race${q ? `?${q}` : ""}`;
}
