# Agent Cockpit v2 — Consolidation Design

## Date: 2026-03-26

## Philosophy

Claude Code is the platform. Agent Cockpit adds only what CC cannot do itself:

1. **Fleet-level visibility** — see all sessions at once from a browser
2. **Live terminal relay** — watch/control sessions remotely via web
3. **Infrastructure dashboards** — Railway deployments, GitHub PRs
4. **Persistent analytics** — aggregated session metrics over time

Everything else delegates to Claude Code's built-in features.

---

## 1. Feature Removal Plan

### 1.1 Channel API (Task Queue)

**Current**: Custom `channel_tasks` table with 6 REST endpoints, polling-based task dispatch between cockpit and Claude Code.

**Replacement**: Claude Code's native `RemoteTrigger` API and Dispatch. Tasks are created/run via CC's trigger system directly — no intermediary needed.

**Files to modify/delete**:
- `server/index.ts`: Remove `/api/channel/tasks/*` endpoints (~6 routes)
- `server/db.ts`: Remove `channel_tasks` and `channel_sync_log` tables, CRUD functions, and all exports: `createChannelTask`, `getChannelTask`, `listPendingTasks`, `updateTaskStatus`, `updateTaskResult`, `logSyncEvent`, `getSyncStatus`, `ChannelTask` interface
- `src/components/ClaudeTasksTab.tsx`: Delete entirely (~150 lines)
- Related tests

**DB changes**: Drop `channel_tasks` and `channel_sync_log` tables.

### 1.2 Custom Hooks System

**Current**: `hooks` table in SQLite, `/api/hooks/*` POST endpoints, `HooksManager.tsx` UI for managing webhook rules.

**Replacement**: Claude Code's native hooks system (`settings.json`). Supports 31+ event types with `type: "http"` for webhook POSTs. Far more complete than our 5 custom events.

**Files to modify/delete**:
- `server/index.ts`: Remove `/api/hooks/*` endpoints (~70 lines)
- `server/db.ts`: Remove `hooks` table + CRUD functions (~80 lines)
- `src/components/HooksManager.tsx`: Delete entirely (~223 lines)
- Related tests

**DB changes**: Drop `hooks` table.

### 1.3 BacklogTab

**Current**: Read-only viewer for `~/.backlog/backlog.db` with filtering and detail view. Currently on `ducdt/backlog-viewer` branch, not yet merged.

**Replacement**: Claude Code's native `tkt_*` MCP tools provide full read/write access. The desktop app and web UI surface tasks directly.

**Action**: Start fresh from main, discarding this branch entirely. If any backlog code exists on the working branch, remove `server/backlog.ts`, `src/components/BacklogTab.tsx`, and the `registerBacklogRoutes(app)` call in `server/index.ts`.

**Files affected**:
- `server/backlog.ts`: ~194 lines
- `src/components/BacklogTab.tsx`: ~581 lines
- `server/index.ts`: `registerBacklogRoutes` import and call

### 1.4 SkillsTab

**Current**: Lists available Claude Code skills via `/api/skills` endpoint.

**Replacement**: Claude Code's built-in `/` menu and skill system. Skills are first-class in CC.

**Files to modify/delete**:
- `server/index.ts`: Remove `/api/skills` endpoint (~25 lines)
- `server/skills.ts`: Delete entirely (~102 lines)
- `src/components/SkillsManager.tsx`: Delete entirely (~128 lines)

### 1.5 ClaudeTasksTab

**Current**: Shows sync status between Channel API and Claude Code task execution.

**Replacement**: Removed alongside Channel API (section 1.1). Claude Code's native `TaskCreate`/`TaskList` with `CLAUDE_CODE_TASK_LIST_ID` for cross-session sharing replaces this entirely.

**Files to modify/delete**:
- `src/components/ClaudeTasksTab.tsx`: Delete entirely (~150 lines)

### Summary of Removals

| Module | Approx Lines Removed |
|---|---|
| Channel API + sync (endpoints, db, ClaudeTasksTab) | ~415 |
| Custom hooks system (endpoints, db, HooksManager) | ~373 |
| BacklogTab (abandon branch) | ~775 |
| SkillsTab (endpoints, server/skills.ts, SkillsManager) | ~255 |
| Google OAuth (see section 2) | ~600 |
| **Total** | **~2,400** |

---

