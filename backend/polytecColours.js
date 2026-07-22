/**
 * Polytec - Doors & Panels colour catalogue (DB-backed).
 * Colorbond remains hardcoded in the frontend.
 */

const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const crypto = require("crypto");
const { getMeta, setMeta } = require("./schemaStartup");

const UPLOAD_DIR = path.join(__dirname, "data", "polytec-colours");
const GROUP_KEY = "polytec";
const GROUP_DISPLAY_NAME = "Polytec - Doors & Panels";
/** Bump to wipe and reseed the Polytec catalogue once on startup. */
const POLYTEC_SEED_VERSION = "2026-07-23-v1";
const POLYTEC_SEED_META_KEY = "polytec_seed_version";

/** Preferred display order for subgroups. */
const SUBGROUP_ORDER = ["Ashgrain", "Matt", "Sheen", "Smooth", "Texture", "Woodmatt"];

/**
 * Full catalogue: sample display name + finish subgroup.
 * Names include the finish suffix (e.g. "Adriatic - Smooth").
 */
const POLYTEC_SAMPLES = [
  { name: "Adriatic - Smooth", subgroup: "Smooth" },
  { name: "Agave - Smooth", subgroup: "Smooth" },
  { name: "Alabaster - Matt", subgroup: "Matt" },
  { name: "Alabaster - Sheen", subgroup: "Sheen" },
  { name: "Amaro - Matt", subgroup: "Matt" },
  { name: "Amaro - Sheen", subgroup: "Sheen" },
  { name: "Antico Oak - Woodmatt", subgroup: "Woodmatt" },
  { name: "Antique - Matt", subgroup: "Matt" },
  { name: "Arabica - Smooth", subgroup: "Smooth" },
  { name: "Arcadia Oak - Woodmatt", subgroup: "Woodmatt" },
  { name: "Artisan Oak - Matt", subgroup: "Matt" },
  { name: "Aston White - Smooth", subgroup: "Smooth" },
  { name: "Australian Native - Woodmatt", subgroup: "Woodmatt" },
  { name: "Avion Grey - Matt", subgroup: "Matt" },
  { name: "Belgian Oak - Matt", subgroup: "Matt" },
  { name: "Bespoke - Woodmatt", subgroup: "Woodmatt" },
  { name: "Black - Matt", subgroup: "Matt" },
  { name: "Black - Woodmatt", subgroup: "Woodmatt" },
  { name: "Black Ply - Woodmatt", subgroup: "Woodmatt" },
  { name: "Black Wenge - Matt", subgroup: "Matt" },
  { name: "Blossom White - Matt", subgroup: "Matt" },
  { name: "Blossom White - Sheen", subgroup: "Sheen" },
  { name: "Blossom White - Woodmatt", subgroup: "Woodmatt" },
  { name: "Botanic - Smooth", subgroup: "Smooth" },
  { name: "Bottega Oak - Woodmatt", subgroup: "Woodmatt" },
  { name: "Canterbury Grey - Matt", subgroup: "Matt" },
  { name: "Casentino Beech - Woodmatt", subgroup: "Woodmatt" },
  { name: "Cavia Lini - Matt", subgroup: "Matt" },
  { name: "Cavia Lini - Sheen", subgroup: "Sheen" },
  { name: "Char Oak - Matt", subgroup: "Matt" },
  { name: "Cinder - Matt", subgroup: "Matt" },
  { name: "Cinder - Woodmatt", subgroup: "Woodmatt" },
  { name: "Classic White - Ashgrain", subgroup: "Ashgrain" },
  { name: "Classic White - Matt", subgroup: "Matt" },
  { name: "Classic White - Sheen", subgroup: "Sheen" },
  { name: "Classic White - Texture", subgroup: "Texture" },
  { name: "Coastal Oak - Woodmatt", subgroup: "Woodmatt" },
  { name: "Copper Leaf - Matt", subgroup: "Matt" },
  { name: "Designer White - Texture", subgroup: "Texture" },
  { name: "Elemental Grey - Smooth", subgroup: "Smooth" },
  { name: "Empire Oak - Matt", subgroup: "Matt" },
  { name: "Estella Oak - Woodmatt", subgroup: "Woodmatt" },
  { name: "Feldspar Shimmer - Matt", subgroup: "Matt" },
  { name: "Ferro - Matt", subgroup: "Matt" },
  { name: "Florentine Walnut - Woodmatt", subgroup: "Woodmatt" },
  { name: "Forage - Smooth", subgroup: "Smooth" },
  { name: "Gesso Lini - Matt", subgroup: "Matt" },
  { name: "Gossamer White - Smooth", subgroup: "Smooth" },
  { name: "Graphite - Matt", subgroup: "Matt" },
  { name: "Greige - Matt", subgroup: "Matt" },
  { name: "Habitat - Smooth", subgroup: "Smooth" },
  { name: "Havana Oak - Woodmatt", subgroup: "Woodmatt" },
  { name: "Husk - Matt", subgroup: "Matt" },
  { name: "Jamaican Walnut - Matt", subgroup: "Matt" },
  { name: "Light Brass Leaf - Matt", subgroup: "Matt" },
  { name: "Ligurian Walnut - Woodmatt", subgroup: "Woodmatt" },
  { name: "Maison Oak - Matt", subgroup: "Matt" },
  { name: "Malt - Matt", subgroup: "Matt" },
  { name: "Marina Grey - Matt", subgroup: "Matt" },
  { name: "Marni Lini - Matt", subgroup: "Matt" },
  { name: "Mercurio Grey - Smooth", subgroup: "Smooth" },
  { name: "Moss Grey - Matt", subgroup: "Matt" },
  { name: "Moss Grey - Sheen", subgroup: "Sheen" },
  { name: "Natural Oak - Matt", subgroup: "Matt" },
  { name: "Natural Ply - Woodmatt", subgroup: "Woodmatt" },
  { name: "New Antique White - Matt", subgroup: "Matt" },
  { name: "Nordic Oak - Woodmatt", subgroup: "Woodmatt" },
  { name: "Notaio Walnut - Matt", subgroup: "Matt" },
  { name: "Nouveau Grey - Matt", subgroup: "Matt" },
  { name: "Oasis - Smooth", subgroup: "Smooth" },
  { name: "Ochre Figrd Wood - Smooth", subgroup: "Smooth" },
  { name: "Onyx Figrd Wood - Smooth", subgroup: "Smooth" },
  { name: "Oxford - Matt", subgroup: "Matt" },
  { name: "Oyster Grey - Matt", subgroup: "Matt" },
  { name: "Pallido - Smooth", subgroup: "Smooth" },
  { name: "Palomera Oak - Woodmatt", subgroup: "Woodmatt" },
  { name: "Parchment - Matt", subgroup: "Matt" },
  { name: "Perugian Walnut - Woodmatt", subgroup: "Woodmatt" },
  { name: "Platinum Leaf - Matt", subgroup: "Matt" },
  { name: "Polar White - Matt", subgroup: "Matt" },
  { name: "Porcelain - Matt", subgroup: "Matt" },
  { name: "Porcelain - Sheen", subgroup: "Sheen" },
  { name: "Prime Oak - Woodmatt", subgroup: "Woodmatt" },
  { name: "Pure Gold Leaf - Matt", subgroup: "Matt" },
  { name: "Quartiera Maple - Woodmatt", subgroup: "Woodmatt" },
  { name: "Rocco Lini - Matt", subgroup: "Matt" },
  { name: "Rojo Walnut - Woodmatt", subgroup: "Woodmatt" },
  { name: "Serene - Woodmatt", subgroup: "Woodmatt" },
  { name: "Shannon Oak - Matt", subgroup: "Matt" },
  { name: "Sienna Figrd Wood - Smooth", subgroup: "Smooth" },
  { name: "Silk - Matt", subgroup: "Matt" },
  { name: "Silk - Woodmatt", subgroup: "Woodmatt" },
  { name: "Soft Walnut - Matt", subgroup: "Matt" },
  { name: "Stone Grey - Matt", subgroup: "Matt" },
  { name: "Stone Grey - Sheen", subgroup: "Sheen" },
  { name: "Strata Grey - Matt", subgroup: "Matt" },
  { name: "Strata Grey - Sheen", subgroup: "Sheen" },
  { name: "Taupe - Matt", subgroup: "Matt" },
  { name: "Tessuto Milan - Matt", subgroup: "Matt" },
  { name: "Titanium - Matt", subgroup: "Matt" },
  { name: "Truffle Lini - Matt", subgroup: "Matt" },
  { name: "Tuross Oak - Matt", subgroup: "Matt" },
  { name: "White Cotton - Matt", subgroup: "Matt" },
  { name: "White Mist - Matt", subgroup: "Matt" },
  { name: "Whitewood - Matt", subgroup: "Matt" },
];

