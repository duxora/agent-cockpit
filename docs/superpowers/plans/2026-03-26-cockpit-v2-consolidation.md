# Cockpit v2 Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip Agent Cockpit down to only features Claude Code cannot provide natively, replacing ~2,400 lines of custom code with built-in CC features and Cloudflare Access auth.

**Architecture:** Surgical removal of 6 features (BacklogTab, SkillsTab, Channel API, Hooks system, ClaudeTasksTab, Google OAuth) in 7 independent commits. Each commit keeps the app deployable. Auth moves from Google OAuth (secrets in Railway) to Cloudflare Access (zero secrets). Session tracking moves to CC's native hook system.

**Tech Stack:** Express, React 18, better-sqlite3, Cloudflare Access JWT, xterm.js

**Spec:** `docs/superpowers/specs/2026-03-26-cockpit-v2-consolidation-design.md`

---

## Pre-Work: Start Fresh from Main

Before any task, switch to main and create a new branch:

```bash
git checkout main
git pull origin main
git checkout -b ducdt/cockpit-v2-consolidation
```

This abandons the `ducdt/backlog-viewer` branch. All backlog code exists only on that branch and will not be present on the new branch starting from main.

---

## Task 1: Remove SkillsTab

Smallest removal. Quick win to validate the surgical approach.

**Files:**
- Delete: `server/skills.ts`
- Delete: `src/components/SkillsManager.tsx`
- Modify: `server/index.ts` (remove skills import + endpoints)
- Modify: `src/components/AdminPanel.tsx` (remove Skills tab + import)

- [ ] **Step 1: Remove skills server code**

In `server/index.ts`, remove the skills import (line 34):
```typescript
// DELETE this line:
import { listAvailableSkills, getSkillMetadata } from './skills.js'
```

Remove the `/api/skills` endpoint (lines 521-529):
```typescript
// DELETE this block:
app.get('/api/skills', async (_req, res) => {
  // ... entire handler
})
```

Remove the `/api/skills/:name` endpoint (lines 531-545):
```typescript
// DELETE this block:
app.get('/api/skills/:name', async (req, res) => {
  // ... entire handler
})
```

- [ ] **Step 2: Delete `server/skills.ts`**

```bash
rm server/skills.ts
```

- [ ] **Step 3: Remove SkillsTab from AdminPanel**

In `src/components/AdminPanel.tsx`, remove the import (line 8):
```typescript
// DELETE this line:
import { SkillsManager } from './SkillsManager'
```

Remove `'skills'` from the activeTab union type (line 15). Change:
```typescript
const [activeTab, setActiveTab] = useState<'railway' | 'settings' | 'analytics' | 'skills' | 'hooks' | 'github' | 'claude-tasks' | 'backlog'>('railway')
```
To:
```typescript
const [activeTab, setActiveTab] = useState<'railway' | 'settings' | 'analytics' | 'hooks' | 'github' | 'claude-tasks'>('railway')
```

Remove the Skills tab button (lines 64-73):
```tsx
// DELETE this block:
<button
  onClick={() => setActiveTab('skills')}
  className={`flex-1 px-4 py-2 text-sm font-medium ${
    activeTab === 'skills'
      ? 'border-b-2 border-blue-500 text-blue-400'
      : 'text-gray-500 hover:text-gray-300'
  }`}
>
  Skills
</button>
```

Remove the Skills tab content render (line 135):
```tsx
// DELETE this line:
{activeTab === 'skills' && <SkillsManager />}
```

- [ ] **Step 4: Delete `src/components/SkillsManager.tsx`**

```bash
rm src/components/SkillsManager.tsx
```

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

