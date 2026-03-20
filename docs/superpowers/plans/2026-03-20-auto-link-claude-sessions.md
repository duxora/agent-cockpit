# Auto-Link Local Claude Sessions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Local Claude Code sessions auto-register with Agent Cockpit via hooks, appearing as monitoring-only entries in the dashboard.

**Architecture:** Claude Code hooks (SessionStart, Stop, Notification) POST to cockpit API endpoints. Server stores sessions in SQLite `managed_sessions` table, merges with tmux sessions in API responses and WebSocket broadcasts. Frontend shows local sessions with source badges.

**Tech Stack:** Node.js/Express (server), SQLite/better-sqlite3 (DB), React/TypeScript (frontend), Bash/Python3 (hook scripts)

**Spec:** `docs/superpowers/specs/2026-03-20-auto-link-claude-sessions-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `server/db.ts` | Add managed_sessions table + CRUD prepared statements |
| Modify | `server/index.ts` | Add hook endpoints, merge sessions in API + broadcast, cleanup timer |
| Modify | `src/types/index.ts` | Add `source` and `sessionId` fields to Session |
| Modify | `src/components/SessionCard.tsx` | Source badge, local session styling |
| Modify | `src/App.tsx` | Sort sessions, handle local session click |
| Create | `hooks/cockpit-register.sh` | SessionStart hook script |
| Create | `hooks/cockpit-heartbeat.sh` | Stop hook script |
| Create | `hooks/cockpit-notify.sh` | Notification hook script |
| Create | `scripts/setup-hooks.sh` | Install hooks to ~/.claude/ |
| Create | `scripts/merge-hooks.py` | Merge hook config into settings.json |
| Modify | `package.json` | Add `setup-hooks` script |

---

### Task 1: Database Layer — managed_sessions table and CRUD

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Add managed_sessions table creation to db.ts**

Add after the existing `session_events` table creation in `db.exec()`:

```typescript
// Add to the existing db.exec() template literal:

CREATE TABLE IF NOT EXISTS managed_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cwd TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  started_at INTEGER NOT NULL,
  last_heartbeat INTEGER NOT NULL,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_managed_sessions_status ON managed_sessions(status);
```

- [ ] **Step 2: Add prepared statements for managed session CRUD**

Add after existing prepared statements:

```typescript
const upsertManagedSession = db.prepare(
  `INSERT OR REPLACE INTO managed_sessions (id, name, cwd, status, started_at, last_heartbeat, metadata)
   VALUES (?, ?, ?, 'active', ?, ?, ?)`
)

const updateHeartbeat = db.prepare(
  `UPDATE managed_sessions SET last_heartbeat = ?, status = ? WHERE id = ?`
)

const stopManagedSession = db.prepare(
  `UPDATE managed_sessions SET status = 'stopped' WHERE id = ?`
)

const getActiveManagedSessions = db.prepare(
  `SELECT * FROM managed_sessions WHERE status != 'stopped' ORDER BY last_heartbeat DESC`
)

const cleanupIdleSessions = db.prepare(
  `UPDATE managed_sessions SET status = 'idle' WHERE status = 'active' AND last_heartbeat < ?`
)

const cleanupStoppedSessions = db.prepare(
  `UPDATE managed_sessions SET status = 'stopped' WHERE status IN ('active', 'idle') AND last_heartbeat < ?`
)

const deleteOldSessions = db.prepare(
  `DELETE FROM managed_sessions WHERE status = 'stopped' AND last_heartbeat < ?`
)
```

- [ ] **Step 3: Export functions**

```typescript
export interface ManagedSession {
  id: string
  name: string
  cwd: string
  status: string
  startedAt: number
  lastHeartbeat: number
  metadata: string | null
}

export function registerManagedSession(id: string, name: string, cwd: string, metadata?: string): void {
  const now = Math.floor(Date.now() / 1000)
  upsertManagedSession.run(id, name, cwd, now, now, metadata ?? null)
}

export function heartbeatManagedSession(id: string, status: string = 'active'): void {
  const now = Math.floor(Date.now() / 1000)
  updateHeartbeat.run(now, status, id)
}

