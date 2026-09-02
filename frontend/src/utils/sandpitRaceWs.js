/** WebSocket URL for the Sandpit race room (proxied in dev). */
export function getSandpitRaceWsUrl(userId, name) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams();
  if (userId != null && String(userId).trim()) params.set("userId", String(userId));
  if (name) params.set("name", String(name).slice(0, 40));
  const q = params.toString();
  return `${proto}//${window.location.host}/ws/sandpit-race${q ? `?${q}` : ""}`;
}
