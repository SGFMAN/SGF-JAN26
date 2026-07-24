/**
 * Colour catalogue (DB-backed). Colorbond remains hardcoded in the frontend.
 *
 * No seed/reseed — colours, subgroups, and groups are managed only via the DB /
 * Colour Settings UI. Image paths are stored as full filesystem paths:
 *   {colours_and_finishes_path}\{group name}\{filename}
 */

const path = require("path");
const fsSync = require("fs");

const GROUP_KEY = "polytec";
const GROUP_DISPLAY_NAME = "Polytec - Doors & Panels";
/** @deprecated Legacy on-disk fallback for basename-only rows. */
const IMAGE_DIR = path.join(
  __dirname,
  "..",
  "frontend",
  "public",
  "images",
  "Colours",
  "Polytec - Decorative 16mm Doors & Panels"
);
const SAFE_IMAGE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9 ._()-]*\.(jpe?g|png|webp|gif|bmp)$/i;

/** Preferred display order for known finish subgroups (sorting only). */
const SUBGROUP_ORDER = ["Ashgrain", "Matt", "Sheen", "Smooth", "Texture", "Woodmatt"];

function sanitizeImageFilename(raw) {
  if (raw == null) return null;
  const base = path.basename(String(raw).trim().replace(/\\/g, "/"));
  if (!base || base === "." || base === "..") return null;
  if (!SAFE_IMAGE_FILENAME.test(base)) return null;
  return base;
}

function isAbsoluteFilesystemPath(raw) {
  const s = String(raw || "").trim();
  if (!s) return false;
  return path.isAbsolute(s) || /^[A-Za-z]:[\\/]/.test(s);
}

function sanitizeGroupFolderName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  // Keep spaces and common punctuation used in group names; block path separators / traversal.
  if (trimmed.includes("..") || /[\\/]/.test(trimmed)) return null;
  return trimmed;
}

async function getColoursAndFinishesBasePath(pool) {
  const r = await pool.query(`SELECT colours_and_finishes_path FROM settings WHERE id = 1`);
  return String(r.rows[0]?.colours_and_finishes_path || "").trim();
}

async function getGroupNameForSubgroup(pool, subgroupId) {
  const r = await pool.query(
    `SELECT g.name
     FROM colour_groups g
     JOIN colour_subgroups sg ON sg.group_id = g.id
     WHERE sg.id = $1`,
    [subgroupId]
  );
  return String(r.rows[0]?.name || "").trim();
}

/**
 * Build full image path: {Colours and Finishes}\{group name}\{filename}
 */
function buildColourImageFullPath(basePath, groupName, filenameOrPath) {
  const safeFile = sanitizeImageFilename(filenameOrPath);
  if (!safeFile) return { error: "Invalid image filename", status: 400 };
  const base = String(basePath || "").trim();
  if (!base) {
    return {
      error: "Colours and Finishes path is not set in File Settings",
      status: 400,
    };
  }
  const folder = sanitizeGroupFolderName(groupName);
  if (!folder) {
    return { error: "Colour group name is missing or invalid", status: 400 };
  }
  return { path: path.join(base, folder, safeFile) };
}

function imageUrlForSample(sampleId, imageFilename, updatedAt = null) {
  if (!imageFilename || sampleId == null) return null;
  // Cache-bust so saving a new path reloads from disk without a server restart.
  const v = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  return `/api/colour-samples/${sampleId}/image?v=${Number.isFinite(v) ? v : Date.now()}`;
}

