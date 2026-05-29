/** WebSocket URL for the secret area multiplayer room (proxied in dev). */
export function getSecretAreaWsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/secret-area`;
}
