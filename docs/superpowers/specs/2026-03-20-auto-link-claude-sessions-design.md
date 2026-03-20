# Auto-Link Local Claude Sessions with Agent Cockpit

## Goal

When a Claude Code session starts anywhere on the local machine, it automatically appears in Agent Cockpit's dashboard — no manual session creation needed. When the session ends, it disappears.

## Architecture

```
Local Terminal                          Agent Cockpit
┌─────────────────┐                    ┌──────────────────┐
│ claude session   │                   │ Express Server   │
│                  │  SessionStart     │                  │
│  Hook fires ─────┼──── HTTP POST ───►│ POST /api/hooks/ │
│                  │  registers session│ session-start    │
│                  │                   │                  │
│  Hook fires ─────┼──── HTTP POST ───►│ POST /api/hooks/ │
│  (Stop)          │  heartbeat       │ heartbeat        │
│                  │                   │                  │
│  Hook fires ─────┼──── HTTP POST ───►│ POST /api/hooks/ │
│  (SessionEnd)    │  deregisters     │ session-end      │
└─────────────────┘                    └──────────────────┘
```

Agent Cockpit maintains a parallel registry of "managed sessions" tracked via hook lifecycle events. Local sessions are monitoring-only (status, cwd, waiting state). Remote-controllable sessions are created through the cockpit UI with tmux backing.

## Design

### 1. Session Registry (server-side)

**New table in SQLite (`server/db.ts`):**
```sql
CREATE TABLE IF NOT EXISTS managed_sessions (
  id TEXT PRIMARY KEY,           -- Claude session_id
  name TEXT NOT NULL,            -- Display name (cwd basename)
  cwd TEXT NOT NULL,             -- Working directory
  status TEXT DEFAULT 'active',  -- active, idle, waiting, stopped
  started_at INTEGER NOT NULL,
  last_heartbeat INTEGER NOT NULL,
  metadata TEXT                  -- JSON: permission_mode, etc.
);

CREATE INDEX IF NOT EXISTS idx_managed_sessions_status ON managed_sessions(status);
```

**New API endpoints (server/index.ts):**

```
POST /api/hooks/session-start
  Body: { session_id, name, cwd, metadata? }
  → INSERT OR REPLACE into managed_sessions
  → Returns 200 { ok: true }

POST /api/hooks/heartbeat
  Body: { session_id, status? }
  → UPDATE last_heartbeat (and status if provided)
  → Returns 200 { ok: true }

POST /api/hooks/session-end
  Body: { session_id }
  → UPDATE status = 'stopped'
  → Returns 200 { ok: true }
```

**GET /api/sessions changes:**
Merge tmux sessions + managed sessions. Each session gets a `source` field:
```typescript
type SessionSource = 'tmux' | 'local'

// tmux sessions: source = 'tmux'
// managed sessions: source = 'local'
```

**broadcastSessions() changes:**
The WebSocket broadcast must also query managed_sessions and merge them with tmux sessions, so local sessions appear in real-time on the dashboard.

**Stale session cleanup:**
A periodic timer (every 60s) updates managed session statuses:
- No heartbeat for 5 minutes → status = 'idle'
- No heartbeat for 30 minutes → status = 'stopped'
- Stopped for > 24 hours → DELETE from table

### 2. Claude Code Hooks (client-side)

Installed in `~/.claude/settings.json` globally.

**Verified hook events** (from Claude Code docs):
- `SessionStart` — fires when session begins. Input includes `session_id`, `cwd`
- `Stop` — fires when Claude finishes responding (each turn). Input includes `session_id`
- `Notification` — fires on permission prompts. Input includes `session_id`

**Hook input schema** (JSON on stdin):
```json
{
  "session_id": "string",
  "cwd": "/path/to/project",
  "hook_event_name": "SessionStart",
  "permission_mode": "default"
}
```

**Hook configuration:**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/cockpit-register.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/cockpit-heartbeat.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/cockpit-notify.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**`cockpit-register.sh`** — called on SessionStart:
```bash
#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))")
CWD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cwd',''))")
NAME=$(basename "$CWD")

COCKPIT_URL="${COCKPIT_URL:-http://localhost:4200}"

curl -sf -X POST "$COCKPIT_URL/api/hooks/session-start" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"name\":\"$NAME\",\"cwd\":\"$CWD\"}" \
  >/dev/null 2>&1 &

exit 0
```

