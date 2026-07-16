# SGF Central — Authentication Architecture

This document describes how authentication works in SGF Central after the staff authentication migration (releases **v0.2–v1.4**).

It is documentation only. It does not change runtime behaviour.

---

## Overview

### How staff authentication works today

SGF Central is a staff-facing Express + React application. Staff sign in with a per-user password. On successful login the server:

1. Verifies the password (bcrypt hash, with one-time upgrade from legacy plaintext where still present).
2. Creates a **server-side staff session**.
3. Sets an **HttpOnly cookie** (`sgf_staff_session`).
4. Returns the user profile to the client (legacy clients may still store a user id in `sessionStorage` and send `X-User-Id`).

For protected staff APIs, identity is resolved through a **shared staff identity helper**:

1. **Prefer** a valid session cookie.
2. **Fall back** to the legacy `X-User-Id` header when no session is present (compatibility mode).

Role checks (Admin, Sales, Managers) build on that same identity helper. They do not re-parse headers themselves.

### Why the migration was performed

Before the migration, most APIs were effectively open. Staff identity relied on a browser-held user id (`sessionStorage` + spoofable `X-User-Id`), passwords were stored in plaintext, and there was no server session. That model was unsafe for a production system used daily by staff and unsuitable as a foundation for a future secure client portal.

The migration introduced:

- Server sessions and password hashing.
- A single identity resolution path for staff routes.
- Gradual lock-down of staff API groups without breaking daily workflows or intentional public/client links.

---

## Staff Authentication

### Server-side session cookie

| Item | Detail |
|------|--------|
| Cookie name | `sgf_staff_session` |
| Type | HttpOnly session token |
| Issued by | `POST /api/auth/login` |
| Cleared by | `POST /api/auth/logout` |
| Implementation | `backend/staffSessions.js` |

Sessions are currently stored **in process memory** (Stage 1 compatibility). They do not survive a process restart and are not shared across multiple backend instances. A persistent session store (database or Redis) is the intended later improvement.

Session lifetime uses a sliding window (on the order of 12 hours) while the cookie remains valid and the session is touched.

Same-origin API calls from the SPA should send credentials (`credentials: 'same-origin'`) so the cookie is included.

### Password hashing

| Item | Detail |
|------|--------|
| Library | `bcryptjs` |
| Helpers | `backend/passwordHashing.js` |

Login accepts a stored bcrypt hash. If a legacy plaintext password still exists and matches, login succeeds and the password is **upgraded to a hash** on that successful login. New and updated staff passwords are stored hashed. Application code must never display stored password values in the UI.

### Shared staff identity helper

| Item | Detail |
|------|--------|
| Module | `backend/staffIdentity.js` |
| Introduced | v0.5 |

Primary exports:

- `resolveStaffIdentity(req)` — full identity object (`userId`, `source`, session fields when present).
- `getStaffUserIdFromRequest(req)` — numeric user id or `null`.
- `requireStaffUserId(req, res)` — resolves identity or writes **401** and returns `null`.

**Rules:**

1. Prefer a valid server session.
2. Otherwise fall back to `X-User-Id` / `x-user-id`.
3. Never parse `X-User-Id` in individual route handlers.

### Session preferred / legacy `X-User-Id` compatibility

| Priority | Source | Notes |
|----------|--------|--------|
| 1 | Session cookie | Preferred; treated as authenticated session for `GET /api/auth/session` |
| 2 | `X-User-Id` header | Legacy compatibility for older callers or post-restart gaps |
| — | Neither | Unauthenticated |

Legacy compatibility remains intentional for staff clients that still attach `X-User-Id`. New work must not depend on the header as the primary model.

### Admin helpers

Admin checks use the shared identity helper, then `user_access_permissions` with area **`admin`**.

Typical pattern on Admin-only staff routes:

1. `requireStaffUserId` → **401** if unauthenticated.
2. `isAdminRequest` → **403** if authenticated but not Admin.

Examples: user administration, settings writes, many Maps endpoints, destructive project actions (delete / clear drawings / reset window data).

### Sales (and related) helpers

Sales and related grants also resolve identity via the shared helper, then check `user_access_permissions`:

- **Sales** — Hotlist APIs (`requireHotlistSalesAccess` / `isSalesRequest`).
- **Managers** (and combinations) — used where Status Manager / substatus catalogue access is required (`requireSubstatusAccess`).

Always: identity first (401), then grant (403). Do not invent parallel header parsing for roles.

### Migration releases (staff)

| Release | Focus |
|---------|--------|
| v0.2 | Server sessions + cookie |
| v0.3 | Session verification on app start |
| v0.4 | Password hashing |
| v0.5 | Central staff identity helper |
| v0.6 | Messages |
| v0.7 | User identity / preferences / themes |
| v0.8 | Administration APIs |
| v0.9 | Settings |
| v1.0 | Hotlist |
| v1.1 | Email |
| v1.2 | Projects (staff routes) |
| v1.3 | Drawings & file path APIs |
| v1.4 | Remaining staff endpoints (Maps, BenBox, pricing, playground, Variations files, Project PUT with portal carve-out, etc.) |

**Staff authentication migration is considered complete** as of v1.4. Residual public and portal capability endpoints are intentional and separate (see below).

