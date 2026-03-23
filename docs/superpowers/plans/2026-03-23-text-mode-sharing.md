# Text Mode & Session Sharing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** Implement text-only interface mode and secure password-protected session sharing with granular access control.

**Architecture:** Backend adds `session_shares` table + 5 API endpoints with bcrypt auth. Frontend adds SessionShareModal, SharedSessionView, TextLog components, and text mode toggle in existing SessionCard/TerminalView.

**Tech Stack:** Express + better-sqlite3 (backend), React + TypeScript + bcrypt (frontend), vitest for tests

---

## File Structure

**Backend (New/Modified):**
- Create: `server/db.ts` - Add session_shares table & CRUD functions
- Modify: `server/index.ts` - Add 5 share endpoints
- Create: `server/__tests__/shares.test.ts` - 8 backend tests

**Frontend (New/Modified):**
- Create: `src/components/TextLog.tsx` - Plain text output display
- Create: `src/components/SessionShareModal.tsx` - Share creation UI
- Create: `src/components/SharedSessionView.tsx` - Public share viewer
- Modify: `src/components/SessionCard.tsx` - Add Share button & text toggle
- Modify: `src/components/TerminalView.tsx` - Add text mode conditional render
- Modify: `src/App.tsx` - Add /share/:shareId route
- Create: `src/components/__tests__/SessionShareModal.test.tsx`
- Create: `src/components/__tests__/SharedSessionView.test.tsx`
- Modify: `src/components/__tests__/SessionCard.test.tsx`
- Modify: `src/components/__tests__/TerminalView.test.tsx`

---

## Task 1: Database Schema & CRUD

**Files:**
- Modify: `server/db.ts` - Add table + functions

- [ ] Add session_shares table creation to db.exec() block
- [ ] Add createShare(sessionId, accessLevel, passwordHash, createdBy) function
- [ ] Add getShare(shareId) function
- [ ] Add listShares(sessionId) function
- [ ] Add deleteShare(shareId) function
- [ ] Add cleanupExpiredShares() function
- [ ] Add updateShareAccessTime(shareId) function
- [ ] Modify sessions table: add display_mode column in db.exec()
- [ ] Add getSession(id) function if missing
- [ ] Add updateSessionDisplayMode(id, mode) function
- [ ] Commit: `feat: add session_shares table and display_mode column`

---

## Task 2: Backend Auth & Helper Functions

**Files:**
- Modify: `server/index.ts` - Add imports and helpers

- [ ] Import bcrypt at top: `import bcrypt from 'bcrypt'`
- [ ] Import v4 UUID: `import { v4 as uuidv4 } from 'uuid'`
- [ ] Add helper: `async function hashPassword(password) { return bcrypt.hash(password, 10) }`
- [ ] Add helper: `async function verifyPassword(password, hash) { return bcrypt.compare(password, hash) }`
- [ ] Add helper: `function generateShareUrl(shareId, token) { return \`/share/\${shareId}?token=\${token}\` }`
- [ ] Commit: `feat: add auth helpers for session sharing`

---

## Task 3: POST /api/sessions/:id/shares Endpoint

**Files:**
- Modify: `server/index.ts` - Add endpoint

- [ ] Add route handler for `POST /api/sessions/:id/shares`
- [ ] Validate request body has password & accessLevel
- [ ] Hash password with bcrypt
- [ ] Generate shareId (UUID prefix with 'share_')
- [ ] Generate token (raw UUID)
- [ ] Call createShare() to store in DB
- [ ] Return { shareId, token, url }
- [ ] Handle errors: session not found (404), invalid access level (400)
- [ ] Commit: `feat: implement POST /api/sessions/:id/shares endpoint`

---

## Task 4: GET /api/sessions/:id/shares Endpoint

**Files:**
- Modify: `server/index.ts` - Add endpoint

- [ ] Add route handler for `GET /api/sessions/:id/shares`
- [ ] Call listShares(id) to fetch all shares for session
- [ ] Return array of shares (exclude passwordHash)
- [ ] Handle errors: session not found (404)
- [ ] Commit: `feat: implement GET /api/sessions/:id/shares endpoint`

---

## Task 5: DELETE /api/sessions/:id/shares/:shareId Endpoint

**Files:**
- Modify: `server/index.ts` - Add endpoint

- [ ] Add route handler for `DELETE /api/sessions/:id/shares/:shareId`
- [ ] Call deleteShare(shareId)
- [ ] Return 204 No Content
- [ ] Handle errors: share not found (404)
- [ ] Commit: `feat: implement DELETE /api/sessions/:id/shares/:shareId endpoint`

---

## Task 6: GET /api/share/:shareId?token=abc Endpoint

**Files:**
- Modify: `server/index.ts` - Add endpoint (public, no auth required)

