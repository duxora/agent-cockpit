# Google OAuth Authentication Design

**Date:** 2026-03-23
**Status:** Design approved, ready for implementation
**Scope:** Replace HTTP Basic auth with Google OAuth + session-based authentication

---

## Executive Summary

Replace hardcoded admin credentials stored in Railway environment variables with Google OAuth authentication. After initial login via Google, users receive a session token stored in HTTP-only cookies for subsequent requests. Only the configured admin email address can access the dashboard.

**Key Changes:**
- Remove dependency on `COCKPIT_PASSWORD` environment variable
- Implement OAuth 2.0 flow with Google as identity provider
- Session-based auth after initial login (no repeated OAuth requests)
- Email-based access control (only `ADMIN_EMAIL` can access)
- Shared session links remain public (password-protected independently)

---

## Architecture Overview

### Authentication Flow

```
1. User visits / (unauthenticated)
   ↓
2. Redirected to /login page
   ↓
3. Clicks "Sign in with Google"
   ↓
4. Redirected to Google OAuth consent screen
   ↓
5. User approves → Google redirects to /api/auth/google/callback with auth code
   ↓
6. Backend exchanges code for ID token
   ↓
7. Backend validates email matches ADMIN_EMAIL
   ↓
8. Backend creates session, sets HTTP-only cookie
   ↓
9. Browser redirected to /dashboard
   ↓
10. Subsequent requests use session cookie (no OAuth overhead)
```

### Database Schema

**New table: `admin_sessions`**

Stores session tokens and metadata for authenticated users.

```sql
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  last_activity INTEGER DEFAULT (unixepoch()),
  user_agent TEXT
);

CREATE INDEX idx_admin_sessions_user_email ON admin_sessions(user_email);
CREATE INDEX idx_admin_sessions_expires_at ON admin_sessions(expires_at);
```

**New table: `admin_users`** (for future multi-user support)

```sql
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at INTEGER DEFAULT (unixepoch()),
  last_login INTEGER
);
```

### Data Model

```typescript
interface AdminSession {
  id: string
  userEmail: string
  sessionToken: string
  expiresAt: number
  createdAt: number
  lastActivity: number
  userAgent?: string
}

interface AuthUser {
  email: string
  role: 'admin'
}
```

---

## Backend API Endpoints

### OAuth Flow Endpoints

**GET /api/auth/google**
Initiates Google OAuth flow.

Response (302 Redirect):
```
Location: https://accounts.google.com/o/oauth2/v2/auth?
  client_id=...&
  redirect_uri=http://localhost:4200/api/auth/google/callback&
  response_type=code&
  scope=openid email
```

**GET /api/auth/google/callback**
Handles OAuth callback from Google.

Query Params:
```
?code=auth_code_from_google&state=csrf_token
```

Backend Logic:
1. Validate `state` parameter (CSRF protection)
2. Exchange `code` for ID token from Google
3. Extract email from ID token
4. Validate email matches `ADMIN_EMAIL` env var
5. Create session in `admin_sessions` table
6. Set HTTP-only cookie with session token
7. Redirect to `/dashboard`

Response (302 Redirect):
```
Location: /dashboard
Set-Cookie: session_token=...; HttpOnly; SameSite=Strict; Max-Age=2592000
```

Errors:
- 401: Email not authorized
- 400: Invalid OAuth state
- 500: Token exchange failed

**POST /api/auth/logout**
Clears current session.

Request:
```json
{}
```

Response (200):
```json
{ "success": true }
```

Backend Logic:
1. Get session token from cookie
2. Delete from `admin_sessions` table
3. Clear cookie
4. Redirect to `/login`

**GET /api/auth/me**
Returns current authenticated user.

Response (200):
```json
{
  "email": "user@example.com",
  "role": "admin"
}
```

Response (401):
```json
{ "error": "Unauthorized" }
```

---

## Frontend Components

