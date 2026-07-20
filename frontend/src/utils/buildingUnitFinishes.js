/**
 * Exterior finish colours + fixed material types for the 3D unit / AI render.
 * Colours come from the Colours page; materials are product defaults.
 */

import { COLORBOND_COLOURS } from "../constants/colorbondColours.js";

export const UNIT_FINISH_DEFAULT_COLOUR = "White";

/**
 * Approx COLORBOND® / paint swatches for the 3D viewer (and AI colour lock).
 * Keys are normalised (lowercase, no spaces/punctuation) for lookup.
 */
export const UNIT_FINISH_HEX_BY_KEY = Object.freeze({
  white: 0xffffff,
  monument: 0x323233,
  paperbark: 0xcabfa4,
  wallaby: 0x7f7c78,
  nightsky: 0x000000,
  manorred: 0x5e1d0e,
  classiccream: 0xe9dcb8,
  surfmist: 0xe4e2d5,
  shalegrey: 0xbdb8b2,
  woodlandgrey: 0x4b4c46,
  dune: 0xb1a897,
  ironstone: 0x3e4440,
  deepocean: 0x314a57,
  cottagegreen: 0x304c3c,
  paleeucalypt: 0x7c9073,
  basalt: 0x6d6c6e,
  jasper: 0x6d5b4d,
  terrain: 0x6a4f3b,
});

/** Display-name notes for prompts (optional; backend has the canonical list). */
export const UNIT_FINISH_DISPLAY_HEX = Object.freeze({
  White: "#FFFFFF",
  Monument: "#323233",
  Paperbark: "#CABFA4",
  Wallaby: "#7F7C78",
  "Night Sky": "#000000",
  "Manor Red": "#5E1D0E",
  "Classic Cream": "#E9DCB8",
});

/**
 * Fixed construction materials — painted finishes, not natural/stained timber.
 * Sent with AI render so the photoreal pass cannot invent stained wood, etc.
 */
export const UNIT_MATERIAL_META = Object.freeze({
  cladding:
    "Painted timber weatherboards — opaque exterior paint matching the cladding colour. NOT stained wood, NOT natural timber grain, NOT cedar.",
  baseboards:
    "Painted timber baseboards / subfloor bands — opaque exterior paint matching the baseboard colour. NOT stained wood, NOT varnished hardwood, NOT natural timber.",
  windowFrames:
    "Coated aluminium window frames with clear transparent glass. Metal frame (not timber), glass stays transparent.",
  windowSurrounds:
    "Painted surrounds matching the surround colour — opaque paint (not stained timber).",
  doors:
    "Painted solid-core door with glass panels — opaque paint matching the door colour on the leaf; glass panels stay transparent. NOT stained wood.",
  slidingDoors:
    "Painted solid-core sliding door leaf with glazing — opaque paint matching the door colour; glass stays transparent. NOT stained wood.",
});

export function normalizeUnitFinishColour(value) {
  if (value == null) return "";
  const s = String(value).trim();
  if (!s || /^select$/i.test(s)) return "";
  return s;
}

export function unitFinishColourOrDefault(value, fallback = UNIT_FINISH_DEFAULT_COLOUR) {
  return normalizeUnitFinishColour(value) || fallback;
}

function colourLookupKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Resolve a Colours-page name to a Three.js hex int (defaults to White). */
export function unitFinishHex(value, fallback = UNIT_FINISH_DEFAULT_COLOUR) {
  const name = unitFinishColourOrDefault(value, fallback);
  const key = colourLookupKey(name);
  if (Object.prototype.hasOwnProperty.call(UNIT_FINISH_HEX_BY_KEY, key)) {
    return UNIT_FINISH_HEX_BY_KEY[key];
  }
  const fbKey = colourLookupKey(fallback);
  return UNIT_FINISH_HEX_BY_KEY[fbKey] ?? UNIT_FINISH_HEX_BY_KEY.white;
}

/** Resolved part colours for the live Colours selection (White if unset). */
export function resolveUnitFinishColours(finishes = {}) {
  const f = finishes && typeof finishes === "object" ? finishes : {};
  return {
    cladding: unitFinishColourOrDefault(f.claddingColour ?? f.cladding_colour),
    baseboards: unitFinishColourOrDefault(f.baseboardsColour ?? f.baseboards_colour),
    windowFrames: unitFinishColourOrDefault(f.windowFramesColour ?? f.windowframes_colour ?? f.window_frames_colour),
    windowSurrounds: unitFinishColourOrDefault(
      f.windowSurroundsColour ?? f.windowsurrounds_colour ?? f.window_surrounds_colour
    ),
    frontDoor: unitFinishColourOrDefault(
      f.frontDoorColour ?? f.doorColour ?? f.door_colour ?? f.front_door_colour
    ),
    slidingDoor: unitFinishColourOrDefault(
      f.windowFramesColour ?? f.windowframes_colour ?? f.window_frames_colour
    ),
    fasciaGutter: unitFinishColourOrDefault(f.fasciaGutterColour ?? f.fascia_gutter_colour),
    balustrade: unitFinishColourOrDefault(f.balustradeColour ?? f.balustrade_colour),
    roof: unitFinishColourOrDefault(f.roofColour ?? f.roof_colour),
  };
}

/** Resolve a Colours-page name to a CSS hex string (e.g. "#5e1d0e"). */
export function unitFinishCssHex(value, fallback = UNIT_FINISH_DEFAULT_COLOUR) {
  const name = unitFinishColourOrDefault(value, fallback);
  const fromList = COLORBOND_COLOURS.find(
    (c) => colourLookupKey(c.name) === colourLookupKey(name)
  );
  if (fromList) {
    return (
      "#" +
      [fromList.r, fromList.g, fromList.b]
        .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
        .join("")
    );
  }
  const hexInt = unitFinishHex(name, fallback);
  return `#${hexInt.toString(16).padStart(6, "0")}`;
}

/** CSS hex colours for each exterior part from a finishes object. */
export function resolveUnitFinishCssHexes(finishes = {}) {
  const names = resolveUnitFinishColours(finishes);
  return {
    cladding: unitFinishCssHex(names.cladding),
    baseboards: unitFinishCssHex(names.baseboards),
    windowFrames: unitFinishCssHex(names.windowFrames),
    windowSurrounds: unitFinishCssHex(names.windowSurrounds),
    frontDoor: unitFinishCssHex(names.frontDoor),
    slidingDoor: unitFinishCssHex(names.slidingDoor),
    fasciaGutter: unitFinishCssHex(names.fasciaGutter),
    balustrade: unitFinishCssHex(names.balustrade),
    roof: unitFinishCssHex(names.roof),
  };
}

export function resolveUnitFinishHexes(finishes = {}) {
  const names = resolveUnitFinishColours(finishes);
  return {
    cladding: unitFinishHex(names.cladding),
    baseboards: unitFinishHex(names.baseboards),
    windowFrames: unitFinishHex(names.windowFrames),
    windowSurrounds: unitFinishHex(names.windowSurrounds),
    frontDoor: unitFinishHex(names.frontDoor),
    slidingDoor: unitFinishHex(names.slidingDoor),
    fasciaGutter: unitFinishHex(names.fasciaGutter),
    balustrade: unitFinishHex(names.balustrade),
    roof: unitFinishHex(names.roof),
  };
}
