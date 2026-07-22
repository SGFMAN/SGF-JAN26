/**
 * Polytec - Doors & Panels colour catalogue (DB-backed).
 * Colorbond remains hardcoded in the frontend.
 */

const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const crypto = require("crypto");

const UPLOAD_DIR = path.join(__dirname, "data", "polytec-colours");
const GROUP_KEY = "polytec";
const GROUP_DISPLAY_NAME = "Polytec - Doors & Panels";

/** Seed data matching the previous hardcoded ColourSettings list. */
const POLYTEC_SEED = {
  "Woodmatt timberprint & solid": [
    "Nordic Oak",
    "Tasmanian Oak",
    "Palace Teak",
    "Angora Oak",
    "Blossom White",
    "Perugian Walnut",
    "Bottega Oak",
    "Rojo Walnut",
    "Arcadia Oak",
    "Boston Oak",
    "Ligurian Walnut",
    "Quartiera Maple",
    "Plantation Ash",
    "Palomera Oak",
    "Black Ply",
    "Natural Ply",
    "Black",
    "Coastal Oak",
    "Notaio Walnut",
    "Casentino Beech",
    "Silk Bespoke",
    "Estella Oak",
    "Prime Oak",
    "Serene",
    "Cinder",
    "Florentine Walnut",
    "Antico Oak",
    "Australian Native",
    "Empire Oak",
    "Havana Oak",
  ],
  "Smooth timberprint & solid": [
    "Verdelho",
    "Botanic",
    "Topiary",
    "Aston White",
    "Habitat",
    "Onyx Figured-Wood",
    "Ochre Figured-Wood",
    "Agave",
    "Oasis",
    "Gossamer White",
    "Pallido",
    "Mercurio Grey",
    "Sienna Figured-Wood",
    "Adriatic",
    "Elemental Grey",
    "Arabica",
    "Forage",
  ],
  "Timberprint & solid": [
    "New Antique White",
    "Polar White",
    "Parchment",
    "Porcelain",
    "Moss Grey",
    "Alabaster",
    "Husk",
    "Designer White",
    "Avion Grey",
    "Greige",
    "Café Cream",
    "White Cotton",
    "Antique",
    "Classic White",
    "Marni Lini",
    "Blossom White",
    "Amaro",
    "Whitewood",
    "White Mist",
    "Gesso Lini",
    "Maison Oak",
    "Soft Walnut",
    "Crema Lini",
    "Malt",
    "Natural Oak",
    "Tuross Oak",
    "Marina Grey",
    "Jamaican Walnut",
    "European Walnut",
    "Combat Teak",
    "Tessuto Milan",
    "Taupe",
    "Stone Grey",
    "Rocco Lini",
    "Tasmanian Oak",
    "Notaio Walnut",
    "Prime Oak",
    "Strata Grey",
    "Artisan Oak",
    "Cinder",
    "Ferro",
    "Char Oak",
    "Truffle Lini",
    "Belgian Oak",
    "Shannon Oak",
    "Black Silk",
    "Graphite",
    "Wenge",
  ],
  "Timberprint, solid & abstract": [
    "Empire Titanium Oak",
    "Black",
    "Feldspar Shimmer",
    "Cavia Lini",
    "Aluminium",
    "Nickel",
    "Oxford",
    "Nouveau Grey",
    "Oyster Grey",
    "Canterbury Grey",
  ],
  "Metallic Leaf": [
    "Light Brass Leaf",
    "Rose Gold Leaf",
    "Pure Gold Leaf",
    "Copper Leaf",
    "Bronze Gold Leaf",
    "Platinum Leaf",
  ],
};

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

  let subgroupOrder = 0;
  for (const [subgroupName, sampleNames] of Object.entries(POLYTEC_SEED)) {
    const sgRes = await pool.query(
      `INSERT INTO colour_subgroups (group_id, name, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (group_id, name) DO UPDATE SET sort_order = EXCLUDED.sort_order, updated_at = NOW()
       RETURNING id`,
      [groupId, subgroupName, subgroupOrder]
    );
    const subgroupId = sgRes.rows[0].id;
    subgroupOrder += 10;

    const existing = await pool.query(
      `SELECT name FROM colour_samples WHERE subgroup_id = $1`,
      [subgroupId]
    );
    const existingNames = new Set(existing.rows.map((r) => r.name));

    let sampleOrder = 0;
    for (const sampleName of sampleNames) {
      if (!existingNames.has(sampleName)) {
        await pool.query(
          `INSERT INTO colour_samples (subgroup_id, name, sort_order)
           VALUES ($1, $2, $3)`,
          [subgroupId, sampleName, sampleOrder]
        );
      }
      sampleOrder += 10;
    }
  }
}

async function listPolytecCatalogue(pool) {
  const groupRes = await pool.query(
    `SELECT id, key, name, sort_order FROM colour_groups WHERE key = $1 AND active = TRUE LIMIT 1`,
    [GROUP_KEY]
  );
  if (!groupRes.rows.length) {
    return { key: GROUP_KEY, name: GROUP_DISPLAY_NAME, subgroups: [] };
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
     ORDER BY s.sort_order ASC, s.name ASC, s.id ASC`,
    [group.id]
  );

  const samplesBySubgroup = new Map();
  for (const row of samplesRes.rows) {
    if (!samplesBySubgroup.has(row.subgroup_id)) samplesBySubgroup.set(row.subgroup_id, []);
    samplesBySubgroup.get(row.subgroup_id).push(mapSampleRow(row));
  }

  return {
    id: group.id,
    key: group.key,
    name: group.name,
    subgroups: subgroupsRes.rows.map((sg) => ({
      id: sg.id,
      name: sg.name,
      sort_order: sg.sort_order,
      samples: samplesBySubgroup.get(sg.id) || [],
    })),
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
  UPLOAD_DIR,
  ensurePolytecColourTables,
  listPolytecCatalogue,
  getSampleById,
  updateSample,
  getSampleImagePath,
  mapSampleRow,
};
