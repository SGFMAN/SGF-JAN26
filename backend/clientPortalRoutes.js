/**
 * Client Portal API routes (v2.1).
 * Staff invite + client magic-link auth + read-only project overview.
 */

const nodemailer = require("nodemailer");
const { requireStaffUserId, getStaffUserIdFromRequest } = require("./staffIdentity");
const {
  hashToken,
  generateRawToken,
  getClientSessionTokenFromRequest,
  clientSessionCookieOptions,
  CLIENT_SESSION_COOKIE_NAME,
  createClientSession,
  destroyClientSession,
} = require("./clientSessions");
const { resolveClientIdentity, requireClientAccountId } = require("./clientIdentity");
const {
  toClientProjectOverviewDto,
  CLIENT_PROJECT_SELECT,
} = require("./clientPortalDto");

const DEFAULT_CLIENT_PORTAL_ORIGIN = "https://client.superiorgrannyflats.com.au";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LOGIN_LINK_TTL_MS = 60 * 60 * 1000; // 1 hour

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeHttpBaseUrl(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\/+$/, "");
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function resolveClientPortalPublicBase() {
  const envClean = sanitizeHttpBaseUrl(process.env.CLIENT_PORTAL_PUBLIC_URL);
  if (envClean) return envClean;
  const fallback = sanitizeHttpBaseUrl(DEFAULT_CLIENT_PORTAL_ORIGIN);
  return fallback || DEFAULT_CLIENT_PORTAL_ORIGIN;
}

async function findOrCreateClientAccount(pool, email, name) {
  const normalized = normalizeEmail(email);
  const existing = await pool.query(
    `SELECT id, email, name FROM client_accounts WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
    [normalized]
  );
  if (existing.rows[0]) {
    const id = existing.rows[0].id;
    const nextName = name != null ? String(name).trim() : "";
    if (nextName && !existing.rows[0].name) {
      await pool.query(
        `UPDATE client_accounts SET name = $1, updated_at = NOW() WHERE id = $2`,
        [nextName, id]
      );
    }
    return existing.rows[0].id;
  }
  const inserted = await pool.query(
    `INSERT INTO client_accounts (email, name, updated_at)
     VALUES ($1, $2, NOW())
     RETURNING id`,
    [normalized, name != null && String(name).trim() ? String(name).trim() : null]
  );
  return inserted.rows[0].id;
}

async function upsertMembership(pool, clientAccountId, projectId) {
  await pool.query(
    `INSERT INTO client_project_memberships (client_account_id, project_id, active, updated_at)
     VALUES ($1, $2, TRUE, NOW())
     ON CONFLICT (client_account_id, project_id)
     DO UPDATE SET active = TRUE, updated_at = NOW()`,
    [clientAccountId, projectId]
  );
}

async function createInvitationToken(pool, {
  clientAccountId,
  projectId,
  email,
  purpose,
  invitedByUserId,
  ttlMs,
}) {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMs);
  await pool.query(
    `INSERT INTO client_invitations
      (token_hash, client_account_id, project_id, invited_by_user_id, email, purpose, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      tokenHash,
      clientAccountId,
      projectId ?? null,
      invitedByUserId ?? null,
      normalizeEmail(email),
      purpose,
      expiresAt.toISOString(),
    ]
  );
  return { rawToken, expiresAt };
}

async function sendClientMagicEmail({
  pool,
  getSmtpCredentialsForFromAddress,
  getDefaultSystemSmtpFrom,
  toEmail,
  subject,
  htmlBody,
  fromOverride,
}) {
  const from =
    (fromOverride && String(fromOverride).trim()) ||
    (await getDefaultSystemSmtpFrom(pool)) ||
    process.env.SMTP_USER ||
    "";
  if (!from) {
    const err = new Error("No SMTP from address configured");
    err.status = 500;
    throw err;
  }
  const smtpCreds = await getSmtpCredentialsForFromAddress(from);
  const smtpUser = smtpCreds?.smtpUser;
  const smtpPass = smtpCreds?.smtpPass;
  if (!smtpUser || !smtpPass) {
    const err = new Error("SMTP credentials not configured");
    err.status = 500;
    throw err;
  }
  const host = process.env.SMTP_HOST || "smtp.office365.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transporter.sendMail({
    from,
    to: toEmail,
    subject,
    html: htmlBody,
  });
  return { from };
}

