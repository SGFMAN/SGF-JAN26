/**
 * Johnston Tiles colour catalogue.
 *
 * Catalogues are DB-managed only (Colour Settings). This module must NOT insert
 * or restore samples on startup — renames/deletes must stick.
 */

const GROUP_KEY = "johnston-tiles";
const GROUP_DISPLAY_NAME = "Johnston Tiles";

/**
 * @deprecated No-op. Colour samples are never auto-seeded.
 */
async function ensureJohnstonTilesCatalogue(_pool) {
  return { skipped: true, reason: "no-auto-seed" };
}

module.exports = {
  GROUP_KEY,
  GROUP_DISPLAY_NAME,
  ensureJohnstonTilesCatalogue,
};
