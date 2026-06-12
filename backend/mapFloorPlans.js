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

async function ensureMapFloorPlansDollarValueColumn(pool) {
  if (!pool) return;
  await pool.query(`
    ALTER TABLE map_floor_plans ADD COLUMN IF NOT EXISTS dollar_value NUMERIC(12, 2);
  `);
}

async function ensureMapFloorPlansDefine3DColumn(pool) {
  if (!pool) return;
  await pool.query(`
    ALTER TABLE map_floor_plans ADD COLUMN IF NOT EXISTS define_3d JSONB;
  `);
}

async function ensureMapFloorPlansImageDimensionsColumn(pool) {
  if (!pool) return;
  await pool.query(`
    ALTER TABLE map_floor_plans ADD COLUMN IF NOT EXISTS image_width INTEGER;
  `);
  await pool.query(`
    ALTER TABLE map_floor_plans ADD COLUMN IF NOT EXISTS image_height INTEGER;
  `);
}

async function readPngDimensions(filename) {
  if (!filename) return null;
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fsSync.existsSync(filePath)) return null;

  const handle = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(24);
    await handle.read(header, 0, 24, 0);
    if (header.toString("ascii", 1, 4) !== "PNG") return null;
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      return null;
    }
    if (width > 20000 || height > 20000) return null;
    return { width, height };
  } finally {
    await handle.close();
  }
}

function parseDefine3DPoint(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function normalizeDefine3D(raw) {
  if (raw == null) {
    return { externalWallPolygons: [], internalWallSegments: [] };
  }

  const source = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!source || typeof source !== "object") {
    return { error: "define3d must be an object" };
  }

  const externalWallPolygons = Array.isArray(source.externalWallPolygons)
    ? source.externalWallPolygons
        .map((polygon) => {
          if (!Array.isArray(polygon)) return null;
          const points = polygon.map(parseDefine3DPoint).filter(Boolean);
          return points.length >= 3 ? points : null;
        })
        .filter(Boolean)
    : [];

  const internalWallSegments = Array.isArray(source.internalWallSegments)
    ? source.internalWallSegments
        .map((segment) => {
          if (!Array.isArray(segment) || segment.length !== 2) return null;
          const start = parseDefine3DPoint(segment[0]);
          const end = parseDefine3DPoint(segment[1]);
          if (!start || !end) return null;
          if (Math.hypot(end.x - start.x, end.y - start.y) < 1) return null;
          return [start, end];
        })
        .filter(Boolean)
    : [];

  if (
    !Array.isArray(source.externalWallPolygons) &&
    !Array.isArray(source.internalWallSegments)
  ) {
    return { error: "define3d must include externalWallPolygons and/or internalWallSegments" };
  }

  return { define3d: { externalWallPolygons, internalWallSegments } };
}

function define3dFromRow(raw) {
  if (raw == null) return null;
  try {
    const parsed = normalizeDefine3D(raw);
    if (parsed.error) return null;
    const { externalWallPolygons, internalWallSegments } = parsed.define3d;
    if (!externalWallPolygons.length && !internalWallSegments.length) return null;
    return parsed.define3d;
  } catch {
    return null;
  }
}

