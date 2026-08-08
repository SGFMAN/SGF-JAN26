/**
 * YDL Stone colour catalogue (Kitchen Benchtops — Stone).
 * Idempotent seed: creates the group / subgroups / samples if missing; never deletes.
 */

const GROUP_KEY = "ydl-stone";
const GROUP_DISPLAY_NAME = "YDL Stone";

/** Subgroup display order (lowest first). */
const SUBGROUP_ORDER = [
  "Special Edition",
  "Ultimate Range",
  "Premium Plus Range",
  "Premium Range",
  "Deluxe Range",
  "Builder Range",
];

/** Colour name → subgroup (order within each subgroup follows this list). */
const YDL_STONE_COLOURS = [
  { name: "Supernova", subgroup: "Special Edition" },
  { name: "Super Arabescato", subgroup: "Special Edition" },
  { name: "Eos Illumina", subgroup: "Special Edition" },
  { name: "Viola Imperiale", subgroup: "Special Edition" },
  { name: "Blanco D", subgroup: "Special Edition" },
  { name: "Royal Taj", subgroup: "Special Edition" },
  { name: "Mahal Ivory", subgroup: "Special Edition" },
  { name: "Luca Del Mare", subgroup: "Special Edition" },
  { name: "Linea Oceano", subgroup: "Ultimate Range" },
  { name: "Bella Oro", subgroup: "Ultimate Range" },
  { name: "Desert Gold", subgroup: "Ultimate Range" },
  { name: "Astoria", subgroup: "Ultimate Range" },
  { name: "Statuario Enzo", subgroup: "Ultimate Range" },
  { name: "Cumulus Cloud", subgroup: "Ultimate Range" },
  { name: "Venatino", subgroup: "Ultimate Range" },
  { name: "Ice Drift", subgroup: "Ultimate Range" },
  { name: "Golden Striato", subgroup: "Ultimate Range" },
  { name: "Blanco Verona", subgroup: "Ultimate Range" },
  { name: "Vene Rose", subgroup: "Ultimate Range" },
  { name: "Giusto", subgroup: "Premium Plus Range" },
  { name: "Calacatta Classico", subgroup: "Premium Plus Range" },
  { name: "Aurum White", subgroup: "Premium Plus Range" },
  { name: "Calacatta Combo", subgroup: "Premium Plus Range" },
  { name: "Summer Breeze", subgroup: "Premium Plus Range" },
  { name: "Nuvola Snow", subgroup: "Premium Plus Range" },
  { name: "Angel Falls", subgroup: "Premium Plus Range" },
  { name: "Acqua Mare", subgroup: "Premium Plus Range" },
  { name: "Shadow Grey", subgroup: "Premium Range" },
  { name: "Golden Mist", subgroup: "Premium Range" },
  { name: "Misty Dusk", subgroup: "Premium Range" },
  { name: "Cloudy Grey", subgroup: "Premium Range" },
  { name: "Kalala Bianco", subgroup: "Premium Range" },
  { name: "Rosemee", subgroup: "Deluxe Range" },
  { name: "Arctic White", subgroup: "Deluxe Range" },
  { name: "Sabia", subgroup: "Deluxe Range" },
  { name: "Smokey Grey", subgroup: "Deluxe Range" },
  { name: "Semento", subgroup: "Deluxe Range" },
  { name: "Fresco", subgroup: "Deluxe Range" },
  { name: "Mondo Sand", subgroup: "Builder Range" },
  { name: "Classic White", subgroup: "Builder Range" },
  { name: "Star Burst", subgroup: "Builder Range" },
  { name: "Silver Star White", subgroup: "Builder Range" },
  { name: "Jasmine", subgroup: "Builder Range" },
];

/**
 * Ensure YDL Stone group, subgroups, and colour samples exist.
 * Safe to call on every startup.
 */
async function ensureYdlStoneCatalogue(pool) {
  if (!pool) return { skipped: true };

  let groupRes = await pool.query(
    `SELECT id, key, name FROM colour_groups WHERE key = $1 LIMIT 1`,
    [GROUP_KEY]
  );
  let groupId;
  if (!groupRes.rows.length) {
    const maxOrder = await pool.query(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM colour_groups`
    );
    groupRes = await pool.query(
      `INSERT INTO colour_groups (key, name, sort_order, active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING id, key, name`,
      [GROUP_KEY, GROUP_DISPLAY_NAME, (Number(maxOrder.rows[0]?.m) || 0) + 10]
    );
    groupId = groupRes.rows[0].id;
    console.log(`[ydl-stone] Created colour group "${GROUP_DISPLAY_NAME}"`);
  } else {
    groupId = groupRes.rows[0].id;
    if (String(groupRes.rows[0].name || "").trim() !== GROUP_DISPLAY_NAME) {
      await pool.query(
        `UPDATE colour_groups SET name = $1, updated_at = NOW() WHERE id = $2`,
        [GROUP_DISPLAY_NAME, groupId]
      );
    }
  }

  const subgroupIdsByName = new Map();
  for (let i = 0; i < SUBGROUP_ORDER.length; i++) {
    const sgName = SUBGROUP_ORDER[i];
    const sortOrder = (i + 1) * 10;
    let sg = await pool.query(
      `SELECT id, name, sort_order FROM colour_subgroups
       WHERE group_id = $1 AND name = $2 LIMIT 1`,
      [groupId, sgName]
    );
    if (!sg.rows.length) {
      sg = await pool.query(
        `INSERT INTO colour_subgroups (group_id, name, sort_order)
         VALUES ($1, $2, $3)
         RETURNING id, name, sort_order`,
        [groupId, sgName, sortOrder]
      );
    } else if (Number(sg.rows[0].sort_order) !== sortOrder) {
      await pool.query(
        `UPDATE colour_subgroups SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
        [sortOrder, sg.rows[0].id]
      );
    }
    subgroupIdsByName.set(sgName, sg.rows[0].id);
  }

  let inserted = 0;
  for (let i = 0; i < YDL_STONE_COLOURS.length; i++) {
    const { name, subgroup } = YDL_STONE_COLOURS[i];
    const subgroupId = subgroupIdsByName.get(subgroup);
    if (!subgroupId) continue;
    const existing = await pool.query(
      `SELECT id FROM colour_samples
       WHERE subgroup_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))
       LIMIT 1`,
      [subgroupId, name]
    );
    if (existing.rows.length) continue;
    await pool.query(
      `INSERT INTO colour_samples (subgroup_id, name, sort_order)
       VALUES ($1, $2, $3)`,
      [subgroupId, name, (i + 1) * 10]
    );
    inserted += 1;
  }

  if (inserted > 0) {
    console.log(`[ydl-stone] Inserted ${inserted} colour sample(s)`);
  }
  return {
    groupId,
    inserted,
    total: YDL_STONE_COLOURS.length,
  };
}

module.exports = {
  GROUP_KEY,
  GROUP_DISPLAY_NAME,
  SUBGROUP_ORDER,
  YDL_STONE_COLOURS,
  ensureYdlStoneCatalogue,
};
