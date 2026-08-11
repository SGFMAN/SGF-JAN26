/**
 * Sunstar — Super 95 hybrid flooring colour catalogue.
 * Idempotent seed: creates the group / subgroup / samples if missing; never deletes.
 */

const GROUP_KEY = "sunstar-super-95";
const GROUP_DISPLAY_NAME = "Sunstar - Super 95";

/** Subgroup display order (lowest first). */
const SUBGROUP_ORDER = ["Super 95"];

/** Colour name → subgroup (order within subgroup follows this list). */
const SUNSTAR_SUPER_95_COLOURS = [
  { name: "Rustic Spotted Gum 911", subgroup: "Super 95" },
  { name: "Coastal Spotted Gum 912", subgroup: "Super 95" },
  { name: "Rustic Blackbutt 913", subgroup: "Super 95" },
  { name: "Torquay 915", subgroup: "Super 95" },
  { name: "Fairhaven 916", subgroup: "Super 95" },
  { name: "Kennet 917", subgroup: "Super 95" },
  { name: "Parker Hill 918", subgroup: "Super 95" },
  { name: "Burnie 921", subgroup: "Super 95" },
  { name: "Elliston 922", subgroup: "Super 95" },
  { name: "Stanley 923", subgroup: "Super 95" },
];

/**
 * Ensure Sunstar Super 95 group, subgroup, and colour samples exist.
 * Safe to call on every startup.
 */
async function ensureSunstarSuper95Catalogue(pool) {
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
    console.log(`[sunstar-super-95] Created colour group "${GROUP_DISPLAY_NAME}"`);
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
  for (let i = 0; i < SUNSTAR_SUPER_95_COLOURS.length; i++) {
    const { name, subgroup } = SUNSTAR_SUPER_95_COLOURS[i];
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
    console.log(`[sunstar-super-95] Inserted ${inserted} colour sample(s)`);
  }
  return {
    groupId,
    inserted,
    total: SUNSTAR_SUPER_95_COLOURS.length,
  };
}

module.exports = {
  GROUP_KEY,
  GROUP_DISPLAY_NAME,
  SUBGROUP_ORDER,
  SUNSTAR_SUPER_95_COLOURS,
  ensureSunstarSuper95Catalogue,
};
