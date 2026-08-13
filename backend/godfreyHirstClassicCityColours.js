/**
 * Godfrey Hirst — Classic City carpet colour catalogue.
 *
 * Catalogues are DB-managed only (Colour Settings). This module must NOT insert
 * or restore samples on startup — renames/deletes must stick.
 */

const GROUP_KEY = "godfrey-hirst-classic-city";
const GROUP_DISPLAY_NAME = "Godfrey Hirst - Classic City";

/**
 * @deprecated No-op. Colour samples are never auto-seeded.
 */
async function ensureGodfreyHirstClassicCityCatalogue(_pool) {
  return { skipped: true, reason: "no-auto-seed" };
}

module.exports = {
  GROUP_KEY,
  GROUP_DISPLAY_NAME,
  ensureGodfreyHirstClassicCityCatalogue,
};