function parseDollarValue(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { dollarValue: null };
  }
  const cleaned = String(raw).replace(/[$ ,\s]/g, "");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 0) {
    return { error: "dollar_value must be a non-negative number" };
  }
  return { dollarValue: n };
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
  const imageWidth = row.image_width != null ? Number(row.image_width) : null;
  const imageHeight = row.image_height != null ? Number(row.image_height) : null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    sizeSqm: Number(row.size_sqm),
    dollarValue: row.dollar_value != null ? Number(row.dollar_value) : null,
    hasImage: Boolean(row.image_filename),
    fileType,
    imageUrl: row.image_filename ? `/api/maps/floor-plans/${row.id}/image` : null,
    imageWidth: Number.isFinite(imageWidth) && imageWidth > 0 ? imageWidth : null,
    imageHeight: Number.isFinite(imageHeight) && imageHeight > 0 ? imageHeight : null,
    scale: buildScale(row),
    define3d: define3dFromRow(row.define_3d),
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

  const dollarParsed = parseDollarValue(body.dollar_value ?? body.dollarValue);
  if (dollarParsed.error) return dollarParsed;

  return {
    name: nameParsed.name,
    category: categoryParsed.category,
    sizeSqm: sizeParsed.sizeSqm,
    scale: scaleParsed.scale,
    dollarValue: dollarParsed.dollarValue,
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
  if (ext !== ".png") {
    throw new Error("Floor plans must be saved as PNG after cropping");
  }
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.png`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), file.buffer);
  const dimensions = await readPngDimensions(filename);
  return { filename, ...dimensions };
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
  await ensureMapFloorPlansDollarValueColumn(pool);
  await ensureMapFloorPlansDefine3DColumn(pool);
  await ensureMapFloorPlansImageDimensionsColumn(pool);
  const r = await pool.query(
    `SELECT id, name, category, size_sqm, dollar_value, image_filename, image_width, image_height,
            define_3d, scale_line_x1, scale_line_y1, scale_line_x2, scale_line_y2, scale_line_meters,
            created_at, updated_at
     FROM map_floor_plans ORDER BY name ASC`
  );
  return r.rows.map(rowToPlan);
}

async function getFloorPlan(pool, id) {
  await ensureMapFloorPlansDollarValueColumn(pool);
  await ensureMapFloorPlansDefine3DColumn(pool);
  await ensureMapFloorPlansImageDimensionsColumn(pool);
  const r = await pool.query(
    `SELECT id, name, category, size_sqm, dollar_value, image_filename, image_width, image_height,
            define_3d, scale_line_x1, scale_line_y1, scale_line_x2, scale_line_y2, scale_line_meters,
            created_at, updated_at
     FROM map_floor_plans WHERE id = $1`,
    [id]
  );
  if (!r.rows.length) return null;

  const row = r.rows[0];
  if ((!row.image_width || !row.image_height) && row.image_filename) {
    const dimensions = await readPngDimensions(row.image_filename);
    if (dimensions) {
      row.image_width = dimensions.width;
      row.image_height = dimensions.height;
      await pool.query(
        `UPDATE map_floor_plans SET image_width = $1, image_height = $2, updated_at = NOW() WHERE id = $3`,
        [dimensions.width, dimensions.height, id]
      );
    }
  }
  return rowToPlan(row);
}

async function createFloorPlan(pool, fields, file) {
  if (!file) {
    throw new Error("Floor plan image is required");
  }
  if (!fields.scale) {
    throw new Error("Scale calibration is required");
  }

  const upload = await saveUploadFile(file);
  const { scale } = fields;
  const r = await pool.query(
    `INSERT INTO map_floor_plans (
       name, category, size_sqm, dollar_value, image_filename, image_width, image_height,
       scale_line_x1, scale_line_y1, scale_line_x2, scale_line_y2, scale_line_meters,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()) RETURNING *`,
    [
      fields.name,
      fields.category,
      fields.sizeSqm,
      fields.dollarValue,
      upload.filename,
      upload.width ?? null,
      upload.height ?? null,
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

  let imageWidth = existing.rows[0].image_width;
  let imageHeight = existing.rows[0].image_height;

  if (file) {
    if (!fields.scale) {
      throw new Error("Scale calibration is required when replacing the floor plan image");
    }
    await deleteImageFile(imageFilename);
    const upload = await saveUploadFile(file);
    imageFilename = upload.filename;
    imageWidth = upload.width ?? null;
    imageHeight = upload.height ?? null;
    scaleX1 = fields.scale.x1;
    scaleY1 = fields.scale.y1;
    scaleX2 = fields.scale.x2;
    scaleY2 = fields.scale.y2;
    scaleMeters = fields.scale.meters;
  }

  const r = await pool.query(
    `UPDATE map_floor_plans
     SET name = $1, category = $2, size_sqm = $3, dollar_value = $4, image_filename = $5,
         image_width = $6, image_height = $7,
         scale_line_x1 = $8, scale_line_y1 = $9, scale_line_x2 = $10, scale_line_y2 = $11,
         scale_line_meters = $12, updated_at = NOW()
     WHERE id = $13 RETURNING *`,
    [
      fields.name,
      fields.category,
      fields.sizeSqm,
      fields.dollarValue,
      imageFilename,
      imageWidth,
      imageHeight,
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

async function updateFloorPlanDollarValue(pool, id, rawValue) {
  await ensureMapFloorPlansDollarValueColumn(pool);
  const parsed = parseDollarValue(rawValue);
  if (parsed.error) return { error: parsed.error, status: 400 };

  const r = await pool.query(
    `UPDATE map_floor_plans
     SET dollar_value = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [parsed.dollarValue, id]
  );
  if (!r.rows.length) return { notFound: true };
  return { plan: rowToPlan(r.rows[0]) };
}

async function updateFloorPlanDefine3D(pool, id, rawDefine3d) {
  await ensureMapFloorPlansDefine3DColumn(pool);
  const parsed = normalizeDefine3D(rawDefine3d);
  if (parsed.error) return { error: parsed.error, status: 400 };

  const { externalWallPolygons, internalWallSegments } = parsed.define3d;
  const payload =
    externalWallPolygons.length || internalWallSegments.length
      ? JSON.stringify({ externalWallPolygons, internalWallSegments })
      : null;

  const r = await pool.query(
    `UPDATE map_floor_plans
     SET define_3d = $1::jsonb, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [payload, id]
  );
  if (!r.rows.length) return { notFound: true };
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
  ensureMapFloorPlansDollarValueColumn,
  ensureMapFloorPlansDefine3DColumn,
  normalizeDefine3D,
  listFloorPlans,
  getFloorPlan,
  createFloorPlan,
  updateFloorPlan,
  updateFloorPlanDollarValue,
  updateFloorPlanDefine3D,
  deleteFloorPlan,
  getFloorPlanImagePath,
};
