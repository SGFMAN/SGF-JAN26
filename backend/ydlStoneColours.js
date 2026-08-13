/**
 * YDL Stone colour catalogue.
 *
 * Catalogues are DB-managed only (Colour Settings). This module must NOT insert
 * or restore samples on startup — renames/deletes must stick.
 */

const GROUP_KEY = "ydl-stone";
const GROUP_DISPLAY_NAME = "YDL Stone";

/**
 * @deprecated No-op. Colour samples are never auto-seeded.
 */
async function ensureYdlStoneCatalogue(_pool) {
  return { skipped: true, reason: "no-auto-seed" };
}

module.exports = {
  GROUP_KEY,
  GROUP_DISPLAY_NAME,
  ensureYdlStoneCatalogue,
};
