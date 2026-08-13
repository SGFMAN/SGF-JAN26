/**
 * Godfrey Hirst — Apollo Hybrid flooring colour catalogue.
 *
 * Catalogues are DB-managed only (Colour Settings). This module must NOT insert
 * or restore samples on startup — renames/deletes must stick.
 */

const GROUP_KEY = "godfrey-hirst-metropol-1200";
const GROUP_DISPLAY_NAME = "Godfrey Hirst - Apollo Hybrid";

/**
 * @deprecated No-op. Colour samples are never auto-seeded.
 */
async function ensureGodfreyHirstApolloHybridCatalogue(_pool) {
  return { skipped: true, reason: "no-auto-seed" };
}

module.exports = {
  GROUP_KEY,
  GROUP_DISPLAY_NAME,
  ensureGodfreyHirstApolloHybridCatalogue,
};
