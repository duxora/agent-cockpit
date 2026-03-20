# Agent Cockpit — Product Backlog

## Priority Legend
- **P0 Critical** — Blocks daily usage, implement first
- **P1 High** — Major productivity gain, implement soon
- **P2 Medium** — Nice to have, implement when convenient
- **P3 Low** — Future consideration

---

## P0 — Critical

### ~~1. Auto-Link Local Claude Sessions via Hooks~~ ✅ DONE
**Status:** Implemented in commit db8278d (2026-03-20)
**File:** [../superpowers/specs/2026-03-20-auto-link-claude-sessions-design.md](../superpowers/specs/2026-03-20-auto-link-claude-sessions-design.md)

### ~~2. Push Notifications for Waiting Sessions~~ ✅ DONE
**Status:** Implemented in commit 35a25fb (2026-03-20)
Browser Notification API triggers when tab is hidden and a session enters waiting state. Telegram/Slack webhook integration deferred to future enhancement.

### ~~3. Quick Actions from Session Card~~ ✅ DONE
**Status:** Implemented in commit 35a25fb (2026-03-20)
Yes/No/Enter buttons appear on waiting tmux session cards.

---

## P1 — High

### ~~4. Session Templates / Presets~~ ✅ DONE
**Status:** Implemented in commit 0300c1b (2026-03-20)
SQLite-backed templates with CRUD API. Save as template from create modal.

### ~~5. Session Activity Timeline~~ ✅ DONE
**Status:** Implemented in commit 1da03ba (2026-03-20)
SessionTimeline component with event history polling.

### ~~6. Multi-Session Terminal View~~ ✅ DONE
**Status:** Implemented in commit 635a011 (2026-03-20)
Configurable grid layouts: 1x2, 2x2, 1x3, 2x3.

### ~~7. Session Search & Filter~~ ✅ DONE
**Status:** Implemented in commit 0300c1b (2026-03-20)
Search by name/cwd, filter by status (All/Waiting/Active/Idle).

### ~~8. Refresh Claude Auth Token via UI~~ ✅ DONE
**Status:** Implemented in commit 635a011 (2026-03-20)
Settings modal with token update endpoint. Token validation (sk-ant-oat prefix).

---

## P2 — Medium

### ~~9. Ring Buffer for Terminal Output Replay~~ ✅ PARTIAL
**Status:** RingBuffer class created in commit f875f14 (2026-03-20). WebSocket reconnect with exponential backoff implemented. Buffer integration with terminal WS pending.

### 10. Session Output Log & Search
**Summary:** Persist terminal output to DB. Search across all sessions for specific text (file names, error messages, commands).
**Scope:**
- Capture and store terminal snapshots periodically (every 30s)
- Full-text search endpoint: `GET /api/search?q=error+message`
- Search results link to session + timestamp
- Storage limit: keep last 24h of output per session, configurable

### 11. Project-Aware Session Grouping
**Summary:** Group sessions by project (detected from cwd). Show project-level status summary.
**Scope:**
- Auto-detect project from cwd (look for .git, package.json, etc.)
- Collapsible project groups in sidebar
- Project status badge: "2 active, 1 waiting"
- Project-level actions: kill all, pause all

### 12. Session Cost/Usage Tracking
**Summary:** Track token usage and estimated cost per session. Show in session card and aggregate dashboard.
**Scope:**
- Hook captures usage data from Claude Code (if exposed in hook payload)
- Alternatively, parse terminal output for token counts
- Display: tokens in/out, estimated cost, session duration
- Daily/weekly usage summary

### 13. Mobile-Responsive Layout
**Summary:** Make the dashboard usable on phone screens. Primary use: check status and approve permissions on the go.
**Scope:**
- Responsive breakpoints for session list (full-width cards on mobile)
- Swipe actions on session cards (swipe right = approve, swipe left = reject)
- Bottom nav bar on mobile (Sessions, Notifications, Settings)
- Terminal view: read-only on mobile (keyboard input impractical)

### 14. Dark/Light Theme Toggle
**Summary:** Currently hardcoded dark theme. Add light theme option.
**Scope:**
- CSS variables for theme colors
- Toggle button in header
- Persist preference in localStorage
- System preference detection (prefers-color-scheme)

### 15. Session Environment Variables
**Summary:** Set custom env vars when creating a session. Useful for passing API keys, config, etc.
**Scope:**
- Key-value input fields in NewSessionModal
- Template env vars (from saved templates)
- Masked display for sensitive values
- Pass to tmux session via `env` command prefix

---

## P3 — Low / Future

### 16. Session Replay
**Summary:** Record and replay terminal sessions. Useful for demos, debugging, sharing.
**Scope:**
- Record terminal output with timestamps (asciicast format)
- Playback component with speed control
- Export as .cast file (asciinema compatible)
- Share link for recorded sessions

### 17. Multi-Machine Support
**Summary:** Connect cockpit to multiple machines (local + N remote). Unified dashboard across all.
**Scope:**
- Machine registry (name, URL, auth)
- Aggregate session list from all machines
- Machine health status
- Per-machine session creation

### 18. API Key / Auth Management
**Summary:** Manage multiple auth methods (API keys, OAuth tokens) for different Claude configurations.
**Scope:**
- Named credential store (encrypted at rest)
- Select credentials when creating session
- Token expiry tracking and renewal reminders

### 19. Session Collaboration
**Summary:** Share a session view with another user. Read-only spectator mode.
**Scope:**
- Shareable session URL with temporary access token
- Multiple viewers per session
- Viewer presence indicators
- Chat/annotation overlay

### 20. Scheduled Sessions
**Summary:** Create sessions that start at a specific time or on a cron schedule.
**Scope:**
- Schedule picker in NewSessionModal
- Cron expression support for recurring sessions
- Queue display showing upcoming scheduled sessions
- Auto-kill after timeout (prevent runaway sessions)

### 21. Localhost Service Proxy
**Summary:** Reverse proxy that forwards agent-spawned dev servers (localhost:PORT) through cockpit's domain. Access agent-started apps without direct machine access.
**Inspiration:** remote-web-claude-cli's `inject-proxy.ts` rewrites localhost URLs via `/_s/PORT/` paths.
**Scope:**
- Proxy endpoint: `GET /_s/:port/*` forwards to `localhost:port`
- Rewrite HTML/JS responses to route API calls through cockpit origin
- Auth: same basic auth as cockpit
- Use case: preview agent-built UIs remotely

### 22. Plugin System for Session Types
**Summary:** Extensible session type system beyond Claude Code. Support Cursor, Copilot, custom agents.
**Scope:**
- Plugin interface: session creation, status detection, content capture
- Plugin registry with enable/disable
- Per-plugin configuration
- Community plugin sharing