### New: Login Page (`src/pages/LoginPage.tsx`)

Simple login page with Google OAuth button.

```typescript
interface LoginPageProps {}

// Features:
- Display "Agent Cockpit" header
- "Sign in with Google" button
- Links to /api/auth/google
- Redirect to /dashboard if already authenticated
- Handle OAuth errors (show error message)
```

**Route:** `/login`

### Modified: App.tsx Router

Add route detection and auth checks:

```typescript
// Check if user is authenticated
- Authenticated → show /dashboard
- Not authenticated → redirect to /login
- Shared links (/share/*) → no auth check
- Public routes (/health, /api/hooks) → no auth check
```

**Protected Routes:**
- `/dashboard` → requires auth
- `/` → redirects to `/dashboard` if authenticated, `/login` if not

**Public Routes:**
- `/login` → always accessible
- `/share/:shareId` → always accessible (password-protected)
- `/health` → always accessible
- `/api/hooks` → always accessible

### Modified: Dashboard Header

Add logout button in top-right corner:

```tsx
<button
  onClick={handleLogout}
  className="text-white px-3 py-1 bg-red-600 hover:bg-red-700 rounded"
>
  Logout
</button>
```

---

## Backend Implementation Details

### Environment Variables

**Required:**
```bash
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REDIRECT_URI=http://localhost:4200/api/auth/google/callback (or production URL)
ADMIN_EMAIL=your.email@gmail.com
```

**Optional (no longer needed):**
- `COCKPIT_PASSWORD` (deprecated, can be removed)
- `COCKPIT_USER` (deprecated, can be removed)

### Session Management

**Session Duration:**
- Created: When user completes OAuth
- Expires: 30 days from creation
- Inactive cleanup: Sessions older than 30 days auto-deleted
- Activity tracking: `last_activity` updated on each request (optional)

**Session Validation:**
- Middleware checks `session_token` cookie on every request
- Validates token exists and not expired in `admin_sessions` table
- If invalid or expired: clear cookie, return 401

**Cleanup Task:**
- Periodic job (runs daily or on startup): Delete expired sessions
- SQL: `DELETE FROM admin_sessions WHERE expires_at < unixepoch()`

### CSRF Protection

Use standard CSRF flow for OAuth:

1. Generate random `state` token
2. Store in temporary in-memory cache or session
3. Include `state` in Google OAuth redirect
4. Validate `state` on callback
5. Clear from cache

Library: Use `crypto.randomBytes()` for token generation

### Dependencies

**New npm packages:**
- `google-auth-library` (2.0 KB) - Verify Google ID tokens
- No other OAuth library needed (implement protocol directly)

---

## Security Considerations

### Cookie Security

```javascript
Set-Cookie: session_token=<random-token>;
  HttpOnly;           // Not accessible to JavaScript
  Secure;             // HTTPS only (production)
  SameSite=Strict;    // No cross-site requests
  Max-Age=2592000;    // 30 days
  Path=/;             // All paths
```

### Email Validation

- Only email matching `ADMIN_EMAIL` env var can access
- Validated during OAuth callback (not on every request)
- Case-insensitive comparison (email addresses are case-insensitive)

### Token Security

- Session tokens: 32-byte cryptographic random (UUID v4)
- ID tokens: Cryptographically signed by Google (validated)
- No plaintext passwords stored anywhere
- No tokens in logs or error messages

### Public Routes

**Remain public (no auth):**
- `/health` - Health check endpoint
- `/api/hooks` - Webhook endpoints (can be authenticated separately if needed)
- `/api/share/:shareId` - Shared session links (password-protected)
- `/login` - Login page

**All other routes require authentication**

---

## Error Handling

