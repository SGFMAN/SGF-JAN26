/**
 * Sunstar — Super 95 hybrid flooring colour catalogue.
 *
 * Catalogues are DB-managed only (Colour Settings). This module must NOT insert
 * or restore samples on startup — renames/deletes must stick.
 */

const GROUP_KEY = "sunstar-super-95";
const GROUP_DISPLAY_NAME = "Sunstar - Super 95";

/**
 * @deprecated No-op. Colour samples are never auto-seeded.
 */
async function ensureSunstarSuper95Catalogue(_pool) {
  return { skipped: true, reason: "no-auto-seed" };
}

module.exports = {
  GROUP_KEY,
  GROUP_DISPLAY_NAME,
  ensureSunstarSuper95Catalogue,
};
