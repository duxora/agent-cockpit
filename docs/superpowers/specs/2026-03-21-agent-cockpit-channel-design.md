# Agent Cockpit Channel Plugin for Claude Code

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a two-way sync system between Claude Code sessions and Agent Cockpit, enabling autonomous task execution with reliable data flow and centralized visibility.

**Architecture:** Claude Code executes tasks autonomously while Agent Cockpit maintains a control plane UI showing task queue, execution status, and sync state. Two-way communication ensures data correctness through idempotent operations and event sequencing.

**Tech Stack:** Bun (channel plugin), Express (new API endpoints), SQLite (task queue), React (UI component)

---

## Design Overview

### System Model

**Agent Cockpit** (control plane):
- Task queue management (persistent)
- Sync checkpoint tracking
- Result storage and history
- Dashboard visualization
- API endpoints for Claude polling

**Claude Code** (executor):
- Polls for pending tasks
- Executes autonomously
- Reports results
- Handles offline gracefully

**Communication:**
- One-way push: Task created in Agent Cockpit → queued
- Polling: Claude polls `/api/channel/tasks/pending` every 30-60 seconds
- One-way result: Claude posts result to `/api/channel/tasks/{id}/result`
- UI refresh: Agent Cockpit dashboard refreshes from database

### Event Flow

```
1. User creates task in Agent Cockpit UI
   → Stored in tasks queue table
   → Status: "pending"

2. Claude Code session (with channel) comes online
   → Calls GET /api/channel/tasks/pending
   → Receives task batch
   → Status: "fetched"

3. Claude executes task
   → Reports progress via channel logs

4. Task completes
   → Claude calls POST /api/channel/tasks/{id}/result
   → Payload: {status, output, artifacts, duration_ms}
   → Status: "completed"

5. Agent Cockpit dashboard refreshes
   → Shows result, sync state, execution time
   → Sync log updated
```

### Data Correctness Guarantees

**Idempotency:**
- All task IDs are UUID v4 (unique, collision-free)
- Result POST is idempotent: re-posting same result is safe (upsert semantics)
- Timestamp-based ordering for audit trail

**No lost events:**
- All tasks persisted before Claude fetches
- Failed posts get retry logic in channel
- Sync checkpoint ensures no duplicate execution

**Offline resilience:**
- Tasks queue in Agent Cockpit while Claude offline
- Dashboard shows "Pending: N" clearly
- Claude reconnects → fetches all pending tasks in order
- Graceful degradation if sync fails

---

## Data Schema

### New Database Table: `channel_tasks`

```sql
CREATE TABLE IF NOT EXISTS channel_tasks (
  id TEXT PRIMARY KEY,           -- UUID v4
  task_type TEXT NOT NULL,       -- 'deployment', 'validation', 'custom'
  title TEXT NOT NULL,           -- Human-readable task name
  status TEXT NOT NULL,          -- 'pending', 'fetched', 'executing', 'completed', 'failed'

  -- Input
  input_payload JSONB,           -- Task config/params

  -- Output
  output_payload JSONB,          -- Task result (url, logs, etc.)
  error_message TEXT,            -- Error if failed

  -- Metadata
  triggered_by TEXT,             -- 'user', 'automation_rule', 'api'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fetched_at TIMESTAMP,          -- When Claude fetched it
  started_at TIMESTAMP,          -- When Claude started executing
  completed_at TIMESTAMP,        -- When Claude finished
  duration_ms INTEGER,           -- Execution time

  -- Sync tracking
  sync_checkpoint TEXT,          -- Last acknowledged by Claude
  retry_count INTEGER DEFAULT 0,
  last_error TEXT
);

CREATE INDEX idx_channel_tasks_status ON channel_tasks(status);
CREATE INDEX idx_channel_tasks_created_at ON channel_tasks(created_at DESC);
CREATE INDEX idx_channel_tasks_sync ON channel_tasks(status, sync_checkpoint);
```

### New Table: `channel_sync_log`

```sql
CREATE TABLE IF NOT EXISTS channel_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES channel_tasks(id),
  event_type TEXT NOT NULL,      -- 'created', 'fetched', 'executing', 'completed', 'failed', 'sync_ack'
  event_data JSONB,              -- Additional context
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES channel_tasks(id)
);

CREATE INDEX idx_channel_sync_log_task ON channel_sync_log(task_id);
CREATE INDEX idx_channel_sync_log_timestamp ON channel_sync_log(timestamp DESC);
```

---

## API Endpoints

### GET `/api/channel/tasks/pending`

Claude polls for pending tasks.

**Request:**
```
GET /api/channel/tasks/pending
Authorization: Basic {credentials}
```

**Response (200):**
```json
{
  "tasks": [
    {
      "id": "uuid-1",
      "task_type": "deployment",
      "title": "Deploy to Railway",
      "input_payload": {
        "branch": "main",
        "environment": "production"
      },
      "created_at": "2026-03-21T12:00:00Z"
    }
  ],
  "checkpoint": "uuid-1"
}
```

**Behavior:**
- Returns up to 10 pending tasks (configurable)
- Updates `fetched_at` timestamp for each task
- Sets status to "fetched"
- Returns checkpoint UUID for ACK

### POST `/api/channel/tasks/{id}/result`

Claude reports task completion.

**Request:**
```json
{
  "status": "completed" | "failed",
  "output_payload": {
    "deployment_id": "1353665f...",
    "url": "https://...",
    "logs": "Build output..."
  },
  "error_message": null,
  "duration_ms": 45000
}
```

**Response (200):**
```json
{
  "acknowledged": true,
  "task_id": "uuid-1"
}
```

**Behavior:**
- Idempotent: re-posting same result updates (no duplicates)
- Updates `output_payload`, `status`, `completed_at`, `duration_ms`
- Logs event to `channel_sync_log`
- Returns immediately (async processing)

