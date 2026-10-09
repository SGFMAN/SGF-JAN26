/**
 * One-time Quick Concept client view.
 * Staff email a single-use link. Opening it sets a cookie for this design only.
 */

const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { requireStaffUserId } = require("./staffIdentity");

const COOKIE_NAME = "sgf_concept_view";
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FROM_ADDRESS = "info@superiorgrannyflats.com.au";
const MAX_SNAPSHOT_CHARS = 1_500_000;

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

function generateRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function parseCookies(req) {
  const header = req.headers?.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function finitePoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > 500 || Math.abs(y) > 500) return null;
  return { x, y };
}

function sanitizeSnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const metres = Array.isArray(raw.metres) ? raw.metres.map(finitePoint).filter(Boolean) : [];
  if (metres.length < 3 || metres.length > 80) return null;
  if (!Array.isArray(raw.rooms) || raw.rooms.length > 80) return null;
  let rooms;
  try {
    rooms = JSON.parse(JSON.stringify(raw.rooms));
  } catch {
    return null;
  }
  if (!Array.isArray(rooms) || rooms.some((room) => !room || typeof room !== "object" || Array.isArray(room))) {
    return null;
  }
  const eaveDepths = Array.isArray(raw.eaveDepths)
    ? raw.eaveDepths.slice(0, metres.length).map((value) => {
        const depth = Number(value);
        if (!Number.isFinite(depth)) return 0.3;
        return Math.min(2, Math.max(0, depth));
      })
    : [];
  const walkIn = raw.walk && typeof raw.walk === "object" ? raw.walk : {};
  const stops = Array.isArray(walkIn.stops) ? walkIn.stops.slice(0, 40) : [];
  const walk = {
    start: finitePoint(walkIn.start),
    finish: finitePoint(walkIn.finish),
    stops: stops
      .map((stop) => {
        const point = finitePoint(stop);
        if (!point) return null;
        return { ...point, kind: stop.kind === "point" ? "point" : "location" };
      })
      .filter(Boolean),
  };
  const address = String(raw.address || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const snapshot = { address, metres, rooms, eaveDepths, walk };
  if (JSON.stringify(snapshot).length > MAX_SNAPSHOT_CHARS) return null;
  return snapshot;
}

function viewDto(snapshot) {
  return {
    address: snapshot.address || "",
    metres: snapshot.metres,
    rooms: snapshot.rooms,
    eaveDepths: snapshot.eaveDepths,
    walk: snapshot.walk,
  };
}