- [ ] Add route handler for `GET /api/share/:shareId` with token param
- [ ] Validate token from query params
- [ ] Call getShare(shareId)
- [ ] Verify token matches share.token
- [ ] Check if share expired (expires_at < now)
- [ ] Call updateShareAccessTime(shareId)
- [ ] Return { sessionId, accessLevel, requiresPassword: (accessLevel === 'interactive'), sessionActive: (session.status === 'active') }
- [ ] Return 403 if token invalid or expired
- [ ] Commit: `feat: implement GET /api/share/:shareId endpoint`

---

## Task 7: POST /api/share/:shareId/prompt Endpoint

**Files:**
- Modify: `server/index.ts` - Add endpoint (public, password-protected)

- [ ] Add route handler for `POST /api/share/:shareId/prompt`
- [ ] Extract token, password, prompt from request body
- [ ] Call getShare(shareId)
- [ ] Verify token matches
- [ ] Verify share not expired
- [ ] Verify accessLevel === 'interactive'
- [ ] Call verifyPassword(password, share.passwordHash)
- [ ] If password incorrect: return 403
- [ ] Call sendKeys(sessionId, prompt) to submit prompt
- [ ] Return 200 { success: true }
- [ ] Handle errors: 403 for auth/access failures, 404 for not found, 410 for expired
- [ ] Commit: `feat: implement POST /api/share/:shareId/prompt endpoint`

---

## Task 8: PATCH /api/sessions/:id Display Mode Endpoint

**Files:**
- Modify: `server/index.ts` - Add endpoint

- [ ] Add route handler for `PATCH /api/sessions/:id`
- [ ] Extract displayMode from request body
- [ ] Validate displayMode is 'text' or 'terminal'
- [ ] Call updateSessionDisplayMode(id, displayMode)
- [ ] Return { id, displayMode }
- [ ] Handle errors: session not found (404), invalid mode (400)
- [ ] Commit: `feat: implement PATCH /api/sessions/:id for display mode`

---

## Task 9: Backend Tests

**Files:**
- Create: `server/__tests__/shares.test.ts`

- [ ] Write test: POST creates share with valid response shape
- [ ] Write test: GET /api/share with invalid token returns 403
- [ ] Write test: GET /api/share with valid token returns metadata
- [ ] Write test: POST /prompt with wrong password returns 403
- [ ] Write test: POST /prompt with correct password submits prompt
- [ ] Write test: POST /prompt on read-only share returns 403
- [ ] Write test: DELETE revokes share (next access returns 403)
- [ ] Write test: PATCH displayMode persists and retrieves correctly
- [ ] Run: `npm test -- shares.test.ts`
- [ ] All tests passing
- [ ] Commit: `test: add 8 tests for session sharing endpoints`

---

## Task 10: TextLog Component

**Files:**
- Create: `src/components/TextLog.tsx`

- [ ] Create component accepting `outputs: string[]` prop
- [ ] Render as scrollable `<pre>` with monospace font
- [ ] Add auto-scroll to bottom on outputs change
- [ ] Style: dark background, light text, 400px max-height with scroll
- [ ] Export default TextLog
- [ ] Commit: `feat: add TextLog component for text-only output display`

---

## Task 11: SessionShareModal Component

**Files:**
- Create: `src/components/SessionShareModal.tsx`

- [ ] Create component with props: `{ sessionId, isOpen, onClose, onShareCreated? }`
- [ ] Add form: password input, radio buttons for 'read' | 'interactive'
- [ ] Add "Create Share" button
- [ ] On submit: POST /api/sessions/:id/shares with password & accessLevel
- [ ] On success: display share URL with copy-to-clipboard button
- [ ] Add list of active shares with revoke buttons (call DELETE)
- [ ] Handle loading/error states
- [ ] Close modal on cancel
- [ ] Export default SessionShareModal
- [ ] Commit: `feat: add SessionShareModal component for creating shares`

---

## Task 12: SharedSessionView Component

**Files:**
- Create: `src/components/SharedSessionView.tsx`

- [ ] Create component: extract shareId & token from URL params
- [ ] On mount: GET /api/share/:shareId?token=token
- [ ] If invalid token: show "Invalid or expired link"
- [ ] If requiresPassword: show password modal
- [ ] On password submit: POST /api/share/:shareId/prompt to validate
- [ ] If valid: display session outputs using TextLog component
- [ ] If accessLevel === 'interactive': show prompt input at bottom
- [ ] If accessLevel === 'read': outputs only, no input
- [ ] Auto-refresh outputs every 2 seconds (GET /api/sessions/:id)
- [ ] Show "Session ended" when sessionActive becomes false
- [ ] Commit: `feat: add SharedSessionView component for public share access`

---

## Task 13: Integrate Text Mode Toggle in SessionCard

**Files:**
- Modify: `src/components/SessionCard.tsx:1-50`

- [ ] Add "Share" button (link icon) in header
- [ ] Add onClick handler: setShowShareModal(true)
- [ ] Add `<SessionShareModal>` component with props
- [ ] Add "Text Mode" toggle button next to Share
- [ ] On toggle: PATCH /api/sessions/:id { displayMode: newMode }
- [ ] Show current displayMode in toggle state
- [ ] Commit: `feat: add Share button and Text Mode toggle to SessionCard`

