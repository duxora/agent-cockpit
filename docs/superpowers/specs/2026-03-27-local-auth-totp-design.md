# Local Auth with TOTP 2FA

**Date:** 2026-03-27
**Status:** Approved
**Replaces:** Cloudflare Access as default auth (CF Access retained, selectable via env var)

## Summary

Single-admin username/password authentication with TOTP-based two-factor authentication. Cloudflare Access middleware stays in the codebase, selectable via `AUTH_MODE` env var.

## Auth Mode Selection

| `AUTH_MODE` value | Behavior |
|-------------------|----------|
| `local` (default) | Username/password + TOTP 2FA |
| `cloudflare` | Existing Cloudflare Access middleware |

The server reads `AUTH_MODE` at startup and wires the corresponding middleware. Only one is active at a time.

## Login Flow

```
1. User submits username + password
2. Server validates against bcrypt hash
3. Server returns pending_2fa token (short-lived, 5 min)
4. User enters 6-digit TOTP code
5. Server validates TOTP against stored secret
6. Server issues session cookie (HTTP-only, 30-day expiry)
```

## First-Run Setup

When no admin user exists in the database, the app enters setup mode:

1. User sets username + password
2. Server generates TOTP secret, returns QR code URI
3. User scans QR with authenticator app (Google Authenticator, Authy, etc.)
4. User confirms with a TOTP code to verify setup works
5. Account created, redirected to login

## Database Schema

### `admin_user` (single row)

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key |
| username | TEXT | Unique, not null |
| password_hash | TEXT | bcrypt, cost 12 |
| totp_secret | TEXT | Encrypted at rest |
| totp_enabled | INTEGER | 0 or 1 |
| created_at | TEXT | ISO 8601 |

### `admin_sessions`

| Column | Type | Notes |
|--------|------|-------|
| token | TEXT | Primary key, crypto.randomUUID() |
| user_id | INTEGER | FK to admin_user.id |
| expires_at | TEXT | ISO 8601, 30 days from creation |
| user_agent | TEXT | Nullable |
| created_at | TEXT | ISO 8601 |

## API Endpoints

### Authentication

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/login` | Public | Validate credentials, return pending_2fa token |
| POST | `/api/auth/verify-totp` | Public (needs pending token) | Validate TOTP, issue session cookie |
| POST | `/api/auth/logout` | Session | Clear session |
| GET | `/api/auth/me` | Session | Current user info + session expiry |

### Setup (only available when no admin user exists)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/auth/setup-status` | Public | Returns `{ needsSetup: boolean }` |
| POST | `/api/auth/setup` | Public (guarded) | Create admin + generate TOTP secret, returns QR URI |
| POST | `/api/auth/setup/confirm-totp` | Public (guarded) | Verify TOTP code, finalize account |

Setup endpoints return 403 once an admin user exists.

### Request/Response Examples

**POST /api/auth/login**
```json
// Request
{ "username": "admin", "password": "secret" }

// Success → 200
{ "pendingToken": "uuid", "requires2fa": true }

// Bad credentials → 401
{ "error": "Invalid credentials" }
```

**POST /api/auth/verify-totp**
```json
// Request
{ "pendingToken": "uuid", "code": "123456" }

// Success → 200 (sets session cookie)
{ "user": { "username": "admin" } }

// Bad code → 401
{ "error": "Invalid TOTP code" }
```

**POST /api/auth/setup**
```json
// Request
{ "username": "admin", "password": "strongpassword" }

// Success → 200
{ "totpUri": "otpauth://totp/AgentCockpit:admin?secret=BASE32&issuer=AgentCockpit", "qrDataUrl": "data:image/png;base64,..." }
```

**POST /api/auth/setup/confirm-totp**
```json
// Request
{ "code": "123456" }

// Success → 200 (sets session cookie, user is logged in)
{ "user": { "username": "admin" } }
```

## Frontend Components

### Pages

- **`SetupPage`** — First-run wizard: create account form → QR code display → TOTP confirmation
- **`LoginPage`** — Two-step form: username/password → TOTP code input
- **`App.tsx`** — Checks `/api/auth/setup-status` and `/api/auth/me` on mount, routes to setup/login/dashboard

### Auth State Machine

```
[Loading] → check setup-status
  → needsSetup=true → [SetupPage]
  → needsSetup=false → check /api/auth/me
    → authenticated → [Dashboard]
    → not authenticated → [LoginPage]
```

## Security

| Concern | Mitigation |
|---------|------------|
| Password storage | bcrypt, cost factor 12 |
| TOTP compliance | RFC 6238, 30-second window, ±1 step tolerance |
| Session tokens | crypto.randomUUID(), HTTP-only cookie, SameSite=Strict, Secure in production |
| TOTP secret at rest | Encrypted with `ENCRYPTION_KEY` env var (AES-256-GCM) |
| Brute force | 5 failed attempts → 15-minute lockout (in-memory counter) |
| Session cleanup | Hourly job deletes expired sessions |
| Setup endpoints | Disabled (403) once admin user exists |

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `AUTH_MODE` | No | `local` | `local` or `cloudflare` |
| `ENCRYPTION_KEY` | Yes (local mode) | — | AES-256-GCM key for TOTP secret encryption. 32-byte hex string. |
| `SESSION_SECRET` | No | Auto-generated | Signs session cookies. Persists across restarts if set. |

## Dependencies

| Package | Purpose |
|---------|---------|
| `bcrypt` | Password hashing |
| `otpauth` | TOTP generation and validation |
| `qrcode` | QR code generation for TOTP setup |

## What Changes

- **New files:** `server/middleware/local-auth.ts`, `server/auth/`, `src/pages/LoginPage.tsx`, `src/pages/SetupPage.tsx`
- **Modified:** `server/index.ts` (auth mode switch), `src/App.tsx` (auth routing), `server/db.ts` (new tables)
- **Kept:** `server/middleware/cloudflare-access.ts` (unchanged, used when `AUTH_MODE=cloudflare`)
- **Removed:** Nothing

## Out of Scope

- Multi-user support / registration
- Password reset flow (single user can re-run setup if needed)
- SMS 2FA
- OAuth providers