**`cockpit-heartbeat.sh`** — called on Stop (each turn end):
```bash
#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))")

COCKPIT_URL="${COCKPIT_URL:-http://localhost:4200}"

curl -sf -X POST "$COCKPIT_URL/api/hooks/heartbeat" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"status\":\"active\"}" \
  >/dev/null 2>&1 &

exit 0
```

**`cockpit-notify.sh`** — called on Notification (permission prompt):
```bash
#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))")

COCKPIT_URL="${COCKPIT_URL:-http://localhost:4200}"

curl -sf -X POST "$COCKPIT_URL/api/hooks/heartbeat" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"status\":\"waiting\"}" \
  >/dev/null 2>&1 &

exit 0
```

**Dependencies:** Uses `python3` (pre-installed on macOS/Linux) instead of `jq` to avoid extra dependency. Uses `curl` (universally available).

**Authentication:** Hook endpoints (`/api/hooks/*`) are exempt from basic auth since they're called from local scripts. If `COCKPIT_URL` points to a remote cockpit with auth, set `COCKPIT_AUTH` and the scripts add `-u "$COCKPIT_AUTH"`.

### 3. Session Lifecycle

```
SessionStart hook fires
  → POST /api/hooks/session-start
  → Session appears in cockpit dashboard with source='local'
  → Badge: 🖥️ Local

Stop hook fires (each turn end)
  → POST /api/hooks/heartbeat { status: 'active' }
  → Updates last_heartbeat, confirms session alive

Notification hook fires (permission prompt)
  → POST /api/hooks/heartbeat { status: 'waiting' }
  → Session card pulses in cockpit, document title updates

No heartbeat for 5 minutes
  → Server cleanup timer marks as 'idle'

No heartbeat for 30 minutes
  → Server cleanup timer marks as 'stopped'

Stopped for > 24 hours
  → Server cleanup timer deletes from DB
```

### 4. Frontend Changes

**`src/types/index.ts`:**
```typescript
export interface Session {
  name: string
  created: number
  attached: boolean
  lastActivity: number
  idleSecs: number
  status: 'active' | 'idle' | 'waiting' | 'dead' | 'stopped'
  cwd: string
  source: 'tmux' | 'local'    // NEW
  sessionId?: string           // NEW — Claude session_id for local sessions
}
```

**SessionCard.tsx:**
- Add source badge: "Local" (gray) or "Remote" (blue)
- Local sessions: show cwd and last heartbeat time
- Local sessions: no terminal view link (show "Local session" hint)
- Waiting local sessions: pulse animation same as tmux sessions

**App.tsx / sessions API:**
- `GET /api/sessions` returns merged list with `source` field
- Sort order: waiting → active → idle → stopped
- Document title counts waiting from both sources

**TerminalView.tsx:**
- No changes needed — only shown for tmux sessions

### 5. Setup Command

`scripts/setup-hooks.sh` — run once to install hooks:

```bash
#!/bin/bash
# Install cockpit hook scripts
HOOK_DIR="$HOME/.claude/hooks"
mkdir -p "$HOOK_DIR"

# Copy hook scripts
cp hooks/cockpit-register.sh "$HOOK_DIR/"
cp hooks/cockpit-heartbeat.sh "$HOOK_DIR/"
cp hooks/cockpit-notify.sh "$HOOK_DIR/"
chmod +x "$HOOK_DIR"/cockpit-*.sh

# Merge hook config into settings.json
# (uses python3 to merge JSON without overwriting existing hooks)
python3 scripts/merge-hooks.py

echo "Hooks installed. Set COCKPIT_URL if using remote cockpit."
```

Also add `npm run setup-hooks` to package.json.

### 6. Session ID Conflicts

Use `INSERT OR REPLACE` for the managed_sessions table. If Claude reuses a session_id (e.g., resumed session), the row updates with fresh timestamps. This is correct behavior — a resumed session should reset its heartbeat.

## Scope Limits

- **No remote terminal for local sessions** — monitoring-only, no tmux backing
- **No input forwarding to local sessions** — can't send keystrokes
- **No session content capture** — would require invasive terminal piping

Remote-controllable sessions are created through the cockpit UI with tmux backing.

## Success Criteria

1. Start `claude` in any terminal → session appears in cockpit within 2 seconds
2. Claude asks for permission → session shows "waiting" status in cockpit
3. Close Claude session → session transitions: active → idle (5m) → stopped (30m) → deleted (24h)
4. Multiple concurrent Claude sessions all appear independently
5. Works with both local cockpit (localhost:4200) and remote (Railway URL)
6. Hook scripts fail silently — never block or slow down Claude Code
7. WebSocket broadcast includes managed sessions for real-time updates
