/**
 * Parse a pasted Australian address into street / suburb / state (VIC|QLD).
 * Same rules as New Project / Hotlist address paste.
 */

const STATE_OPTIONS = ["VIC", "QLD"];

export function deriveStateFromText(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const upper = s.toUpperCase();
  const abbr = upper.match(/\b(VIC|QLD)\b/);
  if (abbr) return abbr[1];
  if (/\bVICTORIA\b/.test(upper)) return "VIC";
  if (/\bQUEENSLAND\b/.test(upper)) return "QLD";
  return "";
}

export function parseAustralianAddress(value) {
  let street = "";
  let suburb = "";
  let state = "";
  const raw = String(value ?? "");

  if (raw.includes(",")) {
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part);
    if (parts.length > 0) street = parts[0].replace(/[/\\]/g, "_");
    if (parts.length > 1) suburb = parts[1].replace(/[/\\]/g, "_");
    if (parts.length > 2) {
      for (let i = 2; i < parts.length; i += 1) {
        const derived = deriveStateFromText(parts[i]);
        if (derived) {
          state = derived;
          break;
        }
      }
    }
    if (!state) state = deriveStateFromText(raw);
  } else {
    const parts = raw.trim().split(/\s+/);
    if (parts.length >= 2) {
      let stateIndex = -1;
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const derived = deriveStateFromText(parts[i]);
        if (derived) {
          stateIndex = i;
          state = derived;
          break;
        }
      }
      if (stateIndex > 0) {
        suburb = parts.slice(stateIndex - 1, stateIndex).join(" ").replace(/[/\\]/g, "_");
        street = parts.slice(0, stateIndex - 1).join(" ").replace(/[/\\]/g, "_");
      } else {
        suburb = parts.slice(-1)[0].replace(/[/\\]/g, "_");
        street = parts.slice(0, -1).join(" ").replace(/[/\\]/g, "_");
        state = deriveStateFromText(raw);
      }
    } else {
      street = raw.replace(/[/\\]/g, "_");
      state = deriveStateFromText(raw);
    }
  }

  return { street, suburb, state };
}

export { STATE_OPTIONS };