---

## Task 14: Integrate Text Mode in TerminalView

**Files:**
- Modify: `src/components/TerminalView.tsx:1-100`

- [ ] Add Text Mode toggle button at top-right
- [ ] On toggle: call PATCH /api/sessions/:id
- [ ] Add conditional render: if displayMode === 'text' show TextLog, else show xterm
- [ ] Import TextLog component
- [ ] Pass session.outputs to TextLog
- [ ] Commit: `feat: add text mode conditional rendering in TerminalView`

---

## Task 15: Add /share/:shareId Route

**Files:**
- Modify: `src/App.tsx`

- [ ] Import SharedSessionView component
- [ ] Add route handler for /share/:shareId (extract from URL)
- [ ] If route matches /share/*, render SharedSessionView instead of main layout
- [ ] Commit: `feat: add /share/:shareId route for public share access`

---

## Task 16: SessionShareModal Tests

**Files:**
- Create: `src/components/__tests__/SessionShareModal.test.tsx`

- [ ] Test: Modal opens on isOpen prop
- [ ] Test: Password input accepts and stores value
- [ ] Test: Access level radio selection works
- [ ] Test: Create Share button POSTs with correct payload
- [ ] Test: Share URL displayed on success
- [ ] Test: Copy-to-clipboard button works
- [ ] Test: List of active shares displays
- [ ] Test: Revoke button calls DELETE
- [ ] Run: `npm test -- SessionShareModal.test.tsx`
- [ ] All tests passing
- [ ] Commit: `test: add 8 tests for SessionShareModal component`

---

## Task 17: SharedSessionView Tests

**Files:**
- Create: `src/components/__tests__/SharedSessionView.test.tsx`

- [ ] Test: Extracts shareId & token from URL params
- [ ] Test: Validates share via GET /api/share
- [ ] Test: Shows password modal if requiresPassword
- [ ] Test: Password validation POSTs to /api/share/:id/prompt
- [ ] Test: Displays TextLog with session outputs
- [ ] Test: Prompt input visible only if interactive + password verified
- [ ] Test: Outputs auto-refresh every 2 seconds
- [ ] Test: "Session ended" shown when sessionActive is false
- [ ] Run: `npm test -- SharedSessionView.test.tsx`
- [ ] All tests passing
- [ ] Commit: `test: add 8 tests for SharedSessionView component`

---

## Task 18: Integration Tests

**Files:**
- Modify: `src/components/__tests__/SessionCard.test.tsx`
- Modify: `src/components/__tests__/TerminalView.test.tsx`

- [ ] SessionCard: Test Share button opens modal
- [ ] SessionCard: Test Text Mode toggle calls PATCH
- [ ] TerminalView: Test Text Mode toggle visible
- [ ] TerminalView: Test displayMode='text' shows TextLog
- [ ] TerminalView: Test displayMode='terminal' shows xterm
- [ ] Run: `npm test`
- [ ] All tests passing
- [ ] Commit: `test: update integration tests for text mode and sharing`

---

## Task 19: End-to-End Verification

- [ ] Start dev server: `npm run dev`
- [ ] Create session, verify displayMode defaults to 'terminal'
- [ ] Click Text Mode toggle, verify terminal hidden, TextLog shown
- [ ] Click Share button, set password, select 'interactive', create share
- [ ] Copy share URL, open in new incognito window
- [ ] Verify share page loads with "requires password"
- [ ] Enter wrong password, verify 403 error
- [ ] Enter correct password, verify outputs visible
- [ ] Verify prompt input visible (interactive mode)
- [ ] Send prompt from shared view, verify submitted to session
- [ ] Go back to dashboard, revoke share
- [ ] Refresh shared view, verify "Link expired"
- [ ] Create read-only share, verify prompt input hidden
- [ ] Commit: `test: verify end-to-end text mode and sharing flows`

---

## Task 20: Final Cleanup & Deploy

- [ ] Run full test suite: `npm test`
- [ ] Build: `npm run build`
- [ ] Verify no TypeScript errors
- [ ] Update docs/CHANNEL_SETUP.md with sharing section
- [ ] Commit docs: `docs: add text mode and sharing documentation`
- [ ] Create PR to main
- [ ] Deploy to Railway
- [ ] Verify endpoints live: POST share → GET share → prompt submission
- [ ] Merge PR

---

## Success Criteria

✅ All 20 backend tests passing
✅ All 16 frontend tests passing
✅ Text mode toggle works in dashboard
✅ Share links generated with passwords
✅ Password validation works
✅ Read-only vs interactive shares work
✅ Links expire when session ends
✅ Shared view accessible via URL
✅ Prompts submittable from shared view (interactive only)
✅ Build passes, no TypeScript errors
✅ E2E flow tested manually
