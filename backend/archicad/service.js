const fsp = require("fs/promises");
const path = require("path");
const { STATUS, MESSAGES, ACTIVE } = require("./statuses");
const { ensureArchicadModelTable, toPublicModel } = require("./schema");
const {
  newModelId,
  newRunId,
  assertId,
  modelDir,
  ensureModelDir,
  sanitizeDisplayName,
  sourcePath,
  webModelPath,
  moveIntoPlace,
  removeModelFiles,
  fileExists,
} = require("./storage");
const { validateUpload } = require("./importers/validateUpload");
const { publicFormats } = require("./importers/registry");
const { detectConversionTools } = require("./converters/detectTools");
const { convertStoredSource, adoptConvertedGlb } = require("./converters/convertSource");
const { readGlbDocument, collectElementNames } = require("./glb");
const queue = require("./conversionQueue");

let poolRef = null;
let initPromise = null;

function requirePool() {
  if (!poolRef) {
    const error = new Error("Database is not available");
    error.statusCode = 500;
    throw error;
  }
  return poolRef;
}

async function init(pool) {
  poolRef = pool;
  if (!pool) return;
  if (!initPromise) {
    initPromise = ensureArchicadModelTable(pool).catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  await initPromise;
}

async function getRow(id) {
  const pool = requirePool();
  const result = await pool.query(`SELECT * FROM archicad_models WHERE id = $1`, [assertId(id)]);
  return result.rows[0] || null;
}

async function updateIfCurrent(id, runId, patch) {
  const pool = requirePool();
  const result = await pool.query(
    `UPDATE archicad_models
     SET status = $1,
         status_message = $2,
         error_detail = $3,
         converter = $4,
         element_summary = $5::jsonb,
         updated_at = NOW()
     WHERE id = $6 AND run_id = $7`,
    [
      patch.status,
      patch.statusMessage,
      patch.errorDetail,
      patch.converter,
      JSON.stringify(patch.elements || []),
      id,
      runId,
    ]
  );
  return result.rowCount > 0;
}

async function listModels() {
  const pool = requirePool();
  await ensureArchicadModelTable(pool);
  const result = await pool.query(
    `SELECT * FROM archicad_models ORDER BY updated_at DESC, created_at DESC LIMIT 200`
  );
  return result.rows.map(toPublicModel);
}

async function getModel(id) {
  await ensureArchicadModelTable(requirePool());
  const row = await getRow(id);
  if (!row) {
    const error = new Error("That model could not be found.");
    error.statusCode = 404;
    throw error;
  }
  return toPublicModel(row);
}

async function insertModel({ id, displayName, format, bytes, userId, runId, status, statusMessage, projectId = null, converter = null }) {
  const pool = requirePool();
  await pool.query(
    `INSERT INTO archicad_models (
      id, display_name, source_format, source_bytes, status, status_message, run_id, created_by, project_id, converter, element_summary
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '[]'::jsonb)`,
    [id, displayName, format, bytes, status, statusMessage, runId, userId, projectId, converter]
  );
}

async function createFromUpload({ tempPath, originalName, userId }) {
  const checked = await validateUpload(tempPath, originalName);
  const id = newModelId();
  const runId = newRunId();
  const displayName = sanitizeDisplayName(originalName);
  await ensureModelDir(id);
  try {
    await moveIntoPlace(tempPath, sourcePath(id, checked.extension));
    await insertModel({
      id,
      displayName,
      format: checked.format,
      bytes: checked.bytes,
      userId,
      runId,
      status: STATUS.QUEUED,
      statusMessage: MESSAGES[STATUS.QUEUED],
    });
  } catch (error) {
    await removeModelFiles(id).catch(() => {});
    throw error;
  }
  queue.enqueue(id);
  return getModel(id);
}

async function replaceSource({ id, tempPath, originalName, converter = null }) {
  const existing = await getRow(id);
  if (!existing) {
    const error = new Error("That model could not be found.");
    error.statusCode = 404;
    throw error;
  }
  const checked = await validateUpload(tempPath, originalName);
  const runId = newRunId();
  const displayName = sanitizeDisplayName(originalName);
  await ensureModelDir(id);
  const dest = sourcePath(id, checked.extension);
  await moveIntoPlace(tempPath, dest);
  for (const ext of ["pln", "ifc", "glb", "gltf"]) {
    const previous = sourcePath(id, ext);
    if (previous !== dest && fileExists(previous)) await fsp.unlink(previous).catch(() => {});
  }
  await fsp.unlink(webModelPath(id)).catch(() => {});
  await fsp.unlink(path.join(modelDir(id), "from-archicad.ifc")).catch(() => {});
  await requirePool().query(
    `UPDATE archicad_models
     SET display_name = $1,
         source_format = $2,
         source_bytes = $3,
         status = $4,
         status_message = $5,
         error_detail = NULL,
         converter = $6,
         element_summary = '[]'::jsonb,
         run_id = $7,
         updated_at = NOW()
     WHERE id = $8`,
    [displayName, checked.format, checked.bytes, STATUS.QUEUED, MESSAGES[STATUS.QUEUED], converter, runId, assertId(id)]
  );
  queue.enqueue(id);
  return getModel(id);
}

async function modelForProject(projectId) {
  const pool = requirePool();
  const result = await pool.query(
    `SELECT * FROM archicad_models WHERE project_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [Number(projectId)]
  );
  return result.rows[0] || null;
}

async function importProjectPln({ projectId, tempPath, originalName, userId }) {
  const projectIdNum = Number(projectId);
  if (!Number.isInteger(projectIdNum) || projectIdNum <= 0) {
    const error = new Error("That project could not be found.");
    error.statusCode = 404;
    throw error;
  }
  const pool = requirePool();
  const project = await pool.query(`SELECT id FROM projects WHERE id = $1`, [projectIdNum]);
  if (!project.rows[0]) {
    const error = new Error("That project could not be found.");
    error.statusCode = 404;
    throw error;
  }
  const checked = await validateUpload(tempPath, originalName);
  if (checked.format !== "pln") {
    const error = new Error("Choose an Archicad PLN file.");
    error.statusCode = 400;
    throw error;
  }
  const existing = await modelForProject(projectIdNum);
  if (existing) {
    return replaceSource({
      id: existing.id,
      tempPath,
      originalName,
      converter: "project-pln",
    });
  }
  const id = newModelId();
  const runId = newRunId();
  const displayName = sanitizeDisplayName(originalName);
  await ensureModelDir(id);
  try {
    await moveIntoPlace(tempPath, sourcePath(id, checked.extension));
    await insertModel({
      id,
      displayName,
      format: checked.format,
      bytes: checked.bytes,
      userId,
      runId,
      status: STATUS.QUEUED,
      statusMessage: MESSAGES[STATUS.QUEUED],
      projectId: projectIdNum,
      converter: "project-pln",
    });
  } catch (error) {
    await removeModelFiles(id).catch(() => {});
    throw error;
  }
  queue.enqueue(id);
  return getModel(id);
}

async function attachConverted({ id, tempPath }) {
  const existing = await getRow(id);
  if (!existing) {
    const error = new Error("That model could not be found.");
    error.statusCode = 404;
    throw error;
  }
  if (existing.source_format !== "pln" && existing.source_format !== "ifc") {
    const error = new Error("A converted GLB can be attached to a PLN or IFC upload.");
    error.statusCode = 400;
    throw error;
  }
  const checked = await validateUpload(tempPath, "model.glb");
  if (checked.format !== "glb") {
    const error = new Error("Attach a .glb file exported from Archicad.");
    error.statusCode = 400;
    throw error;
  }
  const runId = newRunId();
  await requirePool().query(
    `UPDATE archicad_models
     SET status = $1, status_message = $2, error_detail = NULL, converter = $3, run_id = $4, updated_at = NOW()
     WHERE id = $5`,
    [STATUS.OPTIMISING, MESSAGES[STATUS.OPTIMISING], "manual-glb", runId, assertId(id)]
  );
  try {
    await adoptConvertedGlb(id, tempPath);
    await fsp.unlink(tempPath).catch(() => {});
  } catch (error) {
    await fsp.unlink(tempPath).catch(() => {});
    await updateIfCurrent(id, runId, {
      status: STATUS.FAILED,
      statusMessage: MESSAGES[STATUS.FAILED],
      errorDetail: error.message || "The attached file is not a valid GLB model.",
      converter: "manual-glb",
      elements: [],
    });
    return getModel(id);
  }
  queue.enqueue(id);
  return getModel(id);
}

async function removeModel(id) {
  const existing = await getRow(id);
  if (!existing) {
    const error = new Error("That model could not be found.");
    error.statusCode = 404;
    throw error;
  }
  await requirePool().query(`DELETE FROM archicad_models WHERE id = $1`, [assertId(id)]);
  await removeModelFiles(id);
}

async function webModelFile(id) {
  const row = await getRow(id);
  if (!row || row.status !== STATUS.READY) {
    const error = new Error("This model is not ready to view.");
    error.statusCode = row ? 409 : 404;
    throw error;
  }
  const filePath = webModelPath(id);
  if (!fileExists(filePath)) {
    const error = new Error("The web model file is missing.");
    error.statusCode = 404;
    throw error;
  }
  return { filePath, displayName: row.display_name };
}

async function finishReady(id, runId, converter) {
  const filePath = webModelPath(id);
  const document = await readGlbDocument(filePath);
  const elements = collectElementNames(document);
  const stillCurrent = await updateIfCurrent(id, runId, {
    status: STATUS.READY,
    statusMessage: MESSAGES[STATUS.READY],
    errorDetail: null,
    converter,
    elements,
  });
  return stillCurrent;
}

async function processModel(id) {
  const row = await getRow(id).catch(() => null);
  if (!row) return;
  if (!ACTIVE.has(row.status) && row.status !== STATUS.QUEUED && row.status !== STATUS.OPTIMISING) return;
  const runId = row.run_id;
  const extension = row.source_format === "glb" ? await storedSourceExtension(id) : row.source_format;

  if (row.converter === "manual-glb" && fileExists(webModelPath(id))) {
    const moved = await updateIfCurrent(id, runId, {
      status: STATUS.OPTIMISING,
      statusMessage: MESSAGES[STATUS.OPTIMISING],
      errorDetail: null,
      converter: "manual-glb",
      elements: [],
    });
    if (!moved && row.status !== STATUS.OPTIMISING) return;
    try {
      await finishReady(id, runId, "manual-glb");
    } catch (error) {
      await updateIfCurrent(id, runId, {
        status: STATUS.FAILED,
        statusMessage: MESSAGES[STATUS.FAILED],
        errorDetail: error.message || "The attached GLB could not be read.",
        converter: "manual-glb",
        elements: [],
      });
    }
    return;
  }

  const allowArchicad = row.converter === "project-pln";
  const processing = await updateIfCurrent(id, runId, {
    status: STATUS.PROCESSING,
    statusMessage: allowArchicad ? "Opening the PLN in Archicad…" : MESSAGES[STATUS.PROCESSING],
    errorDetail: null,
    converter: allowArchicad ? "project-pln" : null,
    elements: [],
  });
  if (!processing) return;

  const staging = path.join(modelDir(id), `incoming-${runId}.glb`);
  const result = await convertStoredSource({
    id,
    format: row.source_format,
    extension,
    output: staging,
    allowArchicad,
  });
  if (!result.ok) {
    await fsp.unlink(staging).catch(() => {});
    await updateIfCurrent(id, runId, {
      status: STATUS.FAILED,
      statusMessage: MESSAGES[STATUS.FAILED],
      errorDetail: result.message,
      converter: result.converter,
      elements: [],
    });
    return;
  }

  const optimising = await updateIfCurrent(id, runId, {
    status: STATUS.OPTIMISING,
    statusMessage: MESSAGES[STATUS.OPTIMISING],
    errorDetail: null,
    converter: result.converter,
    elements: [],
  });
  if (!optimising) {
    await fsp.unlink(staging).catch(() => {});
    return;
  }
  try {
    await fsp.unlink(webModelPath(id)).catch(() => {});
    await fsp.rename(staging, webModelPath(id));
    await finishReady(id, runId, result.converter);
  } catch (error) {
    await updateIfCurrent(id, runId, {
      status: STATUS.FAILED,
      statusMessage: MESSAGES[STATUS.FAILED],
      errorDetail: error.message || "The converted model could not be read.",
      converter: result.converter,
      elements: [],
    });
  }
}

async function storedSourceExtension(id) {
  if (fileExists(sourcePath(id, "gltf"))) return "gltf";
  if (fileExists(sourcePath(id, "glb"))) return "glb";
  return "glb";
}

async function capabilities() {
  const tools = await detectConversionTools();
  return {
    maxUploadBytes: 512 * 1024 * 1024,
    formats: publicFormats(),
    ifcConvertInstalled: tools.ifcConvertInstalled,
    configuredCommand: tools.configuredCommand,
    note: tools.configuredCommand
      ? "PLN files are sent to the configured converter. IFC and GLB files are converted on this server."
      : "PLN, IFC, and GLB files are shown in this viewer.",
  };
}

async function resumePending() {
  const pool = requirePool();
  await ensureArchicadModelTable(pool);
  await pool.query(
    `UPDATE archicad_models
     SET status = $1, status_message = $2, updated_at = NOW()
     WHERE status = ANY($3::text[])`,
    [STATUS.QUEUED, MESSAGES[STATUS.QUEUED], [STATUS.UPLOADING, STATUS.PROCESSING, STATUS.OPTIMISING]]
  );
  await pool.query(
    `UPDATE archicad_models
     SET status = $1, status_message = $2, error_detail = NULL, updated_at = NOW()
     WHERE status = $3 AND source_format = 'pln' AND converter = 'archicad'`,
    [STATUS.QUEUED, MESSAGES[STATUS.QUEUED], STATUS.FAILED]
  );
  const waiting = await pool.query(`SELECT id FROM archicad_models WHERE status = $1`, [STATUS.QUEUED]);
  for (const row of waiting.rows) queue.enqueue(row.id);
}

queue.setProcessor(processModel);

module.exports = {
  init,
  listModels,
  getModel,
  createFromUpload,
  replaceSource,
  modelForProject,
  importProjectPln,
  attachConverted,
  removeModel,
  webModelFile,
  capabilities,
  resumePending,
  processModel,
};
