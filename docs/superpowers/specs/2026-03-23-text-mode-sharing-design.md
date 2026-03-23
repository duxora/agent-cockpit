# Text Mode & Session Sharing Design

**Date:** 2026-03-23
**Status:** Design approved, ready for implementation
**Scope:** Two interconnected features for Agent Cockpit sessions

---

## Executive Summary

Two complementary features to expand Agent Cockpit's capabilities:

1. **Text Mode** — Lightweight text-only interface for bandwidth reduction and speed, togglable per-session
2. **Session Sharing** — Secure, password-protected share links with granular access control (read-only or interactive)

Text mode is available in both the main dashboard (as a toggle) and shared links (defaults to text-only). Share links are password-protected, expire when the session ends, and permissions are configurable by the session owner.

---

## Architecture Overview

### Database Schema

**New table: `session_shares`**

Stores share configurations with access control and expiration tracking.

```sql
CREATE TABLE session_shares (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  access_level TEXT CHECK(access_level IN ('read', 'interactive')),
  password_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  expires_at INTEGER,
  accessed_at INTEGER,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX idx_session_shares_session_id ON session_shares(session_id);
CREATE INDEX idx_session_shares_expires_at ON session_shares(expires_at);
```

**Updated: `sessions` table**

Add display mode preference to track text vs. terminal mode per session.

```sql
ALTER TABLE sessions ADD COLUMN display_mode TEXT DEFAULT 'terminal' CHECK(display_mode IN ('terminal', 'text'));
```

### Data Model

```typescript
interface SessionShare {
  id: string // UUID
  sessionId: string
  accessLevel: 'read' | 'interactive'
  passwordHash: string // bcrypt hash
  createdBy: string
  createdAt: number // unix timestamp
  expiresAt: number | null // when session ends
  accessedAt: number | null // last accessed timestamp
}

interface ShareLink {
  shareId: string
  token: string // UUID, included in URL
  url: string // /share/:shareId?token=abc
}
```

---

## Backend API Endpoints

### Share Management

**POST /api/sessions/:id/shares**
Create a new share link for a session.

Request:
```json
{
  "password": "secret123",
  "accessLevel": "interactive" // or "read"
}
```

Response (200):
```json
{
  "shareId": "share_abc123",
  "token": "xyz789",
  "url": "https://cockpit.example.com/share/share_abc123?token=xyz789"
}
```

**GET /api/sessions/:id/shares**
List all active share links for a session (owner only).

Response (200):
```json
{
  "shares": [
    {
      "id": "share_abc123",
      "accessLevel": "read",
      "createdAt": 1711250400,
      "createdBy": "user@example.com",
      "accessedAt": 1711250900
    }
  ]
}
```

**DELETE /api/sessions/:id/shares/:shareId**
Revoke a share link (owner only).

Response (204): No content

**GET /api/share/:shareId?token=abc**
Validate share and return session metadata (public, no auth required).

Response (200):
```json
{
  "sessionId": "session_123",
  "accessLevel": "interactive",
  "requiresPassword": true,
  "sessionActive": true
}
```

Response (403): Invalid token or share expired

### Prompt Submission (Protected)

**POST /api/share/:shareId/prompt**
Send a prompt to a shared session (interactive shares only).

Request:
```json
{
  "token": "xyz789",
  "password": "secret123",
  "prompt": "show me the error logs"
}
```

Validation:
- Token must match share token
- Password must match password_hash (bcrypt check)
- access_level must be 'interactive'
- Session must still be active
- Share must not be expired

Response (200): Prompt submitted
Response (403): Unauthorized (invalid token/password or access_level is 'read')
Response (410): Session ended

### Display Mode

**PATCH /api/sessions/:id**
Update session display mode (owner only).

Request:
```json
{
  "displayMode": "text" // or "terminal"
}
```

Response (200): Session updated

---

## Frontend Components

### New: `src/components/SessionShareModal.tsx`

Modal dialog for creating and managing share links.

**Features:**
- Form inputs: password (required, shown as dots), access level radio buttons (View Only / Can Prompt)
- "Create Share" button → POST endpoint
- Success feedback: display share URL with copy-to-clipboard button
- List of active shares with revoke buttons (trash icon)
- Share URL is copiable; password is shown once then hidden (user must share separately)

**Props:**
```typescript
interface SessionShareModalProps {
  sessionId: string
  isOpen: boolean
  onClose: () => void
  onShareCreated?: (link: ShareLink) => void
}
```

### New: `src/components/SharedSessionView.tsx`

Public-facing view for accessing shared sessions via `/share/:shareId?token=abc`.