## 2. Auth Transformation: Google OAuth → Cloudflare Access

### 2.1 Current State

Google OAuth with session cookies. Requires 4 env vars in Railway:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `ADMIN_EMAIL`

Custom code: OAuth endpoints, session management, cookie handling, cleanup job, LoginPage component.

### 2.2 New State: Cloudflare Access

Cloudflare Access handles authentication at the edge. Zero secrets stored in Railway.

**Flow**:
```
Browser → Cloudflare Edge → Auth check
  ├─ Not authenticated → Cloudflare login page (Google/GitHub/OTP)
  └─ Authenticated → Forward to Railway with headers:
       Cf-Access-Jwt-Assertion: <JWT>
       Cf-Access-Authenticated-User-Email: user@example.com
       + CF_Authorization cookie (for WebSocket upgrades)
```

**Server-side validation** (~30 lines):
```typescript
// Middleware: validate Cf-Access-Jwt-Assertion header OR CF_Authorization cookie
// 1. Fetch Cloudflare's public keys from https://<team>.cloudflareaccess.com/cdn-cgi/access/certs
// 2. Verify JWT signature
// 3. Check audience matches application ID
// 4. Extract user email from JWT claims
```

### 2.3 What Gets Removed

- `server/index.ts`: OAuth endpoints (`/api/auth/google`, `/api/auth/google/callback`, `/api/auth/logout`, `/api/auth/me`), session middleware, `cleanupExpiredSessions` interval timer, cookie parser middleware, `publicRoutes` array, `Express.Request.cookies` type extension
- `server/oauth.ts`: Delete entirely (~128 lines) — contains `exchangeCodeForToken`, `verifyGoogleToken`, `generateSessionToken`, `generateOAuthState`
- `server/db.ts`: `admin_users` and `admin_sessions` tables + CRUD (~140 lines)
- `src/pages/LoginPage.tsx`: Delete entirely
- `src/pages/__tests__/LoginPage.test.tsx`: Delete entirely
- `src/App.tsx`: Remove `isAuthenticated` state, `User` interface, `checkAuth` useEffect, conditional `LoginPage` render, auth loading spinner. Simplify to always render dashboard (Cloudflare guarantees auth before page loads).
- `src/components/AdminPanel.tsx`: Remove logout button logic
- Dependencies: `google-auth-library`, `uuid`

### 2.4 What Gets Added

- `server/middleware/cloudflare-access.ts`: JWT validation middleware (~30 lines)
  - Validates `Cf-Access-Jwt-Assertion` header for HTTP requests
  - Validates `CF_Authorization` cookie for WebSocket upgrade requests (Cloudflare Access sets this cookie automatically in the browser)
- One env var: `CF_ACCESS_TEAM` (not a secret — just the team name)
- Optional env var: `CF_ACCESS_AUD` (application audience tag, also not secret)

### 2.5 WebSocket Authentication

**Browser WebSocket connections**: Cloudflare Access sets a `CF_Authorization` cookie in the browser. This cookie is automatically sent during WebSocket upgrade requests. The server validates this cookie using the same JWT verification as HTTP requests.

**Relay connections from local machines**: The `cockpit-relay` binary connects directly to the server from local Claude Code sessions. These connections do not go through Cloudflare. Options:

1. **Relay API key** (recommended): Add a `RELAY_SECRET` env var. Relay sends it as `Authorization: Bearer <secret>` header. Simple, works for single-user setup.
2. **CF Service Token**: Create a Cloudflare Access Service Token for machine-to-machine auth. More enterprise but overkill for personal use.
3. **Exempt relay path**: Exclude `/ws/relay/` from CF Access policy. Least secure but simplest.

Recommendation: Option 1 (relay API key). Single env var, no Cloudflare complexity for relay auth.

### 2.6 Auth Migration Sub-Steps (Step 5 in Surgical Order)

Because auth touches both HTTP and WebSocket paths, break it into sub-steps:

1. **5a**: Add CF Access middleware alongside existing OAuth (both active)
2. **5b**: Switch HTTP endpoints to CF auth, verify dashboard works
3. **5c**: Switch WebSocket upgrade handler to CF auth (header + cookie), verify terminal relay
4. **5d**: Add relay API key auth for cockpit-relay connections
5. **5e**: Remove old OAuth code (endpoints, LoginPage, cookie parser, session cleanup timer, oauth.ts, db tables)

