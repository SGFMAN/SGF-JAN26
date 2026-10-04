const { STATUS, MESSAGES } = require("./statuses");

async function ensureArchicadModelTable(pool) {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS archicad_models (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      source_format TEXT NOT NULL,
      source_bytes BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      status_message TEXT NOT NULL DEFAULT '',
      error_detail TEXT,
      converter TEXT,
      element_summary JSONB,
      run_id TEXT NOT NULL,
      created_by INTEGER,
      project_id INTEGER,
      quote_id INTEGER,
      customer_ref TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE archicad_models ADD COLUMN IF NOT EXISTS project_id INTEGER`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS archicad_models_updated_idx
    ON archicad_models (updated_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS archicad_models_project_idx
    ON archicad_models (project_id);
  `);
}

function toPublicModel(row) {
  const elements = Array.isArray(row.element_summary) ? row.element_summary : [];
  const format = row.source_format;
  return {
    id: row.id,
    displayName: row.display_name,
    sourceFormat: format,
    sourceBytes: Number(row.source_bytes) || 0,
    status: row.status,
    statusMessage: row.status_message || MESSAGES[row.status] || "",
    errorDetail: row.error_detail || null,
    converter: row.converter || null,
    hasModel: row.status === STATUS.READY,
    canAttachConverted: format === "pln" || format === "ifc",
    elements,
    projectId: row.project_id == null ? null : Number(row.project_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { ensureArchicadModelTable, toPublicModel };
