# Agent Cockpit — Product Backlog

## Priority Legend
- **P0 Critical** — Blocks daily usage, implement first
- **P1 High** — Major productivity gain, implement soon
- **P2 Medium** — Nice to have, implement when convenient
- **P3 Low** — Future consideration

---

## P0 — Critical

### 1. Auto-Link Local Claude Sessions via Hooks
**File:** [../superpowers/specs/2026-03-20-auto-link-claude-sessions-design.md](../superpowers/specs/2026-03-20-auto-link-claude-sessions-design.md)
**Summary:** Claude Code hooks auto-register sessions with cockpit on start, send heartbeats, and signal permission prompts. No manual session creation needed for local sessions.
**Why P0:** Without this, the cockpit only shows manually-created tmux sessions — most Claude usage is invisible.

### 2. Push Notifications for Waiting Sessions
**Summary:** Send browser push notifications (and optionally Slack/webhook) when any session enters "waiting" state. Include session name, project, and what it's waiting for.
**Why P0:** The whole point of a cockpit is to not have to stare at it. If Claude needs input at 2am, you need a ping.
**Scope:**
- Browser Notification API (requires one-time permission grant)
- Optional: webhook URL for Slack/Discord integration
- Configurable: per-session or global notification preferences
- Debounce: don't spam if session rapidly toggles waiting/active

### 3. Quick Actions from Session Card
**Summary:** Add action buttons directly on session cards for common operations without opening terminal view.
**Why P0:** Most interactions are simple approvals. Opening terminal view for each is slow.
**Scope:**
- "Yes" / "No" buttons visible when session is in "waiting" state (sends `y\n` or `n\n`)
- "Send Enter" button for "Press Enter to continue" prompts
- These work for tmux-backed sessions only (remote + cockpit-created)

---

## P1 — High

### 4. Session Templates / Presets
**Summary:** Save and reuse session configurations (name pattern, command, cwd, env vars). Quick-launch from dashboard.
**Scope:**
- Persist templates in SQLite: name, command, cwd, icon, env vars
- CRUD API for templates
- Template picker in NewSessionModal (replaces hardcoded PRESETS array)
- "Save as Template" button after creating a session
- Template categories: by project, by task type

### 5. Session Activity Timeline
**Summary:** Show a timeline of what happened in each session — when it started, when it asked for permission, what tools it used, when it completed.
**Scope:**
- Extend session_events table with richer event types
- Hook sends tool usage events (PostToolUse hook with tool name + file path)
- Timeline view component showing events chronologically
- Filterable by event type (tool use, permission, error)
- Useful for post-mortem: "what did this agent actually do?"

### 6. Multi-Session Terminal View
**Summary:** Show 2-4 terminals simultaneously with independent scroll and input. Current split view exists but is limited to first 4 sessions with no selection.
**Scope:**
- Configurable grid: 1x1, 1x2, 2x2, 1x3, 2x3
- Session selector per grid slot (dropdown)
- Independent terminal instances (each with own WebSocket)
- Drag-and-drop to rearrange
- Persist layout preference

### 7. Session Search & Filter
**Summary:** Search sessions by name, cwd, status. Filter sidebar to show only waiting, only active, etc.
**Scope:**
- Search input in sidebar header
- Filter buttons: All / Active / Waiting / Idle
- Sort options: by name, by created time, by last activity
- Keyboard shortcut: `/` to focus search

### 8. Refresh Claude Auth Token via UI
**File:** [refresh-claude-token.md](refresh-claude-token.md)
**Summary:** UI to update CLAUDE_CODE_AUTH_TOKEN on Railway without CLI access.
**Scope:**
- Settings page with token input field
- POST endpoint to update Railway env var
- Trigger redeploy after update
- Show current token status (masked)

---

## P2 — Medium

### 9. Session Output Log & Search
**Summary:** Persist terminal output to DB. Search across all sessions for specific text (file names, error messages, commands).
**Scope:**
- Capture and store terminal snapshots periodically (every 30s)
- Full-text search endpoint: `GET /api/search?q=error+message`
- Search results link to session + timestamp
- Storage limit: keep last 24h of output per session, configurable

### 10. Project-Aware Session Grouping
**Summary:** Group sessions by project (detected from cwd). Show project-level status summary.
**Scope:**
- Auto-detect project from cwd (look for .git, package.json, etc.)
- Collapsible project groups in sidebar
- Project status badge: "2 active, 1 waiting"
- Project-level actions: kill all, pause all

### 11. Session Cost/Usage Tracking
**Summary:** Track token usage and estimated cost per session. Show in session card and aggregate dashboard.
**Scope:**
- Hook captures usage data from Claude Code (if exposed in hook payload)
- Alternatively, parse terminal output for token counts
- Display: tokens in/out, estimated cost, session duration
- Daily/weekly usage summary

### 12. Mobile-Responsive Layout
**Summary:** Make the dashboard usable on phone screens. Primary use: check status and approve permissions on the go.
**Scope:**
- Responsive breakpoints for session list (full-width cards on mobile)
- Swipe actions on session cards (swipe right = approve, swipe left = reject)
- Bottom nav bar on mobile (Sessions, Notifications, Settings)
- Terminal view: read-only on mobile (keyboard input impractical)

### 13. Dark/Light Theme Toggle
**Summary:** Currently hardcoded dark theme. Add light theme option.
**Scope:**
- CSS variables for theme colors
- Toggle button in header
- Persist preference in localStorage
- System preference detection (prefers-color-scheme)

### 14. Session Environment Variables
**Summary:** Set custom env vars when creating a session. Useful for passing API keys, config, etc.
**Scope:**
- Key-value input fields in NewSessionModal
- Template env vars (from saved templates)
- Masked display for sensitive values
- Pass to tmux session via `env` command prefix

---

## P3 — Low / Future

### 15. Session Replay
**Summary:** Record and replay terminal sessions. Useful for demos, debugging, sharing.
**Scope:**
- Record terminal output with timestamps (asciicast format)
- Playback component with speed control
- Export as .cast file (asciinema compatible)
- Share link for recorded sessions

### 16. Multi-Machine Support
**Summary:** Connect cockpit to multiple machines (local + N remote). Unified dashboard across all.
**Scope:**
- Machine registry (name, URL, auth)
- Aggregate session list from all machines
- Machine health status
- Per-machine session creation

### 17. API Key / Auth Management
**Summary:** Manage multiple auth methods (API keys, OAuth tokens) for different Claude configurations.
**Scope:**
- Named credential store (encrypted at rest)
- Select credentials when creating session
- Token expiry tracking and renewal reminders

### 18. Session Collaboration
**Summary:** Share a session view with another user. Read-only spectator mode.
**Scope:**
- Shareable session URL with temporary access token
- Multiple viewers per session
- Viewer presence indicators
- Chat/annotation overlay

### 19. Scheduled Sessions
**Summary:** Create sessions that start at a specific time or on a cron schedule.
**Scope:**
- Schedule picker in NewSessionModal
- Cron expression support for recurring sessions
- Queue display showing upcoming scheduled sessions
- Auto-kill after timeout (prevent runaway sessions)

### 20. Plugin System for Session Types
**Summary:** Extensible session type system beyond Claude Code. Support Cursor, Copilot, custom agents.
**Scope:**
- Plugin interface: session creation, status detection, content capture
- Plugin registry with enable/disable
- Per-plugin configuration
- Community plugin sharing