export function endManagedSession(id: string): void {
  stopManagedSession.run(id)
}

export function listManagedSessions(): ManagedSession[] {
  return getActiveManagedSessions.all() as ManagedSession[]
}

export function cleanupManagedSessions(): void {
  const now = Math.floor(Date.now() / 1000)
  cleanupIdleSessions.run(now - 300)    // 5 minutes
  cleanupStoppedSessions.run(now - 1800) // 30 minutes
  deleteOldSessions.run(now - 86400)     // 24 hours
}
```

- [ ] **Step 4: Verify server starts without errors**

Run: `cd ~/workspace/tools/agent-cockpit && timeout 5 npx tsx server/index.ts 2>&1 || true`
Expected: Server starts, no SQLite errors

- [ ] **Step 5: Commit**

```bash
git add server/db.ts
git commit -m "feat: Add managed_sessions table for auto-linked Claude sessions"
```

---

### Task 2: Hook API Endpoints

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add imports from db.ts**

Add to existing imports from `./db.js`:

```typescript
import {
  logEvent, getSessionEvents, getAllRecentEvents,
  registerManagedSession, heartbeatManagedSession, endManagedSession,
  listManagedSessions, cleanupManagedSessions
} from './db.js'
```

- [ ] **Step 2: Exempt hook endpoints from basic auth**

Modify the auth middleware to skip `/api/hooks/` paths:

```typescript
// Change this line in the auth middleware:
if (req.path === '/health') return next()
// To:
if (req.path === '/health' || req.path.startsWith('/api/hooks/')) return next()
```

- [ ] **Step 3: Add hook endpoints before the SPA fallback**

Add before `// SPA fallback`:

```typescript
// --- Hook API (no auth required) ---

app.post('/api/hooks/session-start', (req, res) => {
  const { session_id, name, cwd, metadata } = req.body
  if (!session_id || !name) {
    res.status(400).json({ error: 'session_id and name are required' })
    return
  }
  registerManagedSession(session_id, name, cwd || '~', metadata ? JSON.stringify(metadata) : undefined)
  res.json({ ok: true })
})

app.post('/api/hooks/heartbeat', (req, res) => {
  const { session_id, status } = req.body
  if (!session_id) {
    res.status(400).json({ error: 'session_id is required' })
    return
  }
  heartbeatManagedSession(session_id, status || 'active')
  res.json({ ok: true })
})

app.post('/api/hooks/session-end', (req, res) => {
  const { session_id } = req.body
  if (!session_id) {
    res.status(400).json({ error: 'session_id is required' })
    return
  }
  endManagedSession(session_id)
  res.json({ ok: true })
})
```

- [ ] **Step 4: Test endpoints with curl**

```bash
# Start server, then test:
curl -s -X POST http://localhost:4200/api/hooks/session-start \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-123","name":"my-project","cwd":"/home/user/my-project"}'
# Expected: {"ok":true}

curl -s -X POST http://localhost:4200/api/hooks/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-123","status":"waiting"}'
# Expected: {"ok":true}

curl -s -X POST http://localhost:4200/api/hooks/session-end \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-123"}'
# Expected: {"ok":true}
```

- [ ] **Step 5: Commit**

```bash
git add server/index.ts
git commit -m "feat: Add hook API endpoints for session registration and heartbeat"
```

---

### Task 3: Merge Sessions in API Response and Broadcast

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Create helper to convert managed sessions to Session format**

Add after imports:

```typescript
function getMergedSessions() {
  const tmuxSessions = listSessions()
  const enrichedTmux = tmuxSessions.map((s) => {
    const content = getSessionContent(s.name, 30)
    const detectedState = detectSessionState(content)
    return {
      ...s,
      status: detectedState === 'waiting' ? 'waiting' : s.status,
      source: 'tmux' as const,
    }
  })

  const managed = listManagedSessions()
  const now = Math.floor(Date.now() / 1000)
  const managedAsSessions = managed.map((m) => ({
    name: m.name,
    created: m.startedAt,
    attached: false,
    lastActivity: m.lastHeartbeat,
    idleSecs: now - m.lastHeartbeat,
    status: m.status as 'active' | 'idle' | 'waiting' | 'dead',
    cwd: m.cwd,
    source: 'local' as const,
    sessionId: m.id,
  }))

  return [...enrichedTmux, ...managedAsSessions]
}
```

