const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const multer = require("multer");
const { requireStaffUserId } = require("../staffIdentity");
const { userHasAccessGrant } = require("../userAccessPermissions");
const { MAX_UPLOAD_BYTES, sanitizeDisplayName } = require("./storage");
const service = require("./service");

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase().slice(0, 8);
      cb(null, `sgf-archicad-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

function receiveFile(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "That file is larger than 512 MB." });
    }
    return res.status(400).json({ error: error.message || "Upload failed." });
  });
}

async function discardTemp(file) {
  if (file?.path) await fsp.unlink(file.path).catch(() => {});
}

function sendError(res, error, fallback) {
  const status = error.statusCode || 500;
  if (status >= 500) console.error(fallback, error);
  return res.status(status).json({ error: error.message || fallback });
}

function register(app, getPool) {
  async function requireToolAdmin(req, res) {
    const userId = requireStaffUserId(req, res);
    if (!userId) return null;
    const pool = getPool();
    if (!pool) {
      res.status(500).json({ error: "Database is not available" });
      return null;
    }
    await service.init(pool);
    const allowed = await userHasAccessGrant(pool, userId, "admin");
    if (!allowed) {
      res.status(403).json({ error: "Admin access required" });
      return null;
    }
    return userId;
  }

  app.get("/api/projects/:projectId/pln-model", async (req, res) => {
    try {
      if (!(await requireToolAdmin(req, res))) return;
      const row = await service.modelForProject(req.params.projectId);
      return res.json({ model: row ? (await service.getModel(row.id)) : null });
    } catch (error) {
      return sendError(res, error, "Could not load this project's model.");
    }
  });

  app.get("/api/projects/:projectId/pln-model/model.glb", async (req, res) => {
    try {
      if (!(await requireToolAdmin(req, res))) return;
      const row = await service.modelForProject(req.params.projectId);
      if (!row) return res.status(404).json({ error: "This project has no imported PLN." });
      const file = await service.webModelFile(row.id);
      const downloadName = sanitizeDisplayName(file.displayName).replace(/\.pln$/i, "") || "model";
      res.setHeader("Content-Type", "model/gltf-binary");
      res.setHeader("Content-Disposition", `inline; filename="${downloadName}.glb"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.sendFile(file.filePath, (error) => {
        if (error && !res.headersSent) res.status(500).json({ error: "Could not open the model." });
      });
    } catch (error) {
      return sendError(res, error, "Could not open the model.");
    }
  });

  app.post("/api/projects/:projectId/pln-model", receiveFile, async (req, res) => {
    try {
      const userId = await requireToolAdmin(req, res);
      if (!userId) {
        await discardTemp(req.file);
        return;
      }
      if (!req.file) return res.status(400).json({ error: "Choose a PLN file." });
      const model = await service.importProjectPln({
        projectId: req.params.projectId,
        tempPath: req.file.path,
        originalName: req.file.originalname,
        userId,
      });
      return res.status(201).json(model);
    } catch (error) {
      await discardTemp(req.file);
      return sendError(res, error, "The PLN could not be imported.");
    }
  });

  app.get("/api/tools/archicad-models/capabilities", async (req, res) => {
    try {
      if (!(await requireToolAdmin(req, res))) return;
      return res.json(await service.capabilities());
    } catch (error) {
      return sendError(res, error, "Could not read converter status.");
    }
  });

  app.get("/api/tools/archicad-models", async (req, res) => {
    try {
      if (!(await requireToolAdmin(req, res))) return;
      return res.json({ models: await service.listModels() });
    } catch (error) {
      return sendError(res, error, "Could not list models.");
    }
  });

  app.get("/api/tools/archicad-models/:id", async (req, res) => {
    try {
      if (!(await requireToolAdmin(req, res))) return;
      return res.json(await service.getModel(req.params.id));
    } catch (error) {
      return sendError(res, error, "Could not load that model.");
    }
  });

  app.get("/api/tools/archicad-models/:id/model.glb", async (req, res) => {
    try {
      if (!(await requireToolAdmin(req, res))) return;
      const file = await service.webModelFile(req.params.id);
      const downloadName = sanitizeDisplayName(file.displayName).replace(/\.pln$/i, "") || "model";
      res.setHeader("Content-Type", "model/gltf-binary");
      res.setHeader("Content-Disposition", `inline; filename="${downloadName}.glb"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.sendFile(file.filePath, (error) => {
        if (error && !res.headersSent) {
          res.status(500).json({ error: "Could not open the model." });
        }
      });
    } catch (error) {
      return sendError(res, error, "Could not open the model.");
    }
  });

  app.post("/api/tools/archicad-models", receiveFile, async (req, res) => {
    try {
      const userId = await requireToolAdmin(req, res);
      if (!userId) {
        await discardTemp(req.file);
        return;
      }
      if (!req.file) return res.status(400).json({ error: "Choose a file to upload." });
      const model = await service.createFromUpload({
        tempPath: req.file.path,
        originalName: req.file.originalname,
        userId,
      });
      return res.status(201).json(model);
    } catch (error) {
      await discardTemp(req.file);
      return sendError(res, error, "Upload failed.");
    }
  });

  app.post("/api/tools/archicad-models/:id/source", receiveFile, async (req, res) => {
    try {
      if (!(await requireToolAdmin(req, res))) {
        await discardTemp(req.file);
        return;
      }
      if (!req.file) return res.status(400).json({ error: "Choose a file to upload." });
      const model = await service.replaceSource({
        id: req.params.id,
        tempPath: req.file.path,
        originalName: req.file.originalname,
      });
      return res.json(model);
    } catch (error) {
      await discardTemp(req.file);
      return sendError(res, error, "Could not replace that model.");
    }
  });

  app.post("/api/tools/archicad-models/:id/converted", receiveFile, async (req, res) => {
    try {
      if (!(await requireToolAdmin(req, res))) {
        await discardTemp(req.file);
        return;
      }
      if (!req.file) return res.status(400).json({ error: "Choose a GLB file to attach." });
      const model = await service.attachConverted({ id: req.params.id, tempPath: req.file.path });
      return res.json(model);
    } catch (error) {
      await discardTemp(req.file);
      return sendError(res, error, "Could not attach that model.");
    }
  });

  app.delete("/api/tools/archicad-models/:id", async (req, res) => {
    try {
      if (!(await requireToolAdmin(req, res))) return;
      await service.removeModel(req.params.id);
      return res.json({ ok: true });
    } catch (error) {
      return sendError(res, error, "Could not remove that model.");
    }
  });
}

async function ensureReady(pool) {
  await service.init(pool);
  await service.resumePending();
}

module.exports = { register, ensureReady };