async function ensureQuickConceptClientTables(pool) {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quick_concept_client_views (
      id BIGSERIAL PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      session_hash TEXT UNIQUE,
      email TEXT NOT NULL,
      snapshot JSONB NOT NULL,
      created_by_user_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      session_expires_at TIMESTAMPTZ
    );
  `);
}

async function loadSessionView(pool, req) {
  const raw = parseCookies(req)[COOKIE_NAME];
  if (!raw) return null;
  const sessionHash = hashToken(raw);
  const found = await pool.query(
    `SELECT id, snapshot, session_expires_at
     FROM quick_concept_client_views
     WHERE session_hash = $1
     LIMIT 1`,
    [sessionHash]
  );
  const row = found.rows[0];
  if (!row) return null;
  if (!row.session_expires_at || new Date(row.session_expires_at).getTime() <= Date.now()) {
    await pool.query(
      `UPDATE quick_concept_client_views
       SET session_hash = NULL, session_expires_at = NULL
       WHERE id = $1`,
      [row.id]
    );
    return null;
  }
  const nextExpiry = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query(
    `UPDATE quick_concept_client_views SET session_expires_at = $2 WHERE id = $1`,
    [row.id, nextExpiry.toISOString()]
  );
  return row.snapshot;
}

function registerQuickConceptClientRoutes(app, pool, helpers) {
  const { getSmtpCredentialsForFromAddress, resolveEmailAppPublicBase } = helpers;

  app.post("/api/quick-concept/client-view", async (req, res) => {
    const staffId = requireStaffUserId(req, res);
    if (!staffId) return;
    if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
    const email = normalizeEmail(req.body?.email);
    const firstName = String(req.body?.firstName || "").trim().slice(0, 80);
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    const snapshot = sanitizeSnapshot(req.body?.snapshot);
    if (!snapshot) {
      return res.status(400).json({ error: "This design cannot be sent yet." });
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);
    let insertedId = null;
    try {
      const inserted = await pool.query(
        `INSERT INTO quick_concept_client_views
          (token_hash, email, snapshot, created_by_user_id, expires_at)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         RETURNING id`,
        [tokenHash, email, JSON.stringify(snapshot), staffId, expiresAt.toISOString()]
      );
      insertedId = inserted.rows[0].id;

      const base = await resolveEmailAppPublicBase(pool, req, req.body || {});
      const viewUrl = `${base}/concept-client?token=${encodeURIComponent(rawToken)}`;
      const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";
      const place = snapshot.address ? escapeHtml(snapshot.address) : "your design";
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #222;">
          <p style="line-height: 1.5;">${greeting}</p>
          <p style="line-height: 1.5;">Your design for ${place} is ready. Open it to see the plan and a 3D view you can turn around.</p>
          <p style="margin: 28px 0;">
            <a href="${viewUrl}"
               style="display:inline-block;padding:14px 28px;background:#323233;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
              View design
            </a>
          </p>
          <p style="font-size: 0.9rem; color: #555; line-height: 1.45;">
            This link can be used once and expires in 7 days. If you did not expect this email, you can ignore it.
          </p>
          <p style="font-size: 0.85rem; color: #888;">Superior Granny Flats</p>
        </div>
      `;
      const from = FROM_ADDRESS;
      const creds = await getSmtpCredentialsForFromAddress(from);
      if (!creds?.smtpUser || !creds?.smtpPass) {
        throw new Error("SMTP credentials not configured");
      }
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.office365.com",
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: creds.smtpUser, pass: creds.smtpPass },
      });
      await transporter.sendMail({
        from,
        to: email,
        subject: snapshot.address ? `Your design — ${snapshot.address}` : "Your design",
        html,
      });
      return res.json({ ok: true });
    } catch (error) {
      if (insertedId) {
        await pool.query(`DELETE FROM quick_concept_client_views WHERE id = $1 AND used_at IS NULL`, [insertedId]).catch(() => {});
      }
      console.error("POST /api/quick-concept/client-view:", error?.message || error);
      return res.status(500).json({ error: "Could not send the email." });
    }
  });

  app.post("/api/quick-concept/client-view/consume", async (req, res) => {
    if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
    const rawToken = String(req.body?.token || "").trim();
    if (!/^[a-f0-9]{64}$/.test(rawToken)) {
      return res.status(400).json({ error: "Invalid or expired link" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        `SELECT id, expires_at, used_at
         FROM quick_concept_client_views
         WHERE token_hash = $1
         FOR UPDATE`,
        [hashToken(rawToken)]
      );
      const row = found.rows[0];
      if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Invalid or expired link" });
      }
      if (row.used_at) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "This link has already been used" });
      }
      const sessionRaw = generateRawToken();
      const sessionExpires = new Date(Date.now() + SESSION_TTL_MS);
      await client.query(
        `UPDATE quick_concept_client_views
         SET used_at = NOW(), session_hash = $2, session_expires_at = $3
         WHERE id = $1`,
        [row.id, hashToken(sessionRaw), sessionExpires.toISOString()]
      );
      await client.query("COMMIT");
      res.cookie(COOKIE_NAME, sessionRaw, cookieOptions());
      return res.json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("POST /api/quick-concept/client-view/consume:", error?.message || error);
      return res.status(500).json({ error: "Could not open this link" });
    } finally {
      client.release();
    }
  });

  app.get("/api/quick-concept/client-view", async (req, res) => {
    if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
    try {
      const snapshot = await loadSessionView(pool, req);
      if (!snapshot) return res.status(401).json({ error: "This view is no longer available" });
      return res.json(viewDto(snapshot));
    } catch (error) {
      console.error("GET /api/quick-concept/client-view:", error?.message || error);
      return res.status(500).json({ error: "Could not open this view" });
    }
  });
}

module.exports = {
  ensureQuickConceptClientTables,
  registerQuickConceptClientRoutes,
};