- [ ] **Step 2: Replace GET /api/sessions handler**

Replace the existing `app.get('/api/sessions', ...)` with:

```typescript
app.get('/api/sessions', (_req, res) => {
  res.json(getMergedSessions())
})
```

- [ ] **Step 3: Replace broadcastSessions()**

Replace the existing `broadcastSessions()` function:

```typescript
function broadcastSessions() {
  const all = getMergedSessions()
  const msg = JSON.stringify({ type: 'sessions', data: all })
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg)
    }
  })
}
```

- [ ] **Step 4: Add cleanup timer**

Add after `setInterval(broadcastSessions, 3000)`:

```typescript
// Cleanup stale managed sessions every 60 seconds
setInterval(cleanupManagedSessions, 60000)
```

- [ ] **Step 5: Verify merged output**

```bash
# Register a managed session, then check /api/sessions:
curl -s -X POST http://localhost:4200/api/hooks/session-start \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-merge","name":"test-project","cwd":"/tmp/test"}'

curl -s http://localhost:4200/api/sessions | python3 -m json.tool
# Expected: array containing entry with "source": "local", "name": "test-project"
```

- [ ] **Step 6: Commit**

```bash
git add server/index.ts
git commit -m "feat: Merge managed sessions with tmux sessions in API and broadcast"
```

---

### Task 4: Frontend — Types and SessionCard Source Badge

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/components/SessionCard.tsx`

- [ ] **Step 1: Update Session type**

Replace the Session interface in `src/types/index.ts`:

```typescript
export interface Session {
  name: string
  created: number
  attached: boolean
  lastActivity: number
  idleSecs: number
  status: 'active' | 'idle' | 'waiting' | 'dead' | 'stopped'
  cwd: string
  source: 'tmux' | 'local'
  sessionId?: string
}
```

- [ ] **Step 2: Add source badge and local session handling to SessionCard**

In `SessionCard.tsx`, add a source badge after the status badge and adjust the "Needs your attention" section:

After the status badge `<span>` element, add:

```tsx
{session.source === 'local' && (
  <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">
    Local
  </span>
)}
```

- [ ] **Step 3: Build check**

Run: `cd ~/workspace/tools/agent-cockpit && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/components/SessionCard.tsx
git commit -m "feat: Add source field to Session type and Local badge to SessionCard"
```

---

### Task 5: Frontend — App Session Sorting and Local Click Handling

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add session sorting**

In `App.tsx`, after `setSessions(wsMessage.data)` in the WebSocket effect, OR in the render, sort sessions. Add a sort helper before the return:

```typescript
const sortedSessions = [...sessions].sort((a, b) => {
  const priority = { waiting: 0, active: 1, idle: 2, stopped: 3, dead: 4 }
  const pa = priority[a.status] ?? 5
  const pb = priority[b.status] ?? 5
  if (pa !== pb) return pa - pb
  return b.lastActivity - a.lastActivity
})
```

Use `sortedSessions` instead of `sessions` in the `.map()` calls that render SessionCard components.

- [ ] **Step 2: Prevent terminal view for local sessions**

In the `onSelect` handler for SessionCard, only select if tmux:

```typescript
onSelect={() => {
  if (session.source === 'local') return
  setSelectedSession(session.name)
}}
```

Add a visual hint in the terminal area when a local session card is clicked — or simply don't make local cards selectable (no hover cursor change). Add to the SessionCard's root div:

```tsx
className={`... ${session.source === 'local' ? 'cursor-default' : 'cursor-pointer'}`}
```

- [ ] **Step 3: Update waiting count for document title**

The existing `waitingCount` calculation already counts by status, so local waiting sessions are included automatically. No change needed.

- [ ] **Step 4: Build check**

Run: `cd ~/workspace/tools/agent-cockpit && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: Sort sessions by status priority, prevent terminal view for local sessions"
```

---

### Task 6: Hook Scripts

**Files:**
- Create: `hooks/cockpit-register.sh`
- Create: `hooks/cockpit-heartbeat.sh`
- Create: `hooks/cockpit-notify.sh`

- [ ] **Step 1: Create hooks directory and register script**

Create `hooks/cockpit-register.sh`:

```bash
#!/bin/bash
# Called by Claude Code SessionStart hook
# Registers session with Agent Cockpit
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null)
CWD=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null)
NAME=$(basename "$CWD")