**Features:**
- Extracts `shareId` and `token` from URL params
- Validates share via `GET /api/share/:shareId?token=abc`
- If `requiresPassword`: show password modal, validate via prompt submission
- Display session outputs as plain text (no xterm)
- If `accessLevel === 'interactive'`: show text input for prompts at bottom
- If `accessLevel === 'read'`: outputs only, no input
- Auto-refresh outputs every 2 seconds (polling)
- Show "Session ended" message when session_active becomes false
- Graceful error handling: expired link, invalid token, session not found

**Layout:**
```
┌─────────────────────────────────┐
│ Shared Session View             │
│ (displays session.name)         │
├─────────────────────────────────┤
│                                 │
│ [Session output as text...]     │
│                                 │
├─────────────────────────────────┤
│ [Prompt input...] [Send]        │ (if interactive)
└─────────────────────────────────┘
```

### Modified: `src/components/TerminalView.tsx`

Add display mode toggle to switch between terminal and text output.

**Changes:**
- New button at top-right: "Text Mode" toggle (appears as icon or radio)
- Calls `PATCH /api/sessions/:id { displayMode: 'text' }` when toggled
- Conditionally render: if `session.displayMode === 'text'` show TextLog, else show xterm
- TextLog component: scrollable div with `<pre>` tag, monospace font, light background

### Modified: `src/components/SessionCard.tsx`

Add "Share" button and text mode toggle to session card.

**Changes:**
- New button: "Share" (link icon) → opens SessionShareModal
- New button: "Text Mode" (toggle) → calls PATCH endpoint
- SessionShareModal rendered as child component with isOpen state

---

## Data Flow

### Creating a Share Link

```
1. User clicks "Share" button in SessionCard
   ↓
2. SessionShareModal opens, user enters password + selects access level
   ↓
3. User clicks "Create Share" → POST /api/sessions/:id/shares
   ↓
4. Backend:
   - Hash password with bcrypt (cost: 10)
   - Generate random token UUID
   - Insert into session_shares table
   - Set expires_at = session.ended_at (when session ends)
   ↓
5. Backend returns { shareId, token, url }
   ↓
6. Modal displays share URL with copy button
   ↓
7. User copies URL and shares password separately (out-of-band)
```

### Accessing a Shared Session

```
1. Visitor loads /share/:shareId?token=abc
   ↓
2. SharedSessionView extracts params and calls GET /api/share/:shareId?token=abc
   ↓
3. Backend validates token matches share.token
   ↓
4. If valid:
   - If access_level === 'interactive': show password modal
   - If access_level === 'read': skip password, go to step 6
   ↓
5. User enters password
   - Client sends to backend for validation (bcrypt check)
   - If matches: proceed to step 6
   - If incorrect: show error, remain on password modal
   ↓
6. SharedSessionView displays session outputs as text
   - Auto-refresh every 2 seconds via polling /api/sessions/:id
   ↓
7. If interactive + password verified: show prompt input
   - User types prompt, clicks Send
   - POST /api/share/:shareId/prompt { token, password, prompt }
   - Prompt submitted to session
   ↓
8. When session ends: "Session ended" message shown, input disabled
```

### Text Mode Toggle

```
1. Owner clicks "Text Mode" toggle in SessionCard or TerminalView
   ↓
2. PATCH /api/sessions/:id { displayMode: 'text' }
   ↓
3. Backend updates session.display_mode
   ↓
4. Frontend receives response, re-renders TerminalView
   ↓
5. TerminalView checks session.displayMode:
   - If 'text': hide xterm, show TextLog with session.outputs
   - If 'terminal': show xterm
   ↓
6. Switch back anytime by clicking toggle again
```

---

## Error Handling & Security

### Security Measures

- **Password hashing:** Bcrypt with cost 10 (takes ~100ms to hash, prevents brute force)
- **Token randomness:** Use `crypto.randomUUID()` for token generation
- **HTTPS-only:** Share URLs should only work over HTTPS (set Secure flag on cookies)
- **Server-side validation:** Password check happens on backend only, never client-side
- **No logging:** Never log passwords or plaintext tokens in debug logs
- **Access control:** Only session owner can create/revoke shares, only session owner can view share list

### Expiration & Cleanup

