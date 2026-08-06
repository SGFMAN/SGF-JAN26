/**
 * Convert textarea newlines in an email body to HTML <br> tags.
 * Matches backend `convertEmailBodyNewlinesToBr` in server.js.
 * Existing HTML tags (<b>, <br>, <a>, etc.) are left unchanged.
 */
export function convertEmailBodyNewlinesToBr(htmlBody) {
  return String(htmlBody || "")
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "<br>");
}