function buildMagicLinkEmailHtml({ magicUrl, heading, intro }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #222;">
      <h2 style="margin: 0 0 16px;">${heading}</h2>
      <p style="line-height: 1.5;">${intro}</p>
      <p style="margin: 28px 0;">
        <a href="${magicUrl}"
           style="display:inline-block;padding:14px 28px;background:#4D93D9;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">
          Open Client Portal
        </a>
      </p>
      <p style="font-size: 0.9rem; color: #555; line-height: 1.45;">
        This link is single-use and will expire. If you did not request access, you can ignore this email.
      </p>
      <p style="font-size: 0.85rem; color: #888;">Superior Granny Flats — Client Portal</p>
    </div>
  `;
}

async function loadOverviewForMembership(pool, clientAccountId, projectId) {
  const mem = await pool.query(
    `SELECT id FROM client_project_memberships
     WHERE client_account_id = $1 AND project_id = $2 AND active = TRUE
     LIMIT 1`,
    [clientAccountId, projectId]
  );
  if (!mem.rows[0]) return null;
  const pr = await pool.query(CLIENT_PROJECT_SELECT, [projectId]);
  if (!pr.rows[0]) return null;
  return toClientProjectOverviewDto(pr.rows[0]);
}

module.exports = function registerClientPortalRoutes(app, pool, helpers) {
  const {
    getSmtpCredentialsForFromAddress,
    getDefaultSystemSmtpFrom,
  } = helpers;

  // --- Staff: invite client to a project ---
  app.post("/api/projects/:id/client-portal/invite", async (req, res) => {
    if (!requireStaffUserId(req, res)) return;
    if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });

    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "invalid project id" });
    }

    const email = normalizeEmail(req.body?.email);
    const name = req.body?.name != null ? String(req.body.name).trim() : "";
    const fromOverride = req.body?.from != null ? String(req.body.from).trim() : "";

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "A valid email address is required" });
    }

    try {
      const projectCheck = await pool.query(`SELECT id, name, street, suburb FROM projects WHERE id = $1`, [
        projectId,
      ]);
      if (!projectCheck.rows[0]) {
        return res.status(404).json({ error: "Project not found" });
      }

      const clientAccountId = await findOrCreateClientAccount(pool, email, name || null);
      await upsertMembership(pool, clientAccountId, projectId);

      const staffUserId = getStaffUserIdFromRequest(req);
      const { rawToken, expiresAt } = await createInvitationToken(pool, {
        clientAccountId,
        projectId,
        email,
        purpose: "invite",
        invitedByUserId: staffUserId,
        ttlMs: INVITE_TTL_MS,
      });

      const base = resolveClientPortalPublicBase();
      const magicUrl = `${base}/auth/magic?token=${encodeURIComponent(rawToken)}`;
      const projectLabel =
        [projectCheck.rows[0].street, projectCheck.rows[0].suburb].filter(Boolean).join(", ") ||
        projectCheck.rows[0].name ||
        "your project";

      await sendClientMagicEmail({
        pool,
        getSmtpCredentialsForFromAddress,
        getDefaultSystemSmtpFrom,
        toEmail: email,
        fromOverride,
        subject: "Your Superior Granny Flats Client Portal invitation",
        htmlBody: buildMagicLinkEmailHtml({
          magicUrl,
          heading: "You're invited to the Client Portal",
          intro: `You have been invited to view <strong>${escapeHtml(projectLabel)}</strong>. Click the button below to sign in securely — no password needed.`,
        }),
      });

      res.json({
        ok: true,
        email,
        projectId,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (e) {
      console.error("POST /api/projects/:id/client-portal/invite:", e);
      res.status(e.status || 500).json({ error: e.message || "Failed to send invitation" });
    }
  });

  app.get("/api/projects/:id/client-portal/members", async (req, res) => {
    if (!requireStaffUserId(req, res)) return;
    if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
    const projectId = Number(req.params.id);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "invalid project id" });
    }
    try {
      const r = await pool.query(
        `SELECT m.id, m.active, m.created_at, a.id AS client_account_id, a.email, a.name
         FROM client_project_memberships m
         JOIN client_accounts a ON a.id = m.client_account_id
         WHERE m.project_id = $1
         ORDER BY LOWER(a.email) ASC`,
        [projectId]
      );
      res.json({
        members: r.rows.map((row) => ({
          membershipId: row.id,
          clientAccountId: row.client_account_id,
          email: row.email,
          name: row.name,
          active: row.active,
          createdAt: row.created_at,
        })),
      });
    } catch (e) {
      console.error("GET /api/projects/:id/client-portal/members:", e);
      res.status(500).json({ error: e.message || "Failed to load members" });
    }
  });

  // --- Staff: all invited clients across projects (Settings → Users) ---
  app.get("/api/client-portal/members", async (req, res) => {
    if (!requireStaffUserId(req, res)) return;
    if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
    try {
      const r = await pool.query(
        `SELECT m.id, m.active, m.created_at, m.project_id,
                a.id AS client_account_id, a.email, a.name,
                p.name AS project_name, p.street, p.suburb, p.state
         FROM client_project_memberships m
         JOIN client_accounts a ON a.id = m.client_account_id
         JOIN projects p ON p.id = m.project_id
         ORDER BY m.created_at DESC, m.id DESC`
      );
      res.json({
        members: r.rows.map((row) => {
          const addressParts = [row.street, row.suburb, row.state]
            .map((v) => (v == null ? "" : String(v).trim()))
            .filter(Boolean);
          return {
            membershipId: row.id,
            clientAccountId: row.client_account_id,
            email: row.email,
            name: row.name,
            active: row.active,
            createdAt: row.created_at,
            projectId: row.project_id,
            projectLabel: addressParts.join(", ") || row.project_name || `Project ${row.project_id}`,
          };
        }),
      });
    } catch (e) {
      console.error("GET /api/client-portal/members:", e);
      res.status(500).json({ error: e.message || "Failed to load invited clients" });
    }
  });

  // --- Client: request magic login link (always generic success) ---
  app.post("/api/client/auth/request-link", async (req, res) => {
    if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
    const email = normalizeEmail(req.body?.email);
    const generic = {
      ok: true,
      message: "If that email is registered, a login link has been sent.",
    };

    if (!isValidEmail(email)) {
      // Still generic — do not leak validation beyond basic format to UI; return 400 for empty/invalid UX
      return res.status(400).json({ error: "Enter a valid email address" });
    }

    try {
      const account = await pool.query(
        `SELECT id FROM client_accounts WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
        [email]
      );
      if (account.rows[0]) {
        const clientAccountId = account.rows[0].id;
        const memberships = await pool.query(
          `SELECT 1 FROM client_project_memberships
           WHERE client_account_id = $1 AND active = TRUE
           LIMIT 1`,
          [clientAccountId]
        );
        if (memberships.rows[0]) {
          const { rawToken } = await createInvitationToken(pool, {
            clientAccountId,
            projectId: null,
            email,
            purpose: "login",
            invitedByUserId: null,
            ttlMs: LOGIN_LINK_TTL_MS,
          });
          const base = resolveClientPortalPublicBase();
          const magicUrl = `${base}/auth/magic?token=${encodeURIComponent(rawToken)}`;
          try {
            await sendClientMagicEmail({
              pool,
              getSmtpCredentialsForFromAddress,
              getDefaultSystemSmtpFrom,
              toEmail: email,
              subject: "Your Superior Granny Flats Client Portal login link",
              htmlBody: buildMagicLinkEmailHtml({
                magicUrl,
                heading: "Sign in to the Client Portal",
                intro: "Click the button below to sign in securely. This link can be used once and will expire soon.",
              }),
            });
          } catch (mailErr) {
            console.error("client request-link send failed:", mailErr);
            // Still return generic success — do not reveal mail failure to callers
          }
        }
      }
      return res.json(generic);
    } catch (e) {
      console.error("POST /api/client/auth/request-link:", e);
      return res.json(generic);
    }
  });

  // --- Client: consume magic token → session cookie ---
  app.post("/api/client/auth/consume", async (req, res) => {
    if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
    const rawToken = String(req.body?.token || "").trim();
    if (!rawToken) {
      return res.status(400).json({ error: "Missing token" });
    }

    try {
      const tokenHash = hashToken(rawToken);
      const inv = await pool.query(
        `SELECT id, client_account_id, project_id, expires_at, used_at, purpose
         FROM client_invitations
         WHERE token_hash = $1
         LIMIT 1`,
        [tokenHash]
      );
      const row = inv.rows[0];
      if (!row) {
        return res.status(400).json({ error: "Invalid or expired link" });
      }
      if (row.used_at) {
        return res.status(400).json({ error: "This link has already been used" });
      }
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        return res.status(400).json({ error: "This link has expired" });
      }

      await pool.query(`UPDATE client_invitations SET used_at = NOW() WHERE id = $1`, [row.id]);

      if (row.project_id) {
        await upsertMembership(pool, row.client_account_id, row.project_id);
      }

      const { rawToken: sessionRaw } = await createClientSession(pool, row.client_account_id);
      res.cookie(CLIENT_SESSION_COOKIE_NAME, sessionRaw, clientSessionCookieOptions());

      const account = await pool.query(
        `SELECT id, email, name FROM client_accounts WHERE id = $1`,
        [row.client_account_id]
      );

      res.json({
        ok: true,
        client: {
          id: account.rows[0]?.id ?? row.client_account_id,
          email: account.rows[0]?.email ?? null,
          name: account.rows[0]?.name ?? null,
        },
      });
    } catch (e) {
      console.error("POST /api/client/auth/consume:", e);
      res.status(500).json({ error: e.message || "Failed to sign in" });
    }
  });

  app.get("/api/client/auth/session", async (req, res) => {
    if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
    try {
      const identity = await resolveClientIdentity(pool, req);
      if (!identity.clientAccountId) {
        return res.status(401).json({ authenticated: false });
      }
      res.json({
        authenticated: true,
        client: {
          id: identity.clientAccountId,
          email: identity.email,
          name: identity.name,
        },
      });
    } catch (e) {
      console.error("GET /api/client/auth/session:", e);
      res.status(500).json({ error: e.message || "Session check failed" });
    }
  });

  app.post("/api/client/auth/logout", async (req, res) => {
    if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
    try {
      const raw = getClientSessionTokenFromRequest(req);
      await destroyClientSession(pool, raw);
      res.clearCookie(CLIENT_SESSION_COOKIE_NAME, {
        ...clientSessionCookieOptions(),
        maxAge: undefined,
      });
      res.json({ ok: true });
    } catch (e) {
      console.error("POST /api/client/auth/logout:", e);
      res.status(500).json({ error: e.message || "Logout failed" });
    }
  });

  // --- Client: project overviews (membership-gated) ---
  app.get("/api/client/projects", async (req, res) => {
    if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
    const clientAccountId = await requireClientAccountId(pool, req, res);
    if (!clientAccountId) return;

    try {
      const mem = await pool.query(
        `SELECT project_id FROM client_project_memberships
         WHERE client_account_id = $1 AND active = TRUE
         ORDER BY updated_at DESC, id DESC`,
        [clientAccountId]
      );
      const projects = [];
      for (const row of mem.rows) {
        const dto = await loadOverviewForMembership(pool, clientAccountId, row.project_id);
        if (dto) projects.push(dto);
      }
      res.json({ projects });
    } catch (e) {
      console.error("GET /api/client/projects:", e);
      res.status(500).json({ error: e.message || "Failed to load projects" });
    }
  });

  app.get("/api/client/projects/:projectId", async (req, res) => {
    if (!pool) return res.status(500).json({ error: "DATABASE_URL not set" });
    const clientAccountId = await requireClientAccountId(pool, req, res);
    if (!clientAccountId) return;

    const projectId = Number(req.params.projectId);
    if (!Number.isFinite(projectId)) {
      return res.status(400).json({ error: "invalid project id" });
    }

    try {
      const dto = await loadOverviewForMembership(pool, clientAccountId, projectId);
      if (!dto) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json({ project: dto });
    } catch (e) {
      console.error("GET /api/client/projects/:projectId:", e);
      res.status(500).json({ error: e.message || "Failed to load project" });
    }
  });
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