### 2.7 Cloudflare Setup (One-Time)

1. Add Railway domain to Cloudflare DNS (proxy mode)
2. Zero Trust dashboard → Access → Applications → Add self-hosted app
3. Set application URL to cockpit domain
4. Add policy: Allow → Emails → your email, via Google IdP
5. Done. All requests to cockpit domain now require Cloudflare login.

### 2.8 Dev Mode

Keep `SKIP_AUTH=true` env var for local development. When set, bypass CF header validation for **both HTTP and WebSocket** paths. This fixes a pre-existing gap where the current WebSocket upgrade handler does not check `SKIP_AUTH`.

---

## 3. Session Tracking Transformation

### 3.1 Current State

Custom hooks POST to `/api/hooks/session-start`, `/api/hooks/heartbeat`, `/api/hooks/session-end`. Agent Cockpit maintains its own session state.

### 3.2 New State

Configure Claude Code's native hooks in the user-level settings (`~/.claude/settings.json`) so they apply to all projects:

```json
{
  "hooks": {
    "SessionStart": [{ "type": "http", "url": "https://cockpit.example.com/api/sessions/start" }],
    "SessionEnd": [{ "type": "http", "url": "https://cockpit.example.com/api/sessions/end" }],
    "SubagentStart": [{ "type": "http", "url": "https://cockpit.example.com/api/sessions/subagent-start" }],
    "TaskCompleted": [{ "type": "http", "url": "https://cockpit.example.com/api/sessions/task-completed" }]
  }
}
```

Same data flow, but configuration lives in CC's native system instead of cockpit's custom hooks table. The cockpit API endpoints that receive these events remain — they just get called by CC's hook system instead of our custom one.

---

## 4. What Stays (Unique Value)

| Feature | Justification |
|---|---|
| **Live terminal relay** (xterm.js + WebSocket + cockpit-relay) | No fleet terminal viewer in CC |
| **Session fleet dashboard** | CC manages 1 session; cockpit shows N sessions |
| **Railway integration** (deployments, metrics, env vars) | Infrastructure monitoring |
| **GitHub PR dashboard** | Centralized multi-repo PR view |
| **Analytics** (session_metrics, service_metrics) | Persistent aggregated metrics over time |
| **Session templates** | Quick-launch presets for common agent configurations |
| **Managed sessions** (tmux-based) | Persistent sessions across reconnects |

**Known limitation**: `github_config` table stores a GitHub API token in plaintext in the SQLite database. This is inconsistent with the "zero secrets in Railway" philosophy for auth but is acceptable for now since the token is stored in the database file (not env vars) and only accessible to the server process. Future improvement: move to CF Access Service Token or GitHub App auth.

---

## 5. AdminPanel After Cleanup

### Before (8 tabs)
Railway, Analytics, Skills, Hooks, GitHub, Claude Tasks, Backlog, Settings

### After (4 tabs)
Railway, Analytics, GitHub, Settings

Settings tab retains its current placeholder content for future configuration needs.

---

## 6. Database After Cleanup

### Keep
- `session_events` — session lifecycle events
- `managed_sessions` — active Claude sessions with heartbeat
- `session_templates` — quick-launch presets
- `deployments` — Railway deployment history
- `service_metrics` — CPU, memory, uptime
- `session_metrics` — duration, tokens, cost
- `github_config` — GitHub API config

### Drop
- `channel_tasks` — replaced by RemoteTrigger
- `channel_sync_log` — no longer needed
- `hooks` — replaced by CC native hooks
- `admin_users` — replaced by Cloudflare Access
- `admin_sessions` — replaced by Cloudflare Access

**Note**: Dropping tables is not reversible. Take a backup of `cockpit.db` before running cleanup step.

---

## 7. Surgical Removal Order

Each step is a separate commit/PR, keeping the app deployable throughout:

1. **Remove BacklogTab** — abandon current branch, start fresh from main
2. **Remove SkillsTab** — smallest removal, quick win (server/skills.ts + SkillsManager.tsx + endpoint)
3. **Remove Channel API + ClaudeTasksTab** — biggest custom code removal (all channel exports from db.ts)
4. **Remove custom hooks system** — HooksManager + hooks table + endpoints
5. **Replace Google OAuth with Cloudflare Access** — auth transformation (sub-steps 5a-5e, see section 2.6)
6. **Configure CC native hooks** — point SessionStart/End to cockpit endpoints in `~/.claude/settings.json`
7. **Cleanup** — remove unused dependencies, drop DB tables (with backup), update tests

