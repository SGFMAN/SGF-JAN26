/**
 * Godfrey Hirst — Apollo Hybrid flooring colour catalogue.
 * Idempotent seed: uses the existing group (key godfrey-hirst-metropol-1200);
 * creates subgroup / samples if missing; never deletes.
 */

const GROUP_KEY = "godfrey-hirst-metropol-1200";
const GROUP_DISPLAY_NAME = "Godfrey Hirst - Apollo Hybrid";

/** Subgroup display order (lowest first). */
const SUBGROUP_ORDER = ["Apollo Hybrid"];

/** Colour name → subgroup (order within subgroup follows this list). */
const GODFREY_HIRST_APOLLO_HYBRID_COLOURS = [
  { name: "120 Shield", subgroup: "Apollo Hybrid" },
  { name: "180 Python", subgroup: "Apollo Hybrid" },
  { name: "320 Sunlight", subgroup: "Apollo Hybrid" },
  { name: "510 Enlighten", subgroup: "Apollo Hybrid" },
  { name: "515 Bronze", subgroup: "Apollo Hybrid" },
  { name: "530 Wreath", subgroup: "Apollo Hybrid" },
  { name: "545 New England Blackbutt", subgroup: "Apollo Hybrid" },
  { name: "555 Grafton Spotted Gum", subgroup: "Apollo Hybrid" },
  { name: "570 Western Blackbutt", subgroup: "Apollo Hybrid" },
  { name: "625 Tallowwood", subgroup: "Apollo Hybrid" },
  { name: "710 Oracle", subgroup: "Apollo Hybrid" },
  { name: "730 Dolphin", subgroup: "Apollo Hybrid" },
];

/**
 * Ensure Godfrey Hirst Apollo Hybrid group, subgroup, and colour samples exist.
 * Safe to call on every startup.
 */
async function ensureGodfreyHirstApolloHybridCatalogue(pool) {
  if (!pool) return { skipped: true };

  let groupRes = await pool.query(
    `SELECT id, key, name FROM colour_groups WHERE key = $1 LIMIT 1`,
    [GROUP_KEY]
  );
  if (!groupRes.rows.length) {
    groupRes = await pool.query(
      `SELECT id, key, name FROM colour_groups
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
       LIMIT 1`,
      [GROUP_DISPLAY_NAME]
    );
  }

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
    console.log(`[godfrey-hirst-apollo-hybrid] Created colour group "${GROUP_DISPLAY_NAME}"`);
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
  for (let i = 0; i < GODFREY_HIRST_APOLLO_HYBRID_COLOURS.length; i++) {
    const { name, subgroup } = GODFREY_HIRST_APOLLO_HYBRID_COLOURS[i];
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
    console.log(`[godfrey-hirst-apollo-hybrid] Inserted ${inserted} colour sample(s)`);
  }
  return {
    groupId,
    inserted,
    total: GODFREY_HIRST_APOLLO_HYBRID_COLOURS.length,
  };
}

module.exports = {
  GROUP_KEY,
  GROUP_DISPLAY_NAME,
  SUBGROUP_ORDER,
  GODFREY_HIRST_APOLLO_HYBRID_COLOURS,
  ensureGodfreyHirstApolloHybridCatalogue,
};