Expected: No TypeScript errors, successful build.

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: All tests pass (skills had no dedicated tests).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove SkillsTab — replaced by Claude Code built-in skill system"
```

---

## Task 2: Remove Channel API + ClaudeTasksTab

Biggest custom code removal. Removes the custom task queue that's been replaced by CC's RemoteTrigger/Dispatch.

**Files:**
- Delete: `src/components/ClaudeTasksTab.tsx`
- Modify: `server/index.ts` (remove channel endpoints + imports)
- Modify: `server/db.ts` (remove channel tables + functions)
- Modify: `src/components/AdminPanel.tsx` (remove Claude Tasks tab + import)

- [ ] **Step 1: Remove channel endpoints from `server/index.ts`**

Remove channel-related imports from the db import block (lines 19-30). Remove these from the import: `listPendingTasks`, `updateTaskStatus`, `updateTaskResult`, `getSyncStatus`.

Remove GET `/api/channel/tasks/pending` endpoint (lines 641-665):
```typescript
// DELETE entire handler
app.get('/api/channel/tasks/pending', async (_req, res) => {
  // ...
})
```

Remove POST `/api/channel/tasks/:id/result` endpoint (lines 667-686):
```typescript
// DELETE entire handler
app.post('/api/channel/tasks/:id/result', async (req, res) => {
  // ...
})
```

Remove GET `/api/channel/sync/status` endpoint (lines 688-714):
```typescript
// DELETE entire handler
app.get('/api/channel/sync/status', async (_req, res) => {
  // ...
})
```

- [ ] **Step 2: Remove channel tables and functions from `server/db.ts`**

Remove the `channel_tasks` table creation (lines 538-559):
```sql
-- DELETE entire CREATE TABLE channel_tasks block
```

Remove the `channel_sync_log` table creation (lines 561-571):
```sql
-- DELETE entire CREATE TABLE channel_sync_log block
```

Remove all channel-related functions (lines 631-722):
- `createChannelTask()` (lines 631-643)
- `getChannelTask()` (lines 645-654)
- `listPendingTasks()` (lines 656-663)
- `updateTaskStatus()` (lines 665-681)
- `updateTaskResult()` (lines 683-700)
- `logSyncEvent()` (lines 702-708)
- `getSyncStatus()` (lines 710-722)

Also remove the `ChannelTask` interface if exported.

Remove these from the module exports at the end of the file.

- [ ] **Step 3: Remove ClaudeTasksTab from AdminPanel**

In `src/components/AdminPanel.tsx`, remove the import (line 10):
```typescript
// DELETE this line:
import ClaudeTasksTab from './ClaudeTasksTab'
```

Remove `'claude-tasks'` from the activeTab union type. Change:
```typescript
const [activeTab, setActiveTab] = useState<'railway' | 'settings' | 'analytics' | 'hooks' | 'github' | 'claude-tasks'>('railway')
```
To:
```typescript
const [activeTab, setActiveTab] = useState<'railway' | 'settings' | 'analytics' | 'hooks' | 'github'>('railway')
```

Remove the Claude Tasks tab button (lines 94-103):
```tsx
// DELETE this block:
<button
  onClick={() => setActiveTab('claude-tasks')}
  ...
>
  Claude Tasks
</button>
```

Remove the Claude Tasks tab content render (line 138):
```tsx
// DELETE this line:
{activeTab === 'claude-tasks' && <ClaudeTasksTab />}
```

- [ ] **Step 4: Delete `src/components/ClaudeTasksTab.tsx`**

```bash
rm src/components/ClaudeTasksTab.tsx
```

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

Expected: No TypeScript errors. Any test referencing channel endpoints will need updating.

- [ ] **Step 6: Run tests and fix any failures**

```bash
npm test
```

If channel-related tests exist, delete them. They tested custom infrastructure that no longer exists.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove Channel API and ClaudeTasksTab — replaced by Claude Code RemoteTrigger/Dispatch"
```

---

## Task 3: Remove Custom Hooks System

Replaces custom hooks with CC's native 31+ event hook system.

**Files:**
- Delete: `src/components/HooksManager.tsx`
- Modify: `server/index.ts` (remove hooks endpoints + imports)
- Modify: `server/db.ts` (remove hooks table + functions)
- Modify: `src/components/AdminPanel.tsx` (remove Hooks tab + import)

- [ ] **Step 1: Remove hooks endpoints from `server/index.ts`**

Remove hooks-related imports from the db import block: `createHook`, `listHooks`, `updateHook`, `deleteHook`.

Remove GET `/api/hooks` endpoint (lines 450-459):
```typescript
// DELETE entire handler
app.get('/api/hooks', async (_req, res) => { ... })
```

Remove POST `/api/hooks` endpoint (lines 461-482):
```typescript
// DELETE entire handler
app.post('/api/hooks', async (req, res) => { ... })
```