function mapSampleRow(row) {
  if (!row) return null;
  const imageFilename = row.image_filename || null;
  return {
    id: row.id,
    name: row.name,
    subgroup_id: row.subgroup_id,
    subgroup: row.subgroup_name || null,
    group_name: row.group_name || null,
    sort_order: row.sort_order,
    image_filename: imageFilename,
    image_url: imageUrlForSample(row.id, imageFilename, row.updated_at),
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
}

async function listGroupCatalogue(pool, groupKey) {
  const key = String(groupKey || "").trim();
  if (!key) return null;
  const groupRes = await pool.query(
    `SELECT id, key, name, sort_order FROM colour_groups WHERE key = $1 AND active = TRUE LIMIT 1`,
    [key]
  );
  if (!groupRes.rows.length) return null;
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
            sg.name AS subgroup_name, g.name AS group_name
     FROM colour_samples s
     JOIN colour_subgroups sg ON sg.id = s.subgroup_id
     JOIN colour_groups g ON g.id = sg.group_id
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

async function listPolytecCatalogue(pool) {
  const catalogue = await listGroupCatalogue(pool, GROUP_KEY);
  if (!catalogue) {
    return { key: GROUP_KEY, name: GROUP_DISPLAY_NAME, subgroups: [], samples: [] };
  }
  return catalogue;
}

async function getSampleById(pool, id) {
  const r = await pool.query(
    `SELECT s.*, sg.name AS subgroup_name, sg.group_id, g.name AS group_name
     FROM colour_samples s
     JOIN colour_subgroups sg ON sg.id = s.subgroup_id
     JOIN colour_groups g ON g.id = sg.group_id
     WHERE s.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

async function updateSample(pool, id, { name, subgroupId, imageFilename, clearImage }) {
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
  if (clearImage) {
    nextFilename = null;
  } else if (imageFilename !== undefined) {
    if (imageFilename == null || String(imageFilename).trim() === "") {
      nextFilename = null;
    } else {
      const basePath = await getColoursAndFinishesBasePath(pool);
      const groupName =
        (await getGroupNameForSubgroup(pool, nextSubgroupId)) || existing.group_name || "";
      const built = buildColourImageFullPath(basePath, groupName, imageFilename);
      if (built.error) return { error: built.error, status: built.status || 400 };
      nextFilename = built.path;
    }
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

async function deleteSample(pool, id) {
  const existing = await getSampleById(pool, id);
  if (!existing) return { notFound: true };
  // Do not delete shared image files from the public colour library.
  await pool.query(`DELETE FROM colour_samples WHERE id = $1`, [id]);
  return { deleted: mapSampleRow(existing) };
}

async function getPolytecGroupId(pool) {
  const r = await pool.query(
    `SELECT id FROM colour_groups WHERE key = $1 AND active = TRUE LIMIT 1`,
    [GROUP_KEY]
  );
  return r.rows[0]?.id ?? null;
}

function mapSubgroupRow(row, sampleCount = 0) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    sort_order: row.sort_order,
    sample_count: Number(sampleCount) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listSubgroups(pool) {
  const groupId = await getPolytecGroupId(pool);
  if (!groupId) return [];
  const r = await pool.query(
    `SELECT sg.*,
            (SELECT COUNT(*)::int FROM colour_samples s WHERE s.subgroup_id = sg.id) AS sample_count
     FROM colour_subgroups sg
     WHERE sg.group_id = $1
     ORDER BY sg.sort_order ASC, sg.name ASC, sg.id ASC`,
    [groupId]
  );
  return r.rows.map((row) => mapSubgroupRow(row, row.sample_count));
}

async function createSubgroup(pool, name) {
  const groupId = await getPolytecGroupId(pool);
  if (!groupId) return { error: "Polytec colour group not found", status: 404 };
  const trimmed = String(name || "").trim();
  if (!trimmed) return { error: "Name is required", status: 400 };
  const maxOrder = await pool.query(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM colour_subgroups WHERE group_id = $1`,
    [groupId]
  );
  try {
    const r = await pool.query(
      `INSERT INTO colour_subgroups (group_id, name, sort_order)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [groupId, trimmed, (Number(maxOrder.rows[0]?.m) || 0) + 10]
    );
    return { subgroup: mapSubgroupRow(r.rows[0], 0) };
  } catch (e) {
    if (e && e.code === "23505") {
      return { error: "A subgroup with that name already exists", status: 409 };
    }
    throw e;
  }
}

async function updateSubgroup(pool, id, name) {
  const existing = await pool.query(
    `SELECT sg.*
     FROM colour_subgroups sg
     JOIN colour_groups g ON g.id = sg.group_id
     WHERE sg.id = $1 AND g.key = $2`,
    [id, GROUP_KEY]
  );
  if (!existing.rows.length) return { notFound: true };
  const trimmed = String(name || "").trim();
  if (!trimmed) return { error: "Name is required", status: 400 };
  try {
    const r = await pool.query(
      `UPDATE colour_subgroups
       SET name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [trimmed, id]
    );
    const countR = await pool.query(
      `SELECT COUNT(*)::int AS c FROM colour_samples WHERE subgroup_id = $1`,
      [id]
    );
    return { subgroup: mapSubgroupRow(r.rows[0], countR.rows[0]?.c) };
  } catch (e) {
    if (e && e.code === "23505") {
      return { error: "A subgroup with that name already exists", status: 409 };
    }
    throw e;
  }
}

async function deleteSubgroup(pool, id) {
  const existing = await pool.query(
    `SELECT sg.*
     FROM colour_subgroups sg
     JOIN colour_groups g ON g.id = sg.group_id
     WHERE sg.id = $1 AND g.key = $2`,
    [id, GROUP_KEY]
  );
  if (!existing.rows.length) return { notFound: true };
  const countR = await pool.query(
    `SELECT COUNT(*)::int AS c FROM colour_samples WHERE subgroup_id = $1`,
    [id]
  );
  await pool.query(`DELETE FROM colour_subgroups WHERE id = $1`, [id]);
  return {
    deleted: mapSubgroupRow(existing.rows[0], countR.rows[0]?.c),
  };
}

async function getSampleImagePath(pool, id) {
  const row = await getSampleById(pool, id);
  if (!row) return { notFound: true };
  const stored = String(row.image_filename || "").trim();
  if (!stored) return { noImage: true };

  let fullPath = null;
  if (isAbsoluteFilesystemPath(stored)) {
    fullPath = stored;
  } else {
    const safe = sanitizeImageFilename(stored);
    if (!safe) return { noImage: true };
    const basePath = await getColoursAndFinishesBasePath(pool);
    const groupName = String(row.group_name || "").trim();
    if (basePath && groupName) {
      const built = buildColourImageFullPath(basePath, groupName, safe);
      if (!built.error) fullPath = built.path;
    }
    if (!fullPath) {
      fullPath = path.join(IMAGE_DIR, safe);
    }
  }

  if (!fullPath || !fsSync.existsSync(fullPath)) return { noImage: true };
  return { path: fullPath, filename: path.basename(fullPath) };
}

function mapGroupRow(row, sampleCount = 0, subgroupCount = 0) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    sort_order: row.sort_order,
    active: row.active !== false,
    sample_count: Number(sampleCount) || 0,
    subgroup_count: Number(subgroupCount) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function slugifyGroupKey(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "group";
}

async function listColourGroups(pool) {
  const r = await pool.query(
    `SELECT g.*,
            (SELECT COUNT(*)::int FROM colour_subgroups sg WHERE sg.group_id = g.id) AS subgroup_count,
            (SELECT COUNT(*)::int
             FROM colour_samples s
             JOIN colour_subgroups sg ON sg.id = s.subgroup_id
             WHERE sg.group_id = g.id) AS sample_count
     FROM colour_groups g
     WHERE g.active = TRUE
     ORDER BY g.sort_order ASC, g.name ASC, g.id ASC`
  );
  return r.rows.map((row) => mapGroupRow(row, row.sample_count, row.subgroup_count));
}

async function createColourGroup(pool, name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return { error: "Name is required", status: 400 };
  let key = slugifyGroupKey(trimmed);
  const existingKeys = await pool.query(`SELECT key FROM colour_groups`);
  const used = new Set(existingKeys.rows.map((row) => String(row.key || "").toLowerCase()));
  if (used.has(key)) {
    let n = 2;
    while (used.has(`${key}-${n}`)) n += 1;
    key = `${key}-${n}`;
  }
  const maxOrder = await pool.query(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM colour_groups`);
  try {
    const r = await pool.query(
      `INSERT INTO colour_groups (key, name, sort_order, active)
       VALUES ($1, $2, $3, TRUE)
       RETURNING *`,
      [key, trimmed, (Number(maxOrder.rows[0]?.m) || 0) + 10]
    );
    return { group: mapGroupRow(r.rows[0], 0, 0) };
  } catch (e) {
    if (e && e.code === "23505") {
      return { error: "A colour group with that name or key already exists", status: 409 };
    }
    throw e;
  }
}

async function updateColourGroup(pool, id, name) {
  const existing = await pool.query(`SELECT * FROM colour_groups WHERE id = $1`, [id]);
  if (!existing.rows.length) return { notFound: true };
  const trimmed = String(name || "").trim();
  if (!trimmed) return { error: "Name is required", status: 400 };
  try {
    const r = await pool.query(
      `UPDATE colour_groups
       SET name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [trimmed, id]
    );
    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM colour_subgroups sg WHERE sg.group_id = $1) AS subgroup_count,
         (SELECT COUNT(*)::int
          FROM colour_samples s
          JOIN colour_subgroups sg ON sg.id = s.subgroup_id
          WHERE sg.group_id = $1) AS sample_count`,
      [id]
    );
    return {
      group: mapGroupRow(
        r.rows[0],
        counts.rows[0]?.sample_count,
        counts.rows[0]?.subgroup_count
      ),
    };
  } catch (e) {
    if (e && e.code === "23505") {
      return { error: "A colour group with that name already exists", status: 409 };
    }
    throw e;
  }
}

async function deleteColourGroup(pool, id) {
  const existing = await pool.query(`SELECT * FROM colour_groups WHERE id = $1`, [id]);
  if (!existing.rows.length) return { notFound: true };
  const counts = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM colour_subgroups sg WHERE sg.group_id = $1) AS subgroup_count,
       (SELECT COUNT(*)::int
        FROM colour_samples s
        JOIN colour_subgroups sg ON sg.id = s.subgroup_id
        WHERE sg.group_id = $1) AS sample_count`,
    [id]
  );
  await pool.query(`DELETE FROM colour_groups WHERE id = $1`, [id]);
  return {
    deleted: mapGroupRow(
      existing.rows[0],
      counts.rows[0]?.sample_count,
      counts.rows[0]?.subgroup_count
    ),
  };
}

module.exports = {
  GROUP_KEY,
  GROUP_DISPLAY_NAME,
  IMAGE_DIR,
  ensurePolytecColourTables,
  listPolytecCatalogue,
  listGroupCatalogue,
  getSampleById,
  updateSample,
  deleteSample,
  listSubgroups,
  createSubgroup,
  updateSubgroup,
  deleteSubgroup,
  getSampleImagePath,
  mapSampleRow,
  sanitizeImageFilename,
  imageUrlForSample,
  buildColourImageFullPath,
  listColourGroups,
  createColourGroup,
  updateColourGroup,
  deleteColourGroup,
};