[ -z "$SESSION_ID" ] && exit 0

COCKPIT_URL="${COCKPIT_URL:-http://localhost:4200}"

curl -sf -X POST "$COCKPIT_URL/api/hooks/session-start" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"name\":\"$NAME\",\"cwd\":\"$CWD\"}" \
  ${COCKPIT_AUTH:+-u "$COCKPIT_AUTH"} \
  >/dev/null 2>&1 &

exit 0
```

- [ ] **Step 2: Create heartbeat script**

Create `hooks/cockpit-heartbeat.sh`:

```bash
#!/bin/bash
# Called by Claude Code Stop hook (each turn end)
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null)

[ -z "$SESSION_ID" ] && exit 0

COCKPIT_URL="${COCKPIT_URL:-http://localhost:4200}"

curl -sf -X POST "$COCKPIT_URL/api/hooks/heartbeat" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"status\":\"active\"}" \
  ${COCKPIT_AUTH:+-u "$COCKPIT_AUTH"} \
  >/dev/null 2>&1 &

exit 0
```

- [ ] **Step 3: Create notify script**

Create `hooks/cockpit-notify.sh`:

```bash
#!/bin/bash
# Called by Claude Code Notification hook (permission prompts)
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null)

[ -z "$SESSION_ID" ] && exit 0

COCKPIT_URL="${COCKPIT_URL:-http://localhost:4200}"

curl -sf -X POST "$COCKPIT_URL/api/hooks/heartbeat" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"status\":\"waiting\"}" \
  ${COCKPIT_AUTH:+-u "$COCKPIT_AUTH"} \
  >/dev/null 2>&1 &

exit 0
```

- [ ] **Step 4: Make executable**

```bash
chmod +x hooks/cockpit-*.sh
```

- [ ] **Step 5: Commit**

```bash
git add hooks/
git commit -m "feat: Add Claude Code hook scripts for session auto-registration"
```

---

### Task 7: Setup Script and Package.json

**Files:**
- Create: `scripts/setup-hooks.sh`
- Create: `scripts/merge-hooks.py`
- Modify: `package.json`

- [ ] **Step 1: Create merge-hooks.py**

Create `scripts/merge-hooks.py`:

```python
#!/usr/bin/env python3
"""Merge cockpit hook configuration into ~/.claude/settings.json"""
import json
import os

SETTINGS_PATH = os.path.expanduser("~/.claude/settings.json")
HOOK_DIR = os.path.expanduser("~/.claude/hooks")

COCKPIT_HOOKS = {
    "SessionStart": [
        {
            "matcher": "",
            "hooks": [
                {
                    "type": "command",
                    "command": f"{HOOK_DIR}/cockpit-register.sh",
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
                    "command": f"{HOOK_DIR}/cockpit-heartbeat.sh",
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
                    "command": f"{HOOK_DIR}/cockpit-notify.sh",
                    "timeout": 5
                }
            ]
        }
    ]
}

# Load existing settings
settings = {}
if os.path.exists(SETTINGS_PATH):
    with open(SETTINGS_PATH) as f:
        settings = json.load(f)

# Merge hooks (append, don't overwrite)
if "hooks" not in settings:
    settings["hooks"] = {}

for event, hook_list in COCKPIT_HOOKS.items():
    if event not in settings["hooks"]:
        settings["hooks"][event] = []
    # Check if cockpit hook already installed
    existing_commands = [
        h.get("hooks", [{}])[0].get("command", "")
        for h in settings["hooks"][event]
    ]
    for hook in hook_list:
        cmd = hook["hooks"][0]["command"]
        if cmd not in existing_commands:
            settings["hooks"][event].append(hook)