/** @deprecated — kept for export compatibility; derived from POLYTEC_SAMPLES. */
const POLYTEC_SEED = POLYTEC_SAMPLES.reduce((acc, row) => {
  if (!acc[row.subgroup]) acc[row.subgroup] = [];
  acc[row.subgroup].push(row.name);
  return acc;
}, {});

function ensureUploadDir() {
  if (!fsSync.existsSync(UPLOAD_DIR)) {
    fsSync.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function imageUrlForSample(sampleId, hasImage) {
  if (!hasImage) return null;
  return `/api/colour-samples/${sampleId}/image`;
}

function mapSampleRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    subgroup_id: row.subgroup_id,
    subgroup: row.subgroup_name || null,
    sort_order: row.sort_order,
    image_filename: row.image_filename || null,
    image_url: imageUrlForSample(row.id, !!row.image_filename),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function subgroupSortKey(name) {
  const idx = SUBGROUP_ORDER.indexOf(name);
  return idx === -1 ? 1000 + String(name || "").localeCompare("") : idx;
}

async function ensurePolytecColourTables(pool) {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS colour_groups (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS colour_subgroups (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES colour_groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (group_id, name)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS colour_samples (
      id SERIAL PRIMARY KEY,
      subgroup_id INTEGER NOT NULL REFERENCES colour_subgroups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      image_filename TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS colour_samples_subgroup_id_idx ON colour_samples (subgroup_id);
  `);
  ensureUploadDir();
  await seedPolytecColours(pool);
}

async function wipePolytecCatalogue(pool, groupId) {
  const images = await pool.query(
    `SELECT s.image_filename
     FROM colour_samples s
     JOIN colour_subgroups sg ON sg.id = s.subgroup_id
     WHERE sg.group_id = $1 AND s.image_filename IS NOT NULL`,
    [groupId]
  );
  for (const row of images.rows) {
    await deleteImageFile(row.image_filename);
  }
  await pool.query(
    `DELETE FROM colour_samples
     WHERE subgroup_id IN (SELECT id FROM colour_subgroups WHERE group_id = $1)`,
    [groupId]
  );
  await pool.query(`DELETE FROM colour_subgroups WHERE group_id = $1`, [groupId]);
}

async function seedPolytecColours(pool) {
  if (!pool) return;
  const groupRes = await pool.query(
    `INSERT INTO colour_groups (key, name, sort_order, active)
     VALUES ($1, $2, 10, TRUE)
     ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
    [GROUP_KEY, GROUP_DISPLAY_NAME]
  );
  const groupId = groupRes.rows[0].id;

  const currentVersion = await getMeta(pool, POLYTEC_SEED_META_KEY);
  if (currentVersion !== POLYTEC_SEED_VERSION) {
    console.log(
      `Reseeding Polytec colours (${currentVersion || "none"} → ${POLYTEC_SEED_VERSION})…`
    );
    await wipePolytecCatalogue(pool, groupId);
  }

  const subgroupIds = new Map();
  for (let i = 0; i < SUBGROUP_ORDER.length; i++) {
    const subgroupName = SUBGROUP_ORDER[i];
    const sgRes = await pool.query(
      `INSERT INTO colour_subgroups (group_id, name, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, name) DO UPDATE SET sort_order = EXCLUDED.sort_order, updated_at = NOW()
       RETURNING id`,
      [groupId, subgroupName, i * 10]
    );
    subgroupIds.set(subgroupName, sgRes.rows[0].id);
  }

  // Any extra subgroups from the sample list not in SUBGROUP_ORDER
  for (const row of POLYTEC_SAMPLES) {
    if (subgroupIds.has(row.subgroup)) continue;
    const sgRes = await pool.query(
      `INSERT INTO colour_subgroups (group_id, name, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, name) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [groupId, row.subgroup, 500 + subgroupIds.size]
    );
    subgroupIds.set(row.subgroup, sgRes.rows[0].id);
  }

  const existing = await pool.query(
    `SELECT s.name, s.subgroup_id
     FROM colour_samples s
     JOIN colour_subgroups sg ON sg.id = s.subgroup_id
     WHERE sg.group_id = $1`,
    [groupId]
  );
  const existingKeys = new Set(existing.rows.map((r) => `${r.subgroup_id}::${r.name}`));

  let sampleOrder = 0;
  for (const row of POLYTEC_SAMPLES) {
    const subgroupId = subgroupIds.get(row.subgroup);
    if (!subgroupId) continue;
    const key = `${subgroupId}::${row.name}`;
    if (!existingKeys.has(key)) {
      await pool.query(
        `INSERT INTO colour_samples (subgroup_id, name, sort_order)
         VALUES ($1, $2, $3)`,
        [subgroupId, row.name, sampleOrder]
      );
      existingKeys.add(key);
    }
    sampleOrder += 10;
  }

  await setMeta(pool, POLYTEC_SEED_META_KEY, POLYTEC_SEED_VERSION);
}

async function listPolytecCatalogue(pool) {
  const groupRes = await pool.query(
    `SELECT id, key, name, sort_order FROM colour_groups WHERE key = $1 AND active = TRUE LIMIT 1`,
    [GROUP_KEY]
  );
  if (!groupRes.rows.length) {
    return { key: GROUP_KEY, name: GROUP_DISPLAY_NAME, subgroups: [], samples: [] };
  }
  const group = groupRes.rows[0];
  const subgroupsRes = await pool.query(
    `SELECT id, name, sort_order
     FROM colour_subgroups
     WHERE group_id = $1
     ORDER BY sort_order ASC, name ASC, id ASC`,
    [group.id]
  );
  const samplesRes = await pool.query(
    `SELECT s.id, s.subgroup_id, s.name, s.image_filename, s.sort_order, s.created_at, s.updated_at,
            sg.name AS subgroup_name
     FROM colour_samples s
     JOIN colour_subgroups sg ON sg.id = s.subgroup_id
     WHERE sg.group_id = $1
     ORDER BY LOWER(s.name) ASC, s.name ASC, s.id ASC`,
    [group.id]
  );

  const samples = samplesRes.rows.map(mapSampleRow);
  const samplesBySubgroup = new Map();
  for (const sample of samples) {
    if (!samplesBySubgroup.has(sample.subgroup_id)) samplesBySubgroup.set(sample.subgroup_id, []);
    samplesBySubgroup.get(sample.subgroup_id).push(sample);
  }

  const subgroups = subgroupsRes.rows
    .map((sg) => ({
      id: sg.id,
      name: sg.name,
      sort_order: sg.sort_order,
      samples: samplesBySubgroup.get(sg.id) || [],
    }))
    .sort((a, b) => subgroupSortKey(a.name) - subgroupSortKey(b.name) || a.name.localeCompare(b.name));

  return {
    id: group.id,
    key: group.key,
    name: group.name,
    subgroups,
    samples,
  };
}

async function getSampleById(pool, id) {
  const r = await pool.query(
    `SELECT s.*, sg.name AS subgroup_name, sg.group_id
     FROM colour_samples s
     JOIN colour_subgroups sg ON sg.id = s.subgroup_id
     WHERE s.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

function extensionForUpload(file) {
  const original = String(file?.originalname || "");
  const ext = path.extname(original).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"].includes(ext)) return ext;
  const mime = String(file?.mimetype || "").toLowerCase();
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  return ".jpg";
}

async function saveSampleImageFile(sampleId, file) {
  ensureUploadDir();
  const ext = extensionForUpload(file);
  const filename = `sample-${sampleId}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  await fs.writeFile(fullPath, file.buffer);
  return filename;
}

async function deleteImageFile(filename) {
  if (!filename) return;
  const fullPath = path.join(UPLOAD_DIR, filename);
  try {
    await fs.unlink(fullPath);
  } catch (e) {
    if (e && e.code !== "ENOENT") {
      console.log(`deleteImageFile (${filename}):`, e.message);
    }
  }
}

async function updateSample(pool, id, { name, subgroupId, file }) {
  const existing = await getSampleById(pool, id);
  if (!existing) return { notFound: true };

  let nextName = existing.name;
  if (name != null && String(name).trim()) {
    nextName = String(name).trim();
  }

  let nextSubgroupId = existing.subgroup_id;
  if (subgroupId != null && Number.isFinite(Number(subgroupId))) {
    const sg = await pool.query(`SELECT id FROM colour_subgroups WHERE id = $1`, [Number(subgroupId)]);
    if (!sg.rows.length) return { error: "Subgroup not found", status: 400 };
    nextSubgroupId = Number(subgroupId);
  }

  let nextFilename = existing.image_filename;
  if (file && file.buffer) {
    const saved = await saveSampleImageFile(id, file);
    if (existing.image_filename) await deleteImageFile(existing.image_filename);
    nextFilename = saved;
  }

  const r = await pool.query(
    `UPDATE colour_samples
     SET name = $1, subgroup_id = $2, image_filename = $3, updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [nextName, nextSubgroupId, nextFilename, id]
  );
  const mapped = await getSampleById(pool, r.rows[0].id);
  return { sample: mapSampleRow(mapped) };
}

async function getSampleImagePath(pool, id) {
  const row = await getSampleById(pool, id);
  if (!row) return { notFound: true };
  if (!row.image_filename) return { noImage: true };
  const fullPath = path.join(UPLOAD_DIR, row.image_filename);
  if (!fsSync.existsSync(fullPath)) return { noImage: true };
  return { path: fullPath, filename: row.image_filename };
}

module.exports = {
  GROUP_KEY,
  GROUP_DISPLAY_NAME,
  POLYTEC_SEED,
  POLYTEC_SAMPLES,
  POLYTEC_SEED_VERSION,
  UPLOAD_DIR,
  ensurePolytecColourTables,
  listPolytecCatalogue,
  getSampleById,
  updateSample,
  getSampleImagePath,
  mapSampleRow,
};