- **Auto-expiration:** Links expire when session ends (expires_at is set to session.ended_at)
- **Cleanup job:** Periodic task (e.g., on session end) runs `DELETE FROM session_shares WHERE expires_at < now()`
- **Visitor experience:** If link is accessed after session ends, show "Link expired" message

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Owner revokes share while visitor is viewing | Next action (refresh, prompt) returns 403 Unauthorized |
| Session ends while shared viewer is watching | Outputs freeze, prompt input disabled, "Session ended" shown |
| Password-protected link accessed without password | 403 Forbidden on first prompt attempt |
| Token in URL is tampered with | 403 Unauthorized |
| Multiple concurrent shares for same session | All work independently, each with own password |
| Visitor tries to access share before session is created | 404 Not Found |

---

## Testing Strategy

### Backend Tests (`server/__tests__/shares.test.ts`)

```typescript
describe('Session Sharing', () => {
  test('POST /api/sessions/:id/shares creates share with token', () => {
    // POST with password, access_level → returns shareId, token, url
  })

  test('GET /api/share/:shareId?token=invalid returns 403', () => {
    // Token mismatch
  })

  test('GET /api/share/:shareId?token=valid returns session metadata', () => {
    // Validates share exists and not expired
  })

  test('POST /api/share/:shareId/prompt requires valid password for interactive links', () => {
    // Wrong password → 403
    // Correct password → 200
    // Read-only link → 403 regardless of password
  })

  test('DELETE /api/sessions/:id/shares/:shareId revokes share', () => {
    // After revoke, subsequent GET returns 403
  })

  test('Shares auto-expire when session ends', () => {
    // Set expires_at = now - 1, cleanup job deletes it
  })

  test('PATCH /api/sessions/:id updates displayMode', () => {
    // Updates session.display_mode, persists across requests
  })
})
```

### Frontend Tests

**SessionShareModal** (`src/components/__tests__/SessionShareModal.test.tsx`):
- Modal opens on button click
- Form accepts password input
- Access level selection (read/interactive) works
- Create Share button POSTs to API
- Share URL copied to clipboard
- List of active shares displays with revoke buttons

**SharedSessionView** (`src/components/__tests__/SharedSessionView.test.tsx`):
- Extracts shareId and token from URL params
- Validates share via GET /api/share
- Shows password modal if requiresPassword
- Password validation POSTs to /api/share/:id/prompt
- Displays session outputs as text
- Prompt input only visible if interactive + password verified
- Outputs auto-refresh every 2 seconds
- "Session ended" message shown when session_active is false

**SessionCard** (`src/components/__tests__/SessionCard.test.tsx`):
- Share button opens SessionShareModal
- Text Mode toggle visible and functional
- Clicking toggle calls PATCH /api/sessions/:id

**TerminalView** (`src/components/__tests__/TerminalView.test.tsx`):
- Text Mode toggle button present
- When displayMode is 'text': TextLog shown, xterm hidden
- When displayMode is 'terminal': xterm shown, TextLog hidden

---

## Success Criteria

- ✅ Share links work across browsers, platforms, and networks
- ✅ Password-protected shares require correct credentials for interactive access
- ✅ Read-only shares display outputs only, no prompting capability
- ✅ Interactive shares allow prompting after password verification
- ✅ Text mode reduces bandwidth by eliminating terminal graphics overhead
- ✅ Links expire automatically when session ends
- ✅ Session owner can revoke share at any time
- ✅ Display mode toggle persists across page reloads
- ✅ All 8 backend + 12 frontend unit tests pass
- ✅ End-to-end flow tested: create share → access via link → interact with session

---

## Implementation Order

1. **Database schema** — Add session_shares table, display_mode column
2. **Backend API** — Implement all 5 endpoints (shares CRUD + prompt)
3. **Backend tests** — 8 tests covering all endpoints and edge cases
4. **Frontend components** — SessionShareModal, SharedSessionView, TextLog
5. **Frontend integration** — Modify SessionCard, TerminalView, add route for /share/:id
6. **Frontend tests** — 12 tests covering all user flows
7. **E2E testing** — Manual flow: create share → open link → toggle text mode → send prompt
8. **Deployment** — Merge to main, deploy to Railway

---

## Dependencies & Constraints

- **Bcrypt library:** Requires `bcrypt` npm package for password hashing
- **Routing:** New route `/share/:shareId` needs to be added to Vite router
- **Database migration:** Session schema change requires migration (add display_mode column)
- **HTTPS:** Share URLs assumed to be served over HTTPS
- **Browser localStorage:** SharedSessionView may use localStorage to persist share state (optional)

---

## Open Questions

- Should share URLs include metadata in fragment (e.g., `#sessionName=xyz`) for UX?
- Should there be a limit on number of concurrent shares per session?
- Should password complexity requirements be enforced?
- Should access logs track who accessed shared sessions?

(These can be addressed in future iterations; not blocking implementation.)