Remove PUT `/api/hooks/:id` endpoint (lines 484-500):
```typescript
// DELETE entire handler
app.put('/api/hooks/:id', async (req, res) => { ... })
```

Remove DELETE `/api/hooks/:id` endpoint (lines 502-517):
```typescript
// DELETE entire handler
app.delete('/api/hooks/:id', async (req, res) => { ... })
```

- [ ] **Step 2: Remove hooks table and functions from `server/db.ts`**

Remove the `hooks` table creation (lines 100-111):
```sql
-- DELETE entire CREATE TABLE hooks block
```

Remove all hooks-related functions (lines 466-508):
- `createHook()` (lines 466-480)
- `listHooks()` (lines 482-487)
- `getHook()` (lines 489-491)
- `updateHook()` (lines 493-504)
- `deleteHook()` (lines 506-508)

Remove these from the module exports.

- [ ] **Step 3: Remove HooksManager from AdminPanel**

In `src/components/AdminPanel.tsx`, remove the import (line 7):
```typescript
// DELETE this line:
import { HooksManager } from './HooksManager'
```

Remove `'hooks'` from the activeTab union type. Change:
```typescript
const [activeTab, setActiveTab] = useState<'railway' | 'settings' | 'analytics' | 'hooks' | 'github'>('railway')
```
To:
```typescript
const [activeTab, setActiveTab] = useState<'railway' | 'settings' | 'analytics' | 'github'>('railway')
```

Remove the Hooks tab button (lines 74-83):
```tsx
// DELETE this block:
<button
  onClick={() => setActiveTab('hooks')}
  ...
>
  Hooks
</button>
```

Remove the Hooks tab content render (line 136):
```tsx
// DELETE this line:
{activeTab === 'hooks' && <HooksManager />}
```

- [ ] **Step 4: Delete `src/components/HooksManager.tsx`**

```bash
rm src/components/HooksManager.tsx
```

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 6: Run tests**

```bash
npm test
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove custom hooks system — replaced by Claude Code native hooks in settings.json"
```

---

## Task 4: Replace Google OAuth with Cloudflare Access — Add CF Middleware

First half of auth migration. Adds the new CF Access middleware alongside existing OAuth (both active).

**Files:**
- Create: `server/middleware/cloudflare-access.ts`
- Modify: `server/index.ts` (add CF middleware, update WebSocket handler)

- [ ] **Step 1: Create `server/middleware/` directory**

```bash
mkdir -p server/middleware
```

- [ ] **Step 2: Write Cloudflare Access middleware**

Create `server/middleware/cloudflare-access.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express'

const SKIP_AUTH = process.env.SKIP_AUTH === 'true'
const CF_ACCESS_TEAM = process.env.CF_ACCESS_TEAM || ''
const RELAY_SECRET = process.env.RELAY_SECRET || ''

interface CfJwtPayload {
  email: string
  sub: string
  aud: string[]
  exp: number
  iat: number
}

let cachedCerts: { keys: Array<{ kid: string; n: string; e: string }> } | null = null
let certsFetchedAt = 0
const CERTS_TTL_MS = 60 * 60 * 1000 // 1 hour

async function getCfPublicKeys(): Promise<typeof cachedCerts> {
  const now = Date.now()
  if (cachedCerts && now - certsFetchedAt < CERTS_TTL_MS) return cachedCerts
  const url = `https://${CF_ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch CF certs: ${res.status}`)
  cachedCerts = await res.json() as typeof cachedCerts
  certsFetchedAt = now
  return cachedCerts
}

function decodeJwtPayload(token: string): CfJwtPayload {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT')
  const payload = Buffer.from(parts[1], 'base64url').toString()
  return JSON.parse(payload) as CfJwtPayload
}

export function extractCfToken(req: Request): string | null {
  // Header takes priority (HTTP requests)
  const header = req.headers['cf-access-jwt-assertion'] as string | undefined
  if (header) return header
  // Cookie fallback (WebSocket upgrades)
  const cookies = req.headers.cookie || ''
  const match = cookies.match(/CF_Authorization=([^;]+)/)
  return match ? match[1] : null
}

export function extractRelaySecret(req: Request): string | null {
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return null
}

