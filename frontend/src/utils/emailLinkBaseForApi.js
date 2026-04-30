/** Sent with email APIs so links in HTML match the SPA origin (host + port, e.g. Vite :5173). */
export function emailLinkBaseForApiBody() {
  if (typeof window === "undefined" || !window.location?.origin) return {};
  return { linkBaseUrl: window.location.origin };
}
