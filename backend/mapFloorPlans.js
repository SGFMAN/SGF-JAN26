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

function buildScale(row) {
  const x1 = row.scale_line_x1;
  const y1 = row.scale_line_y1;
  const x2 = row.scale_line_x2;
  const y2 = row.scale_line_y2;
  const meters = row.scale_line_meters;
  if ([x1, y1, x2, y2, meters].some((v) => v == null)) return null;

  const line = {
    x1: Number(x1),
    y1: Number(y1),
    x2: Number(x2),
    y2: Number(y2),
  };
  const metersNum = Number(meters);
  const pixelDistance = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
  if (!Number.isFinite(metersNum) || metersNum <= 0 || pixelDistance <= 0) return null;

  return {
    line,
    meters: metersNum,
    pixelDistance,
    metersPerPixel: metersNum / pixelDistance,
  };
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
    scale: buildScale(row),
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

function parseScaleFields(body) {
  const raw = body || {};
  const values = [
    raw.scale_line_x1,
    raw.scale_line_y1,
    raw.scale_line_x2,
    raw.scale_line_y2,
    raw.scale_line_meters,
  ];
  const hasAny = values.some((v) => v != null && String(v).trim() !== "");
  if (!hasAny) return { scale: null };

  const x1 = Number.parseFloat(raw.scale_line_x1);
  const y1 = Number.parseFloat(raw.scale_line_y1);
  const x2 = Number.parseFloat(raw.scale_line_x2);
  const y2 = Number.parseFloat(raw.scale_line_y2);
  const meters = Number.parseFloat(raw.scale_line_meters);

  if (![x1, y1, x2, y2].every(Number.isFinite)) {
    return { error: "Scale line coordinates are invalid" };
  }
  if (!Number.isFinite(meters) || meters <= 0) {
    return { error: "scale_line_meters must be a positive number" };
  }
  const pixelDistance = Math.hypot(x2 - x1, y2 - y1);
  if (pixelDistance < 1) {
    return { error: "Scale line must span at least 1 pixel" };
  }

  return {
    scale: { x1, y1, x2, y2, meters },
  };
}

function parseFloorPlanFields(body, { requireScale = false } = {}) {
  const nameParsed = validateName(body.name);
  if (nameParsed.error) return nameParsed;
  const categoryParsed = validateCategory(body.category);
  if (categoryParsed.error) return categoryParsed;
  const sizeParsed = validateSizeSqm(body.size_sqm ?? body.sizeSqm);
  if (sizeParsed.error) return sizeParsed;

  const scaleParsed = parseScaleFields(body);
  if (scaleParsed.error) return scaleParsed;
  if (requireScale && !scaleParsed.scale) {
    return { error: "Scale calibration is required for new floor plan images" };
  }

  return {
    name: nameParsed.name,
    category: categoryParsed.category,
    sizeSqm: sizeParsed.sizeSqm,
    scale: scaleParsed.scale,
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
  if (ext !== ".jpg") {
    throw new Error("Floor plans must be saved as JPEG after cropping");
  }
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.jpg`;
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
    `SELECT id, name, category, size_sqm, image_filename,
            scale_line_x1, scale_line_y1, scale_line_x2, scale_line_y2, scale_line_meters,
            created_at, updated_at
     FROM map_floor_plans ORDER BY name ASC`
  );
  return r.rows.map(rowToPlan);
}

async function createFloorPlan(pool, fields, file) {
  if (!file) {
    throw new Error("Floor plan image is required");
  }
  if (!fields.scale) {
    throw new Error("Scale calibration is required");
  }

  const imageFilename = await saveUploadFile(file);
  const { scale } = fields;
  const r = await pool.query(
    `INSERT INTO map_floor_plans (
       name, category, size_sqm, image_filename,
       scale_line_x1, scale_line_y1, scale_line_x2, scale_line_y2, scale_line_meters,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
    [
      fields.name,
      fields.category,
      fields.sizeSqm,
      imageFilename,
      scale.x1,
      scale.y1,
      scale.x2,
      scale.y2,
      scale.meters,
    ]
  );
  return rowToPlan(r.rows[0]);
}

async function updateFloorPlan(pool, id, fields, file) {
  const existing = await pool.query(`SELECT * FROM map_floor_plans WHERE id = $1`, [id]);
  if (!existing.rows.length) return { notFound: true };

  let imageFilename = existing.rows[0].image_filename;
  let scaleX1 = existing.rows[0].scale_line_x1;
  let scaleY1 = existing.rows[0].scale_line_y1;
  let scaleX2 = existing.rows[0].scale_line_x2;
  let scaleY2 = existing.rows[0].scale_line_y2;
  let scaleMeters = existing.rows[0].scale_line_meters;

  if (file) {
    if (!fields.scale) {
      throw new Error("Scale calibration is required when replacing the floor plan image");
    }
    await deleteImageFile(imageFilename);
    imageFilename = await saveUploadFile(file);
    scaleX1 = fields.scale.x1;
    scaleY1 = fields.scale.y1;
    scaleX2 = fields.scale.x2;
    scaleY2 = fields.scale.y2;
    scaleMeters = fields.scale.meters;
  }

  const r = await pool.query(
    `UPDATE map_floor_plans
     SET name = $1, category = $2, size_sqm = $3, image_filename = $4,
         scale_line_x1 = $5, scale_line_y1 = $6, scale_line_x2 = $7, scale_line_y2 = $8,
         scale_line_meters = $9, updated_at = NOW()
     WHERE id = $10 RETURNING *`,
    [
      fields.name,
      fields.category,
      fields.sizeSqm,
      imageFilename,
      scaleX1,
      scaleY1,
      scaleX2,
      scaleY2,
      scaleMeters,
      id,
    ]
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