### GET `/api/channel/sync/status`

Check sync state (for UI dashboard).

**Request:**
```
GET /api/channel/sync/status
Authorization: Basic {credentials}
```

**Response (200):**
```json
{
  "session_id": "claude-session-xyz",
  "status": "connected" | "offline" | "syncing",
  "last_sync": "2026-03-21T12:05:00Z",
  "pending_count": 5,
  "completed_today": 12,
  "in_progress": {
    "id": "uuid-3",
    "task_type": "deployment",
    "started_at": "2026-03-21T12:10:00Z"
  }
}
```

**Behavior:**
- Queries `channel_tasks` for status counts
- Infers session status from last sync timestamp
- Returns in-progress task if status = "executing"

---

## Plugin Architecture

### Plugin Entry Point: `plugins/agent-cockpit-channel/index.ts`

**Responsibilities:**
- Initialize Bun HTTP server for task queue subscription
- Set up polling interval (30-60 seconds)
- Implement channel protocol (MCP-compatible)
- Export Claude tools: `query_task`, `trigger_task`, `suggest_action`

**Channel Protocol:**
```typescript
interface ChannelEvent {
  source: "agent-cockpit",
  type: "task.pending" | "task.result_request" | "task.sync_status",
  data: any
}

// Tools Claude can call
export const tools = {
  query_task: (taskId: string) => getTaskResult(taskId),
  suggest_action: (taskId: string, suggestion: string) => postSuggestion(taskId, suggestion),
  trigger_task: (taskType: string, params: object) => createTask(taskType, params)  // requires approval rule
}
```

### Configuration: `~/.claude/channels/agent-cockpit/.env`

```
AGENT_COCKPIT_URL=https://agent-cockpit-production.up.railway.app
AGENT_COCKPIT_TOKEN=<admin_token>
COCKPIT_USER=admin
COCKPIT_PASSWORD=<password>
POLL_INTERVAL_SECONDS=30
MAX_TASKS_PER_POLL=10
```

### Installation Flow

```bash
# User installs plugin
claude /plugin install agent-cockpit@agent-cockpit-repo

# User configures credentials
claude /agent-cockpit:configure <token>

# User starts Claude with channel enabled
claude --channels plugin:agent-cockpit@agent-cockpit-repo

# Channel starts polling, subscribes to events
# Claude reads events: <channel source="agent-cockpit"> task event
```

---

## Agent Cockpit UI: Claude Tasks Tab

### New Component: `src/components/ClaudeTasksTab.tsx`

**Sections:**

1. **Session Status Bar**
   - Status: "Connected ✓" | "Offline ✗" | "Syncing..."
   - Last sync time: "5 min ago"
   - Button: "Sync now" (manual trigger)

2. **Task Queue (Pending)**
   - Table: ID | Type | Title | Created | Status
   - Filter by: type, status, date range
   - Action: View task details, cancel task

3. **In Progress**
   - Current task card: type, title, started time, progress log
   - Real-time log tail (last 20 lines)

4. **Completed Tasks (Today)**
   - Table: ID | Type | Duration | Status | Output
   - Expandable rows: view full output/logs
   - Filter by: success/failure, time

5. **Sync Log (Activity Feed)**
   - Timeline: created → fetched → started → completed
   - Timestamps and event details
   - Retries and errors if applicable

### Dashboard Integration

Add "Claude Tasks" tab to existing AdminPanel:
```typescript
activeTab: 'railway' | 'analytics' | 'skills' | 'hooks' | 'github' | 'claude-tasks'
```

---

## Error Handling & Offline Behavior

**Claude offline:**
- Tasks stay in "pending" queue
- Dashboard shows "Pending: N" clearly
- No data loss

**Network error on result POST:**
- Channel retries up to 3 times (exponential backoff)
- If all retries fail, status = "executing" (stuck)
- Dashboard alerts: "Task stuck: uuid-3 (3 failed retries)"

**Task execution failure in Claude:**
- Claude catches error, posts `{status: "failed", error_message: "..."}`
- Agent Cockpit logs failure
- Dashboard shows red status

**Sync checkpoint:**
- Claude acknowledges batch: stores checkpoint UUID locally
- On reconnect, only fetches tasks after checkpoint
- No duplicate execution

---

## Security Model

**Authentication:**
- Reuse existing COCKPIT_PASSWORD (Basic auth)
- Extend with token-based auth for channel (optional)

**Authorization:**
- `/api/channel/tasks/pending`: Requires auth
- `/api/channel/tasks/{id}/result`: Requires auth
- `GET /api/channel/sync/status`: Requires auth

**Data isolation:**
- No cross-session task access
- Each Claude session is identified by UUID
- Tasks owned by session that fetches them

**Automation rules (future):**
- Whitelist of actions Claude can auto-trigger
- User approves rule creation
- Immutable audit trail of rule-triggered actions

---

## Success Criteria

✅ Claude receives task from Agent Cockpit
✅ Claude executes task autonomously
✅ Claude reports result back (with full output)
✅ Agent Cockpit UI shows task in "Completed" with output visible
✅ Offline scenario: Claude offline 10 min, 5 tasks queue, Claude reconnects and fetches all 5
✅ No duplicate execution on network retry
✅ Sync log shows full audit trail
✅ Plugin runs with `claude --channels plugin:agent-cockpit@...`
✅ Works in background (unattended) for hours without issues

---

## Phase 2 (Future, not MVP)

- Automation rules: "if deployment succeeds, run validation"
- Webhook push (instead of polling)
- Task artifacts storage (S3/Railway object storage)
- Advanced UI: task dependencies, DAG visualization
- CLI for triggering tasks locally
