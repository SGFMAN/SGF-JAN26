/**
 * Exterior finish colours + fixed material types for the 3D unit / AI render.
 * Colours come from the Colours page; materials are product defaults.
 */

export const UNIT_FINISH_DEFAULT_COLOUR = "White";

/** Approx COLORBOND® / paint swatches for the 3D viewer (and AI colour lock). */
export const UNIT_FINISH_HEX = Object.freeze({
  White: 0xffffff,
  Monument: 0x323233,
  Paperbark: 0xcabfa4,
  Wallaby: 0x7f7c78,
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

/** Resolve a Colours-page name to a Three.js hex int (defaults to White). */
export function unitFinishHex(value, fallback = UNIT_FINISH_DEFAULT_COLOUR) {
  const name = unitFinishColourOrDefault(value, fallback);
  if (Object.prototype.hasOwnProperty.call(UNIT_FINISH_HEX, name)) {
    return UNIT_FINISH_HEX[name];
  }
  return UNIT_FINISH_HEX[fallback] ?? UNIT_FINISH_HEX.White;
}

/** Resolved part colours for the live Colours selection (White if unset). */
export function resolveUnitFinishColours(finishes = {}) {
  const f = finishes && typeof finishes === "object" ? finishes : {};
  return {
    cladding: unitFinishColourOrDefault(f.claddingColour ?? f.cladding_colour),
    baseboards: unitFinishColourOrDefault(f.baseboardsColour ?? f.baseboards_colour),
    windowFrames: unitFinishColourOrDefault(f.windowFramesColour ?? f.window_frames_colour),
    windowSurrounds: unitFinishColourOrDefault(
      f.windowSurroundsColour ?? f.window_surrounds_colour
    ),
    frontDoor: unitFinishColourOrDefault(f.frontDoorColour ?? f.front_door_colour),
    fasciaGutter: unitFinishColourOrDefault(f.fasciaGutterColour ?? f.fascia_gutter_colour),
    balustrade: unitFinishColourOrDefault(f.balustradeColour ?? f.balustrade_colour),
    roof: unitFinishColourOrDefault(f.roofColour ?? f.roof_colour),
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
    fasciaGutter: unitFinishHex(names.fasciaGutter),
    balustrade: unitFinishHex(names.balustrade),
    roof: unitFinishHex(names.roof),
  };
}