# Write back
with open(SETTINGS_PATH, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")

print(f"Updated {SETTINGS_PATH}")
```

- [ ] **Step 2: Create setup-hooks.sh**

Create `scripts/setup-hooks.sh`:

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HOOK_DIR="$HOME/.claude/hooks"

echo "Installing Agent Cockpit hooks..."

# Create hooks directory
mkdir -p "$HOOK_DIR"

# Copy hook scripts
cp "$PROJECT_DIR/hooks/cockpit-register.sh" "$HOOK_DIR/"
cp "$PROJECT_DIR/hooks/cockpit-heartbeat.sh" "$HOOK_DIR/"
cp "$PROJECT_DIR/hooks/cockpit-notify.sh" "$HOOK_DIR/"
chmod +x "$HOOK_DIR"/cockpit-*.sh

echo "  Hook scripts installed to $HOOK_DIR"

# Merge hook config into settings.json
python3 "$SCRIPT_DIR/merge-hooks.py"

echo ""
echo "Done! Agent Cockpit hooks are installed."
echo ""
echo "Configuration:"
echo "  COCKPIT_URL  — default: http://localhost:4200"
echo "  COCKPIT_AUTH — set to user:pass for remote cockpit with auth"
echo ""
echo "Add to your shell profile (~/.zshrc or ~/.bashrc):"
echo "  export COCKPIT_URL=http://localhost:4200"
```

- [ ] **Step 3: Make setup script executable**

```bash
chmod +x scripts/setup-hooks.sh scripts/merge-hooks.py
```

- [ ] **Step 4: Add npm script to package.json**

Add to `scripts` in package.json:

```json
"setup-hooks": "bash scripts/setup-hooks.sh"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/ package.json
git commit -m "feat: Add setup-hooks script to install Claude Code hook integration"
```

---

### Task 8: Build, Test End-to-End, Deploy

**Files:** None new — integration verification

- [ ] **Step 1: Full build check**

```bash
cd ~/workspace/tools/agent-cockpit && npm run build
```
Expected: Build succeeds with no errors

- [ ] **Step 2: Start server and test full flow**

```bash
# Start server
npx tsx server/index.ts &
sleep 2

# Simulate SessionStart
curl -s -X POST http://localhost:4200/api/hooks/session-start \
  -H "Content-Type: application/json" \
  -d '{"session_id":"e2e-test","name":"my-project","cwd":"/home/user/my-project"}'

# Verify it appears in sessions list
curl -s http://localhost:4200/api/sessions | python3 -c "
import sys, json
sessions = json.load(sys.stdin)
local = [s for s in sessions if s.get('source') == 'local']
assert len(local) == 1, f'Expected 1 local session, got {len(local)}'
assert local[0]['name'] == 'my-project'
assert local[0]['status'] == 'active'
print('PASS: session registered')
"

# Simulate waiting (permission prompt)
curl -s -X POST http://localhost:4200/api/hooks/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"e2e-test","status":"waiting"}'

curl -s http://localhost:4200/api/sessions | python3 -c "
import sys, json
sessions = json.load(sys.stdin)
local = [s for s in sessions if s.get('sessionId') == 'e2e-test']
assert local[0]['status'] == 'waiting'
print('PASS: status updated to waiting')
"

# Simulate session end
curl -s -X POST http://localhost:4200/api/hooks/session-end \
  -H "Content-Type: application/json" \
  -d '{"session_id":"e2e-test"}'

curl -s http://localhost:4200/api/sessions | python3 -c "
import sys, json
sessions = json.load(sys.stdin)
local = [s for s in sessions if s.get('sessionId') == 'e2e-test']
assert len(local) == 0, 'Stopped sessions should not appear'
print('PASS: session ended')
"

echo "All E2E tests passed"
kill %1
```

- [ ] **Step 3: Deploy to Railway**

```bash
git push origin main
railway up --detach
```

- [ ] **Step 4: Install hooks locally**

```bash
npm run setup-hooks
```

- [ ] **Step 5: Final commit with any fixes**

```bash
git add -A
git commit -m "chore: E2E verified, ready for deployment"
git push origin main
```
