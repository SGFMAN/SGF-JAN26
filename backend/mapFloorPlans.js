const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const crypto = require("crypto");

const FLOOR_PLAN_CATEGORIES = ["Affordable", "Superior"];
const UPLOAD_DIR = path.join(__dirname, "data", "floor-plans");

function ensureUploadDir() {
  if (!fsSync.existsSync(UPLOAD_DIR)) {
    fsSync.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function rowToPlan(row) {
  const ext = path.extname(row.image_filename || "").toLowerCase();
  const fileType = ext === ".pdf" ? "pdf" : "image";
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    sizeSqm: Number(row.size_sqm),
    hasImage: Boolean(row.image_filename),
    fileType,
    imageUrl: row.image_filename ? `/api/maps/floor-plans/${row.id}/image` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateCategory(category) {
  const c = String(category || "").trim();
  if (!FLOOR_PLAN_CATEGORIES.includes(c)) {
    return { error: `category must be one of: ${FLOOR_PLAN_CATEGORIES.join(", ")}` };
  }
  return { category: c };
}

function validateSizeSqm(raw) {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return { error: "size_sqm must be a positive number" };
  }
  return { sizeSqm: n };
}

function validateName(raw) {
  const name = String(raw || "").trim();
  if (!name) return { error: "name is required" };
  return { name };
}

function parseFloorPlanFields(body) {
  const nameParsed = validateName(body.name);
  if (nameParsed.error) return nameParsed;
  const categoryParsed = validateCategory(body.category);
  if (categoryParsed.error) return categoryParsed;
  const sizeParsed = validateSizeSqm(body.size_sqm ?? body.sizeSqm);
  if (sizeParsed.error) return sizeParsed;
  return {
    name: nameParsed.name,
    category: categoryParsed.category,
    sizeSqm: sizeParsed.sizeSqm,
  };
}

function uploadExtension(mimetype, originalname) {
  const fromMime = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
  };
  if (fromMime[mimetype]) return fromMime[mimetype];
  const ext = path.extname(originalname || "").toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"].includes(ext)) {
    return ext === ".jpeg" ? ".jpg" : ext;
  }
  return null;
}

async function saveUploadFile(file) {
  ensureUploadDir();
  const ext = uploadExtension(file.mimetype, file.originalname);
  if (!ext) {
    throw new Error("Only image or PDF files are allowed (JPEG, PNG, WebP, GIF, PDF)");
  }
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), file.buffer);
  return filename;
}

async function deleteImageFile(filename) {
  if (!filename) return;
  try {
    await fs.unlink(path.join(UPLOAD_DIR, filename));
  } catch (e) {
    if (e.code !== "ENOENT") console.warn("[floor-plans] delete image:", e.message);
  }
}

async function listFloorPlans(pool) {
  const r = await pool.query(
    `SELECT id, name, category, size_sqm, image_filename, created_at, updated_at
     FROM map_floor_plans ORDER BY name ASC`
  );
  return r.rows.map(rowToPlan);
}

async function createFloorPlan(pool, fields, file) {
  let imageFilename = null;
  if (file) {
    imageFilename = await saveUploadFile(file);
  }
  const r = await pool.query(
    `INSERT INTO map_floor_plans (name, category, size_sqm, image_filename, updated_at)
     VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
    [fields.name, fields.category, fields.sizeSqm, imageFilename]
  );
  return rowToPlan(r.rows[0]);
}

async function updateFloorPlan(pool, id, fields, file) {
  const existing = await pool.query(`SELECT * FROM map_floor_plans WHERE id = $1`, [id]);
  if (!existing.rows.length) return { notFound: true };

  let imageFilename = existing.rows[0].image_filename;
  if (file) {
    await deleteImageFile(imageFilename);
    imageFilename = await saveUploadFile(file);
  }

  const r = await pool.query(
    `UPDATE map_floor_plans
     SET name = $1, category = $2, size_sqm = $3, image_filename = $4, updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [fields.name, fields.category, fields.sizeSqm, imageFilename, id]
  );
  return { plan: rowToPlan(r.rows[0]) };
}

async function deleteFloorPlan(pool, id) {
  const existing = await pool.query(`SELECT * FROM map_floor_plans WHERE id = $1`, [id]);
  if (!existing.rows.length) return { notFound: true };
  await deleteImageFile(existing.rows[0].image_filename);
  await pool.query(`DELETE FROM map_floor_plans WHERE id = $1`, [id]);
  return { ok: true };
}

async function getFloorPlanImagePath(pool, id) {
  const r = await pool.query(`SELECT image_filename FROM map_floor_plans WHERE id = $1`, [id]);
  if (!r.rows.length || !r.rows[0].image_filename) return null;
  const filePath = path.join(UPLOAD_DIR, r.rows[0].image_filename);
  if (!fsSync.existsSync(filePath)) return null;
  return filePath;
}

module.exports = {
  FLOOR_PLAN_CATEGORIES,
  parseFloorPlanFields,
  listFloorPlans,
  createFloorPlan,
  updateFloorPlan,
  deleteFloorPlan,
  getFloorPlanImagePath,
};
