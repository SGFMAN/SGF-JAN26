require("dotenv").config();
const { Pool } = require("pg");
const { ensurePolytecColourTables } = require("./polytecColours");
const { ensureYdlStoneCatalogue } = require("./ydlStoneColours");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await ensurePolytecColourTables(pool);
    const result = await ensureYdlStoneCatalogue(pool);
    console.log("ensureYdlStoneCatalogue:", result);
    const counts = await pool.query(
      `SELECT sg.name AS subgroup, COUNT(s.id)::int AS colours
       FROM colour_groups g
       JOIN colour_subgroups sg ON sg.group_id = g.id
       LEFT JOIN colour_samples s ON s.subgroup_id = sg.id
       WHERE g.key = 'ydl-stone'
       GROUP BY sg.name, sg.sort_order
       ORDER BY sg.sort_order`
    );
    console.table(counts.rows);
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