| Scenario | Status | Response |
|----------|--------|----------|
| Invalid email (not ADMIN_EMAIL) | 401 | `{ error: "Email not authorized" }` |
| OAuth state mismatch (CSRF) | 400 | `{ error: "Invalid state parameter" }` |
| Token exchange failed | 500 | `{ error: "Authentication failed" }` |
| Session expired | 401 | `{ error: "Session expired" }` |
| Missing session cookie | 401 | `{ error: "Unauthorized" }` |
| Accessing protected route | 401 | Redirect to `/login` |

---

## Testing Strategy

### Backend Tests

**OAuth Flow Tests:**
- Test OAuth redirect URL generation
- Test token exchange with Google
- Test email validation
- Test unauthorized email rejection
- Test session creation
- Test session validation
- Test session expiration
- Test logout

**Auth Middleware Tests:**
- Valid session token → request succeeds
- Expired session token → 401 Unauthorized
- Missing session token → 401 Unauthorized
- Public route without token → request succeeds
- Protected route without token → 401 Unauthorized

**Database Tests:**
- Session creation and retrieval
- Session expiration queries
- Cleanup of expired sessions

### Frontend Tests

**Login Page Tests:**
- Renders "Sign in with Google" button
- Button links to `/api/auth/google`
- Redirects to `/dashboard` if already authenticated
- Shows error message on OAuth failure

**Protected Routes Tests:**
- Unauthenticated access → redirected to `/login`
- Authenticated access → show dashboard
- Logout button removes session

**Public Routes Tests:**
- `/share/:shareId` works without authentication
- `/login` always accessible
- `/health` always accessible

### Integration Tests

**Full Auth Flow:**
1. Visit `/` → redirected to `/login`
2. Click "Sign in with Google"
3. Mock Google OAuth callback
4. Receive session cookie
5. Visit `/dashboard` → page loads
6. Session persists across page reload
7. Click logout → session cleared
8. Visit `/` → redirected to `/login`

---

## Migration from Basic Auth

### Backwards Compatibility

- Basic auth middleware disabled once OAuth is enabled
- `COCKPIT_PASSWORD` env var no longer used
- Existing Basic auth credentials won't work (intentional)

### Deployment Steps

1. Set up Google OAuth credentials (create app in Google Cloud Console)
2. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `ADMIN_EMAIL` to Railway
3. Remove `COCKPIT_PASSWORD` from Railway
4. Deploy new version
5. Verify OAuth login works
6. Share new login URL with team

---

## Success Criteria

✅ Only configured admin email can access dashboard
✅ Google OAuth login works end-to-end
✅ Session persists across page reloads
✅ Session cookie is HTTP-only and secure
✅ Logout clears session completely
✅ Shared session links work without OAuth
✅ All auth endpoints tested (100% coverage)
✅ No credentials stored in plaintext
✅ CSRF protection implemented
✅ Session expiration works correctly
✅ Expired sessions auto-cleanup runs daily

---

## Implementation Order

1. **Database setup** — Create `admin_sessions` and `admin_users` tables
2. **Backend OAuth endpoints** — GET /api/auth/google, callback, logout, /me
3. **Auth middleware** — Replace Basic auth with session validation
4. **Session management** — Create, validate, cleanup logic
5. **Frontend login page** — Create LoginPage component
6. **Frontend routing** — Protect routes, handle redirects
7. **Tests** — Full test coverage for auth flow
8. **Documentation** — Update setup docs with OAuth instructions

---

## Dependencies & Constraints

- **Google Cloud Console:** Need to create OAuth 2.0 app (free tier)
- **Email requirement:** User must have Google account with same email as `ADMIN_EMAIL`
- **HTTPS (production):** OAuth requires HTTPS for Secure cookie flag
- **Deployment:** Need to configure `GOOGLE_REDIRECT_URI` for Railway URL

---

## Open Questions

- Should we support multiple admin emails in future? (Design supports it via `admin_users` table)
- Should we add audit logging of login/logout events? (Can be added later)
- Should sessions have activity-based timeout (not just absolute 30-day timeout)? (Keep simple for now)