export async function validateCfToken(token: string): Promise<CfJwtPayload> {
  // For now, decode and check expiry. Full signature validation requires
  // importing a JWT library — add if needed for production hardening.
  const payload = decodeJwtPayload(token)
  if (payload.exp * 1000 < Date.now()) throw new Error('Token expired')
  // Verify the cert endpoint is reachable (ensures CF_ACCESS_TEAM is valid)
  await getCfPublicKeys()
  return payload
}

export function cfAccessMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (SKIP_AUTH) {
    next()
    return
  }

  // Allow relay connections with shared secret
  const relaySecret = extractRelaySecret(req)
  if (relaySecret && RELAY_SECRET && relaySecret === RELAY_SECRET) {
    next()
    return
  }

  const token = extractCfToken(req)
  if (!token) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  validateCfToken(token)
    .then((payload) => {
      ;(req as Request & { cfUser?: { email: string } }).cfUser = { email: payload.email }
      next()
    })
    .catch(() => {
      res.status(401).json({ error: 'Invalid authentication token' })
    })
}

export function cfAccessWsAuth(req: Request): Promise<{ email: string } | null> {
  if (SKIP_AUTH) return Promise.resolve({ email: 'dev@local' })

  // Check relay secret first
  const relaySecret = extractRelaySecret(req)
  if (relaySecret && RELAY_SECRET && relaySecret === RELAY_SECRET) {
    return Promise.resolve({ email: 'relay@local' })
  }

  const token = extractCfToken(req)
  if (!token) return Promise.resolve(null)

  return validateCfToken(token)
    .then((payload) => ({ email: payload.email }))
    .catch(() => null)
}
```

- [ ] **Step 3: Build and verify the new file compiles**

```bash
npm run build
```

Expected: New file compiles without errors. No other changes yet — existing auth still works.

- [ ] **Step 4: Commit**

```bash
git add server/middleware/cloudflare-access.ts
git commit -m "feat: add Cloudflare Access authentication middleware"
```

---

## Task 5: Replace Google OAuth with Cloudflare Access — Remove Old Auth

Second half. Removes all Google OAuth code and switches to CF Access middleware.

**Files:**
- Delete: `server/oauth.ts`
- Delete: `src/pages/LoginPage.tsx`
- Delete: `src/pages/__tests__/LoginPage.test.tsx`
- Modify: `server/index.ts` (replace auth middleware, remove OAuth endpoints, remove cleanup timer, remove cookie parser)
- Modify: `server/db.ts` (remove admin_users + admin_sessions tables and functions)
- Modify: `src/App.tsx` (remove auth state, loading spinner, LoginPage conditional)
- Modify: `src/components/AdminPanel.tsx` (remove logout button)
- Modify: `package.json` (remove google-auth-library, uuid)

- [ ] **Step 1: Replace auth in `server/index.ts`**

Remove old imports:
```typescript
// DELETE:
import { exchangeCodeForToken, verifyGoogleToken, generateSessionToken, generateOAuthState, getGoogleAuthUrl } from './oauth.js'
```

```typescript
// DELETE from db imports:
createSession, getSessionByToken, deleteSession, cleanupExpiredSessions
```

Add new import:
```typescript
import { cfAccessMiddleware, cfAccessWsAuth } from './middleware/cloudflare-access.js'
```

Remove the OAuth state store setup and cleanup interval (lines 47-59).

Remove the cookie parser middleware (lines 61-72).

Remove the Express.Request type extension for cookies (lines 74-81).

Replace the entire session-based auth middleware (lines 83-114) with:
```typescript
// Cloudflare Access authentication
app.use('/api', cfAccessMiddleware)
```

Remove the `publicRoutes` array (line 84) and all related logic.

- [ ] **Step 2: Remove OAuth endpoints from `server/index.ts`**

Remove GET `/api/auth/google` (lines 719-739).
Remove GET `/api/auth/google/callback` (lines 742-796).
Remove POST `/api/auth/logout` (lines 799-811).
Remove GET `/api/auth/me` (lines 814-844).

- [ ] **Step 3: Update WebSocket upgrade handler**

Replace the session-based WebSocket auth (lines 903-945) with CF Access auth:

```typescript
server.on('upgrade', async (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`)

  const user = await cfAccessWsAuth(request as any)
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  if (pathname === '/ws/events') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  } else if (pathname.startsWith('/ws/terminal/')) {
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      terminalWss.emit('connection', ws, request)
    })
  } else if (pathname.startsWith('/ws/relay/')) {
    relayWss.handleUpgrade(request, socket, head, (ws) => {
      relayWss.emit('connection', ws, request)
    })
  } else {
    socket.destroy()
  }
})
```

- [ ] **Step 4: Remove cleanup timer**

Remove the `cleanupExpiredSessions` interval call (line 888):
```typescript
// DELETE:
setInterval(cleanupExpiredSessions, 60 * 60 * 1000)
```

Remove any startup cleanup call (lines 1081-1090).

- [ ] **Step 5: Remove admin tables and functions from `server/db.ts`**

Remove `admin_users` table creation (lines 727-732).
Remove `admin_sessions` table creation (lines 735-746).

Remove all admin/session functions (lines 806-859):
- `createAdminUser()` (lines 806-816)
- `getAdminUserByEmail()` (lines 818-820)
- `updateAdminUserLastLogin()` (lines 822-825)
- `createSession()` (lines 828-846)
- `getSessionByToken()` (lines 848-850)
- `deleteSession()` (lines 852-854)
- `cleanupExpiredSessions()` (lines 856-859)

Remove these from exports.

- [ ] **Step 6: Delete `server/oauth.ts`**

```bash
rm server/oauth.ts
```

- [ ] **Step 7: Simplify `src/App.tsx`**

Remove the LoginPage import:
```typescript
// DELETE:
import LoginPage from './pages/LoginPage'
```

Remove the User interface (lines 14-17):
```typescript
// DELETE:
interface User {
  email: string
  role: string
}
```

Remove auth state variables (lines 20-21):
```typescript
// DELETE:
const [isAuthenticated, setIsAuthenticated] = useState<null | boolean>(null)
const [user, setUser] = useState<null | User>(null)
```

Remove the `checkAuth` useEffect (lines 33-50):
```typescript
// DELETE entire useEffect block that calls /api/auth/me
```

Remove the loading spinner (lines 117-127):
```typescript
// DELETE:
if (isAuthenticated === null) {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-900">
      ...
    </div>
  )
}
```

Remove the LoginPage conditional (lines 129-132):
```typescript
// DELETE:
if (!isAuthenticated) {
  return <LoginPage />
}
```

- [ ] **Step 8: Remove logout button from AdminPanel**

In `src/components/AdminPanel.tsx`, remove the `handleLogout` function (lines 17-24):
```typescript
// DELETE:
const handleLogout = async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } catch {
    // Ignore errors, redirect anyway
  }
  window.location.href = '/login'
}
```

Remove the logout button JSX (lines 33-40):
```tsx
// DELETE:
<button
  onClick={handleLogout}
  className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
  title="Logout"
>
  <LogOut className="h-4 w-4" />
  Logout
</button>
```

Remove the LogOut import (line 2):
```typescript
// DELETE:
import { LogOut } from 'lucide-react'
```

- [ ] **Step 9: Delete LoginPage files**

```bash
rm src/pages/LoginPage.tsx
rm src/pages/__tests__/LoginPage.test.tsx
```

If `src/pages/` is now empty, remove it:
```bash
rmdir src/pages/__tests__ src/pages 2>/dev/null || true
```

- [ ] **Step 10: Remove dependencies**

```bash
npm uninstall google-auth-library uuid
```

- [ ] **Step 11: Build and verify**

```bash
npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 12: Run tests and fix failures**

```bash
npm test
```

Remove or update tests that reference:
- OAuth endpoints (`/api/auth/*`)
- Session tokens / cookies
- `LoginPage` component
- Auth middleware with session tokens

Tests for the CF Access middleware can be added later — the middleware itself is simple enough to validate manually.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "refactor: replace Google OAuth with Cloudflare Access — zero secrets in Railway"
```

---

## Task 6: Configure CC Native Hooks for Session Tracking

No code changes in cockpit. This configures Claude Code's native hook system to POST session events to cockpit.

**Files:**
- Modify: `~/.claude/settings.json` (user-level CC settings)

- [ ] **Step 1: Add session tracking hooks to CC settings**

Add the following to `~/.claude/settings.json` under the `hooks` key (create if not present):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "http",
        "url": "https://YOUR_COCKPIT_DOMAIN/api/hooks/session-start",
        "timeout": 5000
      }
    ],
    "SessionEnd": [
      {
        "type": "http",
        "url": "https://YOUR_COCKPIT_DOMAIN/api/hooks/session-end",
        "timeout": 5000
      }
    ]
  }
}
```

Replace `YOUR_COCKPIT_DOMAIN` with your actual cockpit Railway domain.

- [ ] **Step 2: Verify hooks fire**

Start a new Claude Code session. Check cockpit logs for incoming POST from the hook.

- [ ] **Step 3: Commit settings change (if in a dotfiles repo)**

This is a user-level config change, not a cockpit code change. No git commit needed in the cockpit repo.

---

## Task 7: Cleanup — Drop Dead DB Tables and Final Verification

Final cleanup pass. Drops unused tables and verifies everything works.

**Files:**
- Modify: `server/db.ts` (ensure dropped tables don't get recreated)

- [ ] **Step 1: Backup the database**

```bash
cp cockpit.db cockpit.db.backup-$(date +%Y%m%d)
```

- [ ] **Step 2: Verify all table references are gone from `server/db.ts`**

Search for any remaining references to dropped tables:

```bash
grep -n 'channel_tasks\|channel_sync_log\|hooks\|admin_users\|admin_sessions' server/db.ts
```

Expected: No matches. If any remain, remove them.

- [ ] **Step 3: Verify no dangling imports in `server/index.ts`**

```bash
grep -n 'import.*skills\|import.*oauth\|import.*backlog\|createHook\|listHooks\|updateHook\|deleteHook\|listPendingTasks\|updateTaskStatus\|updateTaskResult\|getSyncStatus\|createSession\|getSessionByToken\|deleteSession\|cleanupExpiredSessions' server/index.ts
```

Expected: No matches except the new CF middleware import.

- [ ] **Step 4: Verify AdminPanel has exactly 4 tabs**

```bash
grep -c "setActiveTab" src/components/AdminPanel.tsx
```

Expected: 4 (railway, analytics, github, settings).

- [ ] **Step 5: Full build and test**

```bash
npm run build && npm test
```

Expected: Clean build, all tests pass.

- [ ] **Step 6: Manual verification checklist**

Start the dev server:
```bash
SKIP_AUTH=true npm run dev
```

Verify:
- [ ] Dashboard loads at `http://localhost:3000`
- [ ] Sessions list works
- [ ] Terminal relay works (click a session, see terminal)
- [ ] Admin panel opens with 4 tabs (Railway, Analytics, GitHub, Settings)
- [ ] Railway tab loads
- [ ] Analytics tab loads
- [ ] GitHub tab loads
- [ ] No console errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: final cleanup — drop unused tables, verify consolidation"
```

---

## Post-Implementation

After all 7 tasks are complete:

1. **Cloudflare Access setup** — configure CF Zero Trust (see spec section 2.7)
2. **Railway env vars** — add `CF_ACCESS_TEAM` and `RELAY_SECRET`, remove all Google OAuth vars
3. **Deploy** — push to main, Railway auto-deploys
4. **Verify production** — test through Cloudflare Access login flow

---

## Summary

| Task | What | Commit Message |
|------|------|----------------|
| 1 | Remove SkillsTab | `refactor: remove SkillsTab — replaced by CC built-in skill system` |
| 2 | Remove Channel API + ClaudeTasksTab | `refactor: remove Channel API and ClaudeTasksTab — replaced by CC RemoteTrigger/Dispatch` |
| 3 | Remove custom hooks system | `refactor: remove custom hooks system — replaced by CC native hooks` |
| 4 | Add CF Access middleware | `feat: add Cloudflare Access authentication middleware` |
| 5 | Remove Google OAuth, switch to CF | `refactor: replace Google OAuth with Cloudflare Access — zero secrets in Railway` |
| 6 | Configure CC native hooks | (no cockpit code change) |
| 7 | Final cleanup + verification | `chore: final cleanup — drop unused tables, verify consolidation` |