### Project PUT portal carve-out

`PUT /api/projects/:id` requires staff identity for normal staff updates.

Unauthenticated requests are still allowed only when the body is limited to the **client colour / 3d-vis portal field set** (the existing public colour-page workflow). That carve-out is narrow by design; it is not a general unauthenticated project editor.

Clear-drawings on the same route remains Admin-only (401 then 403).

---

## Public Endpoints

These remain reachable without a staff session. That is intentional.

| Area | Examples | Why public |
|------|----------|------------|
| Health | `GET /health` | Ops / uptime checks |
| Login | `POST /api/auth/login`, `GET /api/users/names` | Must work before a session exists |
| Session probe / logout | `GET /api/auth/session`, `POST /api/auth/logout` | Probe reports auth state; logout clears cookie |
| Static / SPA assets | e.g. `GET /api/assets/alien.png`, frontend static | Non-sensitive presentation assets |
| Project by access token | `GET /api/projects/:id` | Opaque `access_token` in the URL (numeric ids rejected) |
| Client colour / concept | `POST .../update-colours`, `POST .../approve-concept` | Email / client page workflows without staff login |
| Variation approval | `GET /api/projects/variations/approve?token=...` | Strong single-use approval token + expiry |
| Portal capability APIs | `/api/portal/...` | Separate capability model (see Portal) |

Do **not** fold these into staff-session auth without a deliberate product decision. Doing so would break client email links and portal pages.

---

## Portal Authentication

### Current architecture

The existing `/portal` experience and related `/api/portal/*` routes use a **capability-token** model based on `projects.access_token` (and related filters such as Design Phase listing), **not** the staff session cookie.

Staff authentication and portal authentication are **intentionally separate**:

| Concern | Staff | Portal (today) |
|---------|-------|----------------|
| Identity store | `users` | Project capability (`access_token`) |
| Credential | Password + session cookie | Knowledge of opaque token / link |
| Helper | `staffIdentity.js` | Token resolution in portal/project helpers |
| Purpose | Daily internal tools | Limited client-facing views / files |

### Important constraints

- Do not require staff session cookies on portal capability routes.
- Do not reuse `X-User-Id` as a “client” identity.
- Portal list enumeration and DTO overexposure remain known hardening topics for a later portal-specific track.

### Future client login

A future secure client portal should use its **own** authentication model (see below), not an extension of staff sessions or `users`.

---

## Developer Guidelines

When adding or changing APIs:

1. **Never read `X-User-Id` directly** in route handlers or new helpers.
2. **Always use** `getStaffUserIdFromRequest` / `requireStaffUserId` / `resolveStaffIdentity` from `backend/staffIdentity.js`.
3. **Prefer the server session**; treat the header only as legacy fallback via the shared helper.
4. For privileged areas: **401 (identity) then 403 (grant)** — e.g. Admin / Sales helpers already in `server.js`.
5. **Do not duplicate** session parsing, cookie names, or permission SQL in new modules.
6. **Preserve compatibility** where product still requires it (portal tokens, approval links, Project PUT colour carve-out).
7. **Do not** put staff-session gates on intentional public or capability-token routes.
8. Prefer small, reviewable auth-only changes when tightening older endpoints.

### Quick checklist for a new staff endpoint

```text
□ Call requireStaffUserId(req, res) (or getStaffUserIdFromRequest with an explicit 401)
□ If role-restricted, use existing isAdminRequest / isSalesRequest / shared grant helpers
□ Do not parse cookies or X-User-Id yourself
□ Confirm the SPA sends credentials on same-origin fetches
□ Confirm the endpoint is not needed by public client/portal links
```

---

## Future Client Portal

The intended architecture for a real client portal is **separate** from staff auth:

| Piece | Intent |
|-------|--------|
| Client accounts | Own table(s); **not** the staff `users` table |
| Client sessions | Own cookie / token model; not `sgf_staff_session` |
| Memberships | Explicit client ↔ project (or job) membership |
| Permissions | Client-scoped capabilities, not `user_access_permissions` staff areas |
| Staff tooling | Continues on staff sessions + grants as today |

### Principles

- Do not overload staff login for customers.
- Do not treat `projects.access_token` as a long-term substitute for client identity (it may remain as a migration/compatibility bridge).
- Keep staff and client session cookies and stores isolated.
- Design DTOs so clients never receive internal staff-only fields (costs notes paths, etc.) by accident.

---

## Key source files

| File | Role |
|------|------|
| `backend/staffSessions.js` | Session create / validate / destroy, cookie name |
| `backend/staffIdentity.js` | Shared identity resolution |
| `backend/passwordHashing.js` | Hash / verify / upgrade |
| `backend/portalRoutes.js` | Portal capability APIs |
| `backend/projectAccessToken.js` | Project `access_token` helpers |
| `frontend/src/utils/auth.js` | Client auth headers / session helpers |
| `frontend/src/main.jsx` | Fetch patch: API headers + `credentials: 'same-origin'` |

---

## Status

**Staff authentication migration: complete (v1.4).**

Portal capability hardening and a future client-account portal remain **separate** workstreams and must not be implemented by extending staff sessions.