**Rollback**: Each step is a git commit. Rollback via `git revert <commit>`. For step 7 (DB table drops), restore from the backup taken before that step.

---

## 8. Dependencies Removed

- `google-auth-library` — OAuth no longer handled server-side
- `uuid` — was used for session token generation

---

## 9. Risk Assessment

| Risk | Mitigation |
|---|---|
| Cloudflare Access setup complexity | Well-documented, free tier, one-time setup |
| Losing task dispatch capability | RemoteTrigger API is more capable; can trigger from mobile via Dispatch |
| Session tracking gaps during transition | Keep existing session endpoints; only change what calls them |
| Breaking existing managed sessions | Terminal relay and session management are untouched |
| WebSocket auth breaking during migration | Sub-step approach (5a-5e) keeps both auth systems active during transition |
| Relay connections rejected by CF Access | Relay API key auth bypasses CF for machine-to-machine connections |
| DB table drops irreversible | Backup cockpit.db before cleanup step |

---

## 10. Success Criteria

- ~2,400 lines of custom code removed
- Zero secrets stored in Railway env vars for auth
- AdminPanel reduced from 8 to 4 tabs
- 5 DB tables dropped
- 2 npm dependencies removed
- All remaining features work: terminal relay, fleet dashboard, Railway, GitHub, analytics
- WebSocket connections work for both browser (CF cookie) and relay (API key)
- Dev mode (`SKIP_AUTH=true`) works for both HTTP and WebSocket paths locally

---

## Appendix A: Complete File Inventory

### Files to DELETE
| File | Lines | Step |
|---|---|---|
| `server/backlog.ts` | ~194 | 1 |
| `src/components/BacklogTab.tsx` | ~581 | 1 |
| `server/skills.ts` | ~102 | 2 |
| `src/components/SkillsManager.tsx` | ~128 | 2 |
| `src/components/ClaudeTasksTab.tsx` | ~150 | 3 |
| `src/components/HooksManager.tsx` | ~223 | 4 |
| `server/oauth.ts` | ~128 | 5 |
| `src/pages/LoginPage.tsx` | ~40 | 5 |
| `src/pages/__tests__/LoginPage.test.tsx` | ~99 | 5 |

### Files to MODIFY
| File | Changes | Step |
|---|---|---|
| `server/index.ts` | Remove backlog import/routes | 1 |
| `server/index.ts` | Remove `/api/skills` endpoint, skills import | 2 |
| `server/index.ts` | Remove `/api/channel/*` endpoints | 3 |
| `server/db.ts` | Remove channel_tasks, channel_sync_log tables + all exports | 3 |
| `server/index.ts` | Remove `/api/hooks/*` endpoints | 4 |
| `server/db.ts` | Remove hooks table + CRUD | 4 |
| `server/index.ts` | Remove OAuth endpoints, session middleware, cleanup timer, cookie parser, publicRoutes | 5 |
| `server/db.ts` | Remove admin_users, admin_sessions tables + CRUD | 5 |
| `src/App.tsx` | Remove auth state, loading, LoginPage conditional | 5 |
| `src/components/AdminPanel.tsx` | Remove 4 tabs (Skills, Hooks, Claude Tasks, Backlog), remove logout button | 1-5 |
| `package.json` | Remove `google-auth-library`, `uuid` | 7 |

### Files to CREATE
| File | Lines | Step |
|---|---|---|
| `server/middleware/cloudflare-access.ts` | ~30 | 5 |

---

## Appendix B: Post-Cleanup Verification Checklist

- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] `npm test` passes all remaining tests
- [ ] Dashboard loads in browser (through Cloudflare Access)
- [ ] Live terminal relay works (browser WebSocket via CF cookie)
- [ ] Relay connections work from local machine (API key auth)
- [ ] Railway tab loads deployments and metrics
- [ ] GitHub tab loads PRs
- [ ] Analytics tab displays session metrics
- [ ] Settings tab renders
- [ ] `SKIP_AUTH=true` works locally for both HTTP and WebSocket
- [ ] Session lifecycle hooks fire from CC native hook config
