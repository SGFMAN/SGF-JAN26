/**
 * Convert textarea newlines in an email body to HTML <br> tags.
 * Matches backend `convertEmailBodyNewlinesToBr` in server.js.
 * Existing HTML tags (<b>, <br>, <a>, etc.) are left unchanged.
 * Bodies already stored as block HTML (Tiptap <p> etc.) are left as-is so
 * preview and send do not show raw tags or extra <br> between paragraphs.
 */
export function convertEmailBodyNewlinesToBr(htmlBody) {
  const raw = String(htmlBody || "")
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (!raw) return "";
  if (/<(?:p|div|ul|ol|li|h[1-6]|table|blockquote)\b/i.test(raw)) {
    return raw;
  }
  return raw.replace(/\n/g, "<br>");
}
