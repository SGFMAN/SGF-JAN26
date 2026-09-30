function contactIsActive(flag) {
  if (flag === true) return true;
  const s = String(flag ?? "").trim().toLowerCase();
  return s === "true" || s === "t" || s === "1";
}

/** Active contact emails or phones, then contact 1, then the project email/phone field. */
export function clientContactTokenValue(project, kind) {
  if (!project) return "";
  const legacyKey = kind === "email" ? "email" : "phone";
  const activeValues = [];
  let anyActive = false;
  for (const n of [1, 2, 3]) {
    const active = contactIsActive(project[`client${n}_active`]);
    if (active) anyActive = true;
    const value = String(project[`client${n}_${kind}`] || "").trim();
    if (active && value) activeValues.push(value);
  }
  if (activeValues.length) return activeValues.join(", ");
  if (!anyActive) {
    const first = String(project[`client1_${kind}`] || "").trim();
    if (first) return first;
  }
  return String(project[legacyKey] || "").trim();
}

export function replaceClientContactTokens(text, project) {
  if (!text) return text || "";
  return String(text)
    .replace(/\{ClientEmail\}/g, clientContactTokenValue(project, "email"))
    .replace(/\{ClientPhone\}/g, clientContactTokenValue(project, "phone"));
}
