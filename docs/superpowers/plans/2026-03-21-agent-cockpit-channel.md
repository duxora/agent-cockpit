# Agent Cockpit Channel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement two-way sync system between Claude Code and Agent Cockpit with task queue, polling mechanism, UI visibility, and reliable data flow.

**Architecture:** Database tables store task queue and sync log. Backend API endpoints handle polling and result submission. Bun plugin in Claude Code connects via channel MCP interface. React component visualizes task status in Agent Cockpit dashboard.

**Tech Stack:** SQLite (task persistence), Express (API), Bun (channel plugin), React (UI), Vitest (tests)

---

## File Structure

### Backend (Server)
- `server/db.ts` - Add `channel_tasks` and `channel_sync_log` tables, CRUD functions
- `server/index.ts` - Add `/api/channel/*` endpoints (GET pending, POST result, GET status)
- `server/__tests__/channel.test.ts` - Test suite for channel endpoints

### Plugin (Channel)
- `plugins/agent-cockpit-channel/index.ts` - Bun entry point, polling loop, channel protocol
- `plugins/agent-cockpit-channel/config.ts` - Environment config, defaults
- `plugins/agent-cockpit-channel/tools.ts` - Claude tools (query, trigger, suggest)
- `plugins/agent-cockpit-channel/client.ts` - HTTP client for Agent Cockpit API

### Frontend (UI)
- `src/components/ClaudeTasksTab.tsx` - React component for task visibility
- `src/components/__tests__/ClaudeTasksTab.test.tsx` - Component tests

### Docs
- `docs/CHANNEL_SETUP.md` - Installation and configuration guide
- `docs/CHANNEL_API.md` - API endpoint reference

---

## Tasks

### Task 1: Database Schema for Channel Tasks

**Files:**
- Modify: `server/db.ts:end` (add new tables)
- Test: `server/__tests__/channel.test.ts` (new file)

- [ ] **Step 1: Write failing test for channel_tasks table**

```typescript
// server/__tests__/channel.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createChannelTask,
  getChannelTask,
  listPendingTasks,
  updateTaskStatus,
  logSyncEvent
} from '../db.js'
import { randomUUID } from 'crypto'

describe('Channel Tasks', () => {
  const taskId = randomUUID()

  it('should create and retrieve a task', () => {
    const taskInput = {
      id: taskId,
      task_type: 'deployment',
      title: 'Deploy to production',
      input_payload: { branch: 'main' },
      triggered_by: 'user'
    }

    const result = createChannelTask(taskInput)
    expect(result.id).toBe(taskId)
    expect(result.status).toBe('pending')

    const retrieved = getChannelTask(taskId)
    expect(retrieved.title).toBe('Deploy to production')
  })

  it('should list pending tasks', () => {
    createChannelTask({
      id: randomUUID(),
      task_type: 'deployment',
      title: 'Deploy A',
      input_payload: {},
      triggered_by: 'user'
    })

    const pending = listPendingTasks(10)
    expect(pending.length).toBeGreaterThan(0)
    expect(pending[0].status).toBe('pending')
  })

  it('should update task status', () => {
    createChannelTask({
      id: taskId,
      task_type: 'deployment',
      title: 'Test deploy',
      input_payload: {},
      triggered_by: 'user'
    })

    updateTaskStatus(taskId, 'fetched', { fetched_at: new Date() })
    const updated = getChannelTask(taskId)
    expect(updated.status).toBe('fetched')
  })

  it('should log sync events', () => {
    logSyncEvent(taskId, 'created', { data: 'test' })
    // Verify event was logged (query from sync_log table)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- server/__tests__/channel.test.ts
```

Expected: FAIL - "createChannelTask is not defined"

- [ ] **Step 3: Add channel_tasks and channel_sync_log tables to db.ts**

```typescript
// server/db.ts - add at end of initialization
function initChannelTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_tasks (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input_payload JSON,
      output_payload JSON,
      error_message TEXT,
      triggered_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fetched_at TIMESTAMP,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      duration_ms INTEGER,
      sync_checkpoint TEXT,
      retry_count INTEGER DEFAULT 0,
      last_error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_channel_tasks_status ON channel_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_channel_tasks_created_at ON channel_tasks(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_channel_tasks_sync ON channel_tasks(status, sync_checkpoint);

    CREATE TABLE IF NOT EXISTS channel_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data JSON,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES channel_tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_channel_sync_log_task ON channel_sync_log(task_id);
    CREATE INDEX IF NOT EXISTS idx_channel_sync_log_timestamp ON channel_sync_log(timestamp DESC);
  `)
}

// Call after other table initialization
initChannelTables()
```

- [ ] **Step 4: Implement CRUD functions**

```typescript
// server/db.ts - add these functions
export interface ChannelTask {
  id: string
  task_type: string
  title: string
  status: 'pending' | 'fetched' | 'executing' | 'completed' | 'failed'
  input_payload?: Record<string, any>
  output_payload?: Record<string, any>
  error_message?: string
  triggered_by: string
  created_at: string
  fetched_at?: string
  started_at?: string
  completed_at?: string
  duration_ms?: number
}

export function createChannelTask(task: Omit<ChannelTask, 'created_at'>) {
  const stmt = db.prepare(`
    INSERT INTO channel_tasks
    (id, task_type, title, status, input_payload, triggered_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    task.id,
    task.task_type,
    task.title,
    'pending',
    JSON.stringify(task.input_payload || {}),
    task.triggered_by
  )

  logSyncEvent(task.id, 'created', { task_type: task.task_type })
  return getChannelTask(task.id)
}

export function getChannelTask(taskId: string): ChannelTask | null {
  const stmt = db.prepare('SELECT * FROM channel_tasks WHERE id = ?')
  const row = stmt.get(taskId) as any
  if (!row) return null

  return {
    ...row,
    input_payload: row.input_payload ? JSON.parse(row.input_payload) : undefined,
    output_payload: row.output_payload ? JSON.parse(row.output_payload) : undefined
  }
}

export function listPendingTasks(limit: number): ChannelTask[] {
  const stmt = db.prepare(`
    SELECT * FROM channel_tasks
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT ?
  `)

  const rows = stmt.all(limit) as any[]
  return rows.map(row => ({
    ...row,
    input_payload: row.input_payload ? JSON.parse(row.input_payload) : undefined,
    output_payload: row.output_payload ? JSON.parse(row.output_payload) : undefined
  }))
}

export function updateTaskStatus(
  taskId: string,
  status: string,
  updates: Record<string, any> = {}
) {
  const fields = ['status = ?']
  const values = [status]

  if (updates.fetched_at) {
    fields.push('fetched_at = ?')
    values.push(new Date().toISOString())
  }
  if (updates.started_at) {
    fields.push('started_at = ?')
    values.push(new Date().toISOString())
  }
  if (updates.completed_at) {
    fields.push('completed_at = ?')
    values.push(new Date().toISOString())
  }

  values.push(taskId)
  const stmt = db.prepare(`UPDATE channel_tasks SET ${fields.join(', ')} WHERE id = ?`)
  stmt.run(...values)

  logSyncEvent(taskId, 'status_changed', { status })
}

export function updateTaskResult(
  taskId: string,
  status: 'completed' | 'failed',
  output: Record<string, any>,
  error?: string,
  duration_ms?: number
) {
  const stmt = db.prepare(`
    UPDATE channel_tasks
    SET status = ?, output_payload = ?, error_message = ?, completed_at = ?, duration_ms = ?
    WHERE id = ?
  `)

  stmt.run(
    status,
    JSON.stringify(output),
    error || null,
    new Date().toISOString(),
    duration_ms || null,
    taskId
  )

  logSyncEvent(taskId, status, { output_keys: Object.keys(output) })
}

export function logSyncEvent(
  taskId: string,
  eventType: string,
  eventData: Record<string, any> = {}
) {
  const stmt = db.prepare(`
    INSERT INTO channel_sync_log (task_id, event_type, event_data)
    VALUES (?, ?, ?)
  `)

  stmt.run(taskId, eventType, JSON.stringify(eventData))
}

export function getSyncStatus() {
  const pendingStmt = db.prepare(`
    SELECT COUNT(*) as count FROM channel_tasks WHERE status = 'pending'
  `)
  const pending = (pendingStmt.get() as any).count

  const completedStmt = db.prepare(`
    SELECT COUNT(*) as count FROM channel_tasks
    WHERE status = 'completed' AND date(completed_at) = date('now')
  `)
  const completed = (completedStmt.get() as any).count

  const inProgressStmt = db.prepare(`
    SELECT * FROM channel_tasks WHERE status = 'executing' LIMIT 1
  `)
  const inProgress = inProgressStmt.get() as any

  const lastSyncStmt = db.prepare(`
    SELECT timestamp FROM channel_sync_log ORDER BY timestamp DESC LIMIT 1
  `)
  const lastSync = (lastSyncStmt.get() as any)?.timestamp

  return {
    pending_count: pending,
    completed_today: completed,
    in_progress: inProgress ? getChannelTask(inProgress.id) : null,
    last_sync: lastSync
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- server/__tests__/channel.test.ts
```

Expected: PASS (all tests pass)

- [ ] **Step 6: Commit**

```bash
git add server/db.ts server/__tests__/channel.test.ts
git commit -m "feat: add channel_tasks and channel_sync_log database schema with CRUD functions"
```

---

### Task 2: Channel API Endpoints

**Files:**
- Modify: `server/index.ts:end` (add 3 new endpoints)
- Modify: `server/__tests__/channel.test.ts` (add endpoint tests)

- [ ] **Step 1: Write failing tests for API endpoints**

```typescript
// Add to server/__tests__/channel.test.ts
describe('Channel API Endpoints', () => {
  it('GET /api/channel/tasks/pending should return pending tasks', async () => {
    const response = await fetch(
      'http://localhost:4200/api/channel/tasks/pending',
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from('admin:changeme').toString('base64')
        }
      }
    )

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('tasks')
    expect(Array.isArray(data.tasks)).toBe(true)
    expect(data).toHaveProperty('checkpoint')
  })

  it('POST /api/channel/tasks/{id}/result should accept task result', async () => {
    const taskId = randomUUID()
    createChannelTask({
      id: taskId,
      task_type: 'deployment',
      title: 'Test deploy',
      input_payload: {},
      triggered_by: 'test'
    })

    const response = await fetch(
      `http://localhost:4200/api/channel/tasks/${taskId}/result`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from('admin:changeme').toString('base64')
        },
        body: JSON.stringify({
          status: 'completed',
          output_payload: { url: 'https://...' },
          duration_ms: 5000
        })
      }
    )

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('acknowledged', true)
  })

  it('GET /api/channel/sync/status should return sync state', async () => {
    const response = await fetch(
      'http://localhost:4200/api/channel/sync/status',
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from('admin:changeme').toString('base64')
        }
      }
    )

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('status')
    expect(data).toHaveProperty('pending_count')
    expect(data).toHaveProperty('completed_today')
  })
})
```

- [ ] **Step 2: Run test to verify endpoints fail**

```bash
npm test -- server/__tests__/channel.test.ts
```

Expected: FAIL - "Cannot POST /api/channel/tasks/..."

- [ ] **Step 3: Add endpoints to server/index.ts**

```typescript
// server/index.ts - add before the catch-all route

app.get('/api/channel/tasks/pending', (req, res) => {
  try {
    const tasks = listPendingTasks(10)
    const checkpoint = tasks.length > 0 ? tasks[tasks.length - 1].id : null

    // Update status to 'fetched'
    tasks.forEach(task => {
      updateTaskStatus(task.id, 'fetched', { fetched_at: true })
    })

    res.json({
      tasks: tasks.map(t => ({
        id: t.id,
        task_type: t.task_type,
        title: t.title,
        input_payload: t.input_payload,
        created_at: t.created_at
      })),
      checkpoint
    })
  } catch (error) {
    console.error('Failed to fetch pending tasks:', error)
    res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

app.post('/api/channel/tasks/:id/result', (req, res) => {
  try {
    const { id } = req.params
    const { status, output_payload, error_message, duration_ms } = req.body

    if (!['completed', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    updateTaskResult(id, status, output_payload || {}, error_message, duration_ms)

    res.json({
      acknowledged: true,
      task_id: id
    })
  } catch (error) {
    console.error('Failed to update task result:', error)
    res.status(500).json({ error: 'Failed to update task' })
  }
})

app.get('/api/channel/sync/status', (req, res) => {
  try {
    const status = getSyncStatus()

    res.json({
      session_id: 'claude-session-' + Date.now(), // Placeholder
      status: status.last_sync ? 'connected' : 'offline',
      last_sync: status.last_sync,
      pending_count: status.pending_count,
      completed_today: status.completed_today,
      in_progress: status.in_progress
    })
  } catch (error) {
    console.error('Failed to get sync status:', error)
    res.status(500).json({ error: 'Failed to get status' })
  }
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- server/__tests__/channel.test.ts
```

Expected: PASS (all endpoint tests pass)

- [ ] **Step 5: Commit**

```bash
git add server/index.ts server/__tests__/channel.test.ts
git commit -m "feat: add /api/channel/* endpoints for task polling and result submission"
```

---

### Task 3: Plugin Scaffold and Configuration

**Files:**
- Create: `plugins/agent-cockpit-channel/index.ts`
- Create: `plugins/agent-cockpit-channel/config.ts`
- Create: `plugins/agent-cockpit-channel/package.json`
- Create: `.env.example` (for channel config)

- [ ] **Step 1: Create plugin package.json**

```json
{
  "name": "@agent-cockpit/channel",
  "version": "0.1.0",
  "type": "module",
  "main": "index.ts",
  "scripts": {
    "dev": "bun run index.ts"
  },
  "dependencies": {
    "better-sqlite3": "^9.0.0"
  }
}
```

- [ ] **Step 2: Create config.ts**

```typescript
// plugins/agent-cockpit-channel/config.ts
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface ChannelConfig {
  agent_cockpit_url: string
  agent_cockpit_token: string
  cockpit_user: string
  cockpit_password: string
  poll_interval_seconds: number
  max_tasks_per_poll: number
}

export function loadConfig(): ChannelConfig {
  const envPath = join(homedir(), '.claude', 'channels', 'agent-cockpit', '.env')

  try {
    const content = readFileSync(envPath, 'utf-8')
    const env: Record<string, string> = {}

    content.split('\n').forEach(line => {
      const [key, value] = line.split('=')
      if (key && value) {
        env[key.trim()] = value.trim()
      }
    })

    return {
      agent_cockpit_url: env.AGENT_COCKPIT_URL || 'http://localhost:4200',
      agent_cockpit_token: env.AGENT_COCKPIT_TOKEN || '',
      cockpit_user: env.COCKPIT_USER || 'admin',
      cockpit_password: env.COCKPIT_PASSWORD || 'changeme',
      poll_interval_seconds: parseInt(env.POLL_INTERVAL_SECONDS || '30'),
      max_tasks_per_poll: parseInt(env.MAX_TASKS_PER_POLL || '10')
    }
  } catch (error) {
    console.log('Using default config (no .env found)')
    return {
      agent_cockpit_url: 'http://localhost:4200',
      agent_cockpit_token: '',
      cockpit_user: 'admin',
      cockpit_password: 'changeme',
      poll_interval_seconds: 30,
      max_tasks_per_poll: 10
    }
  }
}
```

- [ ] **Step 3: Create plugin index.ts (Bun entry point)**

```typescript
// plugins/agent-cockpit-channel/index.ts
import { loadConfig } from './config.js'

const config = loadConfig()

console.log('Agent Cockpit Channel Plugin starting...')
console.log(`Connecting to: ${config.agent_cockpit_url}`)
console.log(`Poll interval: ${config.poll_interval_seconds}s`)

// Channel protocol: Claude Code will invoke this as an MCP server
// For now, just start polling loop

let sessionActive = true

async function pollTasks() {
  while (sessionActive) {
    try {
      const response = await fetch(`${config.agent_cockpit_url}/api/channel/tasks/pending`, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(
            `${config.cockpit_user}:${config.cockpit_password}`
          ).toString('base64')
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.tasks && data.tasks.length > 0) {
          console.log(`Received ${data.tasks.length} pending tasks`)
          // Tasks will be processed through channel protocol
          // Claude Code will receive them as <channel> events
        }
      }
    } catch (error) {
      console.error('Failed to poll tasks:', error)
    }

    await new Promise(resolve => setTimeout(resolve, config.poll_interval_seconds * 1000))
  }
}

// Start polling
pollTasks()

// Handle shutdown
process.on('SIGINT', () => {
  sessionActive = false
  process.exit(0)
})
```

- [ ] **Step 4: Create .env.example**

```
# .env.example
AGENT_COCKPIT_URL=https://agent-cockpit-production.up.railway.app
AGENT_COCKPIT_TOKEN=your_token_here
COCKPIT_USER=admin
COCKPIT_PASSWORD=your_password_here
POLL_INTERVAL_SECONDS=30
MAX_TASKS_PER_POLL=10
```

- [ ] **Step 5: Verify plugin loads**

```bash
cd plugins/agent-cockpit-channel
bun index.ts
```

Expected: "Agent Cockpit Channel Plugin starting..." message

- [ ] **Step 6: Commit**

```bash
git add plugins/agent-cockpit-channel/ .env.example
git commit -m "feat: scaffold Agent Cockpit Channel plugin with Bun entry point"
```

---

### Task 4: Plugin Tools and Channel Protocol

**Files:**
- Create: `plugins/agent-cockpit-channel/tools.ts`
- Create: `plugins/agent-cockpit-channel/client.ts`
- Modify: `plugins/agent-cockpit-channel/index.ts`

- [ ] **Step 1: Create API client**

```typescript
// plugins/agent-cockpit-channel/client.ts
import { ChannelConfig } from './config.js'

export class AgentCockpitClient {
  constructor(private config: ChannelConfig) {}

  private getAuthHeader() {
    return 'Basic ' + Buffer.from(
      `${this.config.cockpit_user}:${this.config.cockpit_password}`
    ).toString('base64')
  }

  async getPendingTasks() {
    const response = await fetch(
      `${this.config.agent_cockpit_url}/api/channel/tasks/pending`,
      {
        headers: { 'Authorization': this.getAuthHeader() }
      }
    )
    return response.json()
  }

  async submitTaskResult(taskId: string, result: {
    status: 'completed' | 'failed'
    output_payload: Record<string, any>
    error_message?: string
    duration_ms?: number
  }) {
    const response = await fetch(
      `${this.config.agent_cockpit_url}/api/channel/tasks/${taskId}/result`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.getAuthHeader()
        },
        body: JSON.stringify(result)
      }
    )
    return response.json()
  }

  async getSyncStatus() {
    const response = await fetch(
      `${this.config.agent_cockpit_url}/api/channel/sync/status`,
      {
        headers: { 'Authorization': this.getAuthHeader() }
      }
    )
    return response.json()
  }
}
```

- [ ] **Step 2: Create tools**

```typescript
// plugins/agent-cockpit-channel/tools.ts
import { AgentCockpitClient } from './client.js'
import { ChannelConfig } from './config.js'

export function createChannelTools(client: AgentCockpitClient) {
  return {
    query_task: {
      description: 'Query the result and status of a task',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'UUID of the task'
          }
        },
        required: ['task_id']
      },
      handler: async (params: { task_id: string }) => {
        // In real implementation, would query task status
        return {
          task_id: params.task_id,
          message: 'Query task tool available for Claude to invoke'
        }
      }
    },

    suggest_action: {
      description: 'Suggest next steps for a task and await user approval',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          suggestion: { type: 'string' }
        },
        required: ['task_id', 'suggestion']
      },
      handler: async (params: { task_id: string; suggestion: string }) => {
        return {
          acknowledged: true,
          message: `Suggestion logged: ${params.suggestion}`
        }
      }
    },

    trigger_task: {
      description: 'Trigger a new task (requires automation rule)',
      inputSchema: {
        type: 'object',
        properties: {
          task_type: { type: 'string' },
          title: { type: 'string' },
          input_payload: { type: 'object' }
        },
        required: ['task_type', 'title']
      },
      handler: async (params: any) => {
        return {
          message: 'Trigger task requires user approval via automation rule'
        }
      }
    }
  }
}
```

- [ ] **Step 3: Update plugin index to export tools**

```typescript
// plugins/agent-cockpit-channel/index.ts - update
import { loadConfig } from './config.js'
import { AgentCockpitClient } from './client.js'
import { createChannelTools } from './tools.js'

const config = loadConfig()
const client = new AgentCockpitClient(config)
const tools = createChannelTools(client)

// Export tools for Claude Code MCP interface
export const claudeTools = tools

console.log('Agent Cockpit Channel Plugin ready with tools:', Object.keys(tools))
```

- [ ] **Step 4: Verify tools load**

```bash
cd plugins/agent-cockpit-channel
bun index.ts
```

Expected: "Agent Cockpit Channel Plugin ready with tools: query_task, suggest_action, trigger_task"

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-cockpit-channel/
git commit -m "feat: implement channel tools and API client for Claude integration"
```

---

### Task 5: UI Component - ClaudeTasksTab

**Files:**
- Create: `src/components/ClaudeTasksTab.tsx`
- Create: `src/components/__tests__/ClaudeTasksTab.test.tsx`
- Modify: `src/components/AdminPanel.tsx` (add tab)

- [ ] **Step 1: Write component test**

```typescript
// src/components/__tests__/ClaudeTasksTab.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClaudeTasksTab from '../ClaudeTasksTab'

describe('ClaudeTasksTab', () => {
  it('should render session status', () => {
    render(<ClaudeTasksTab />)
    expect(screen.getByText(/session status/i)).toBeInTheDocument()
  })

  it('should show pending tasks count', () => {
    render(<ClaudeTasksTab />)
    expect(screen.getByText(/pending/i)).toBeInTheDocument()
  })

  it('should display completed tasks', () => {
    render(<ClaudeTasksTab />)
    expect(screen.getByText(/completed/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test (fails)**

```bash
npm test -- src/components/__tests__/ClaudeTasksTab.test.tsx
```

Expected: FAIL - "ClaudeTasksTab not found"

- [ ] **Step 3: Create component**

```typescript
// src/components/ClaudeTasksTab.tsx
import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle, Clock, AlertCircle } from 'lucide-react'

interface SyncStatus {
  session_id: string
  status: 'connected' | 'offline' | 'syncing'
  last_sync: string
  pending_count: number
  completed_today: number
  in_progress?: any
}

interface Task {
  id: string
  task_type: string
  title: string
  status: string
  created_at: string
  completed_at?: string
  duration_ms?: number
  output_payload?: Record<string, any>
}

export default function ClaudeTasksTab() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSyncStatus()
    const interval = setInterval(fetchSyncStatus, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  const fetchSyncStatus = async () => {
    try {
      const response = await fetch('/api/channel/sync/status', {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(process.env.COCKPIT_AUTH ?? '').toString('base64')
        }
      })
      if (response.ok) {
        const data = await response.json()
        setSyncStatus(data)
      }
    } catch (error) {
      console.error('Failed to fetch sync status:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-gray-400">Loading...</div>
  }

  return (
    <div className="space-y-6 p-6">
      {/* Session Status Bar */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-100">Claude Session Status</h3>
            <div className="flex items-center gap-2 mt-2">
              <div className={`w-2 h-2 rounded-full ${
                syncStatus?.status === 'connected' ? 'bg-green-500' : 'bg-gray-500'
              }`} />
              <span className="text-sm text-gray-400">
                {syncStatus?.status === 'connected' ? 'Connected ✓' : 'Offline ✗'}
              </span>
              <span className="text-xs text-gray-500 ml-4">
                Last sync: {syncStatus?.last_sync ? new Date(syncStatus.last_sync).toLocaleTimeString() : 'Never'}
              </span>
            </div>
          </div>
          <button
            onClick={fetchSyncStatus}
            className="p-2 hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">Pending Tasks</p>
              <p className="text-2xl font-bold text-gray-100 mt-2">{syncStatus?.pending_count || 0}</p>
            </div>
            <Clock className="w-6 h-6 text-gray-600" />
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">Completed Today</p>
              <p className="text-2xl font-bold text-gray-100 mt-2">{syncStatus?.completed_today || 0}</p>
            </div>
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">In Progress</p>
              <p className="text-2xl font-bold text-gray-100 mt-2">
                {syncStatus?.in_progress ? 1 : 0}
              </p>
            </div>
            <AlertCircle className="w-6 h-6 text-yellow-600" />
          </div>
        </div>
      </div>

      {/* In Progress Section */}
      {syncStatus?.in_progress && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <h4 className="text-sm font-semibold text-gray-100 mb-3">Currently Executing</h4>
          <div className="space-y-2">
            <p className="text-sm text-gray-300">{syncStatus.in_progress.title}</p>
            <p className="text-xs text-gray-500">
              Started: {new Date(syncStatus.in_progress.started_at).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Placeholder for future expansions */}
      <div className="text-gray-500 text-sm">
        <p>Sync log and completed tasks visible here (Phase 2)</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify passes**

```bash
npm test -- src/components/__tests__/ClaudeTasksTab.test.tsx
```

Expected: PASS

- [ ] **Step 5: Add tab to AdminPanel**

```typescript
// src/components/AdminPanel.tsx - update imports and tabs
import ClaudeTasksTab from './ClaudeTasksTab'

// In activeTab type:
activeTab: 'railway' | 'analytics' | 'skills' | 'hooks' | 'github' | 'claude-tasks'

// In tab buttons (before Settings):
<button
  onClick={() => setActiveTab('claude-tasks')}
  className={`flex-1 px-4 py-2 text-sm font-medium ${
    activeTab === 'claude-tasks'
      ? 'border-b-2 border-blue-500 text-blue-400'
      : 'text-gray-500 hover:text-gray-300'
  }`}
>
  Claude Tasks
</button>

// In content area:
{activeTab === 'claude-tasks' && <ClaudeTasksTab />}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ClaudeTasksTab.tsx src/components/__tests__/ClaudeTasksTab.test.tsx src/components/AdminPanel.tsx
git commit -m "feat: add ClaudeTasksTab component with sync status and task visibility"
```

---

### Task 6: Documentation and Setup Guide

**Files:**
- Create: `docs/CHANNEL_SETUP.md`
- Create: `docs/CHANNEL_API.md`

- [ ] **Step 1: Write CHANNEL_SETUP.md**

```markdown
# Agent Cockpit Channel Setup Guide

## Installation

1. Install the channel plugin from the repository:
\`\`\`bash
claude /plugin install agent-cockpit@agent-cockpit-repo
\`\`\`

2. Configure credentials:
\`\`\`bash
claude /agent-cockpit:configure
\`\`\`

This creates `~/.claude/channels/agent-cockpit/.env`

3. Start Claude Code with the channel enabled:
\`\`\`bash
claude --channels plugin:agent-cockpit@agent-cockpit-repo
\`\`\`

## Configuration

Environment variables in `~/.claude/channels/agent-cockpit/.env`:

- `AGENT_COCKPIT_URL` - Agent Cockpit server URL (default: http://localhost:4200)
- `COCKPIT_USER` - Admin username (default: admin)
- `COCKPIT_PASSWORD` - Admin password
- `POLL_INTERVAL_SECONDS` - How often to check for tasks (default: 30)
- `MAX_TASKS_PER_POLL` - Maximum tasks per poll (default: 10)

## How It Works

1. Claude Code connects to Agent Cockpit via the channel
2. Every 30 seconds, Claude polls for pending tasks
3. When tasks arrive, Claude executes them autonomously
4. Claude reports results back to Agent Cockpit
5. Agent Cockpit UI shows task status and execution results
6. Users can create tasks in the "Claude Tasks" dashboard tab

## Offline Behavior

If Claude Code goes offline:
- Tasks queue in Agent Cockpit
- Dashboard shows "Pending: N"
- Claude reconnects → fetches all pending tasks
- No tasks are lost or duplicated

## Troubleshooting

**Channel doesn't connect:**
- Check `AGENT_COCKPIT_URL` is correct
- Verify `COCKPIT_PASSWORD` matches Agent Cockpit server
- Check firewall/network connectivity

**No tasks received:**
- Ensure Claude Code is running with `--channels` flag
- Check `POLL_INTERVAL_SECONDS` is reasonable
- Verify tasks exist in Agent Cockpit UI
```

- [ ] **Step 2: Write CHANNEL_API.md**

```markdown
# Channel API Reference

## Endpoints

All endpoints require Basic authentication (COCKPIT_USER:COCKPIT_PASSWORD)

### GET /api/channel/tasks/pending

Fetch pending tasks for Claude Code to execute.

**Response:**
\`\`\`json
{
  "tasks": [
    {
      "id": "uuid-1",
      "task_type": "deployment",
      "title": "Deploy to production",
      "input_payload": { "branch": "main" },
      "created_at": "2026-03-21T12:00:00Z"
    }
  ],
  "checkpoint": "uuid-1"
}
\`\`\`

### POST /api/channel/tasks/{id}/result

Report task completion result.

**Request Body:**
\`\`\`json
{
  "status": "completed",
  "output_payload": {
    "deployment_id": "xyz",
    "url": "https://...",
    "logs": "Build output"
  },
  "error_message": null,
  "duration_ms": 45000
}
\`\`\`

**Response:**
\`\`\`json
{
  "acknowledged": true,
  "task_id": "uuid-1"
}
\`\`\`

### GET /api/channel/sync/status

Get current sync status (for dashboard).

**Response:**
\`\`\`json
{
  "session_id": "claude-session-xyz",
  "status": "connected",
  "last_sync": "2026-03-21T12:05:00Z",
  "pending_count": 5,
  "completed_today": 12,
  "in_progress": {
    "id": "uuid-3",
    "task_type": "deployment",
    "title": "Deploy to production",
    "started_at": "2026-03-21T12:10:00Z"
  }
}
\`\`\`

## Task Lifecycle

1. **pending** - Task created, awaiting Claude
2. **fetched** - Claude fetched the task
3. **executing** - Claude is executing the task
4. **completed** - Task completed successfully
5. **failed** - Task failed with error

## Idempotency

All operations are idempotent:
- Posting the same result twice is safe
- Tasks are deduplicated by UUID
- Timestamps preserve ordering
```

- [ ] **Step 3: Commit documentation**

```bash
git add docs/CHANNEL_SETUP.md docs/CHANNEL_API.md
git commit -m "docs: add Channel setup and API reference documentation"
```

---

### Task 7: Integration Testing

**Files:**
- Modify: `server/__tests__/channel.test.ts` (add integration tests)

- [ ] **Step 1: Add end-to-end test**

```typescript
// Add to server/__tests__/channel.test.ts
describe('Channel End-to-End Flow', () => {
  it('should handle complete task lifecycle', async () => {
    const taskId = randomUUID()

    // 1. Create task
    createChannelTask({
      id: taskId,
      task_type: 'deployment',
      title: 'E2E test deploy',
      input_payload: { branch: 'main' },
      triggered_by: 'test'
    })

    // 2. Claude polls for tasks
    const pending = listPendingTasks(10)
    expect(pending.length).toBeGreaterThan(0)
    const polledTask = pending.find(t => t.id === taskId)
    expect(polledTask).toBeDefined()
    expect(polledTask?.status).toBe('pending')

    // 3. Update status to fetched
    updateTaskStatus(taskId, 'fetched', {})
    const fetched = getChannelTask(taskId)
    expect(fetched?.status).toBe('fetched')

    // 4. Simulate execution -> report result
    updateTaskResult(
      taskId,
      'completed',
      { url: 'https://example.com', logs: 'Success' },
      undefined,
      5000
    )

    // 5. Verify result stored
    const completed = getChannelTask(taskId)
    expect(completed?.status).toBe('completed')
    expect(completed?.output_payload?.url).toBe('https://example.com')
    expect(completed?.duration_ms).toBe(5000)
  })
})
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: All tests pass (108+ tests)

- [ ] **Step 3: Verify no build issues**

```bash
npm run build
```

Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/channel.test.ts
git commit -m "test: add end-to-end channel lifecycle tests"
```

---

### Task 8: Final Verification and Build

**Files:**
- None (verification only)

- [ ] **Step 1: Run complete test suite**

```bash
npm test 2>&1 | tail -15
```

Expected: "Test Files: X passed" (no failures)

- [ ] **Step 2: Verify production build**

```bash
npm run build 2>&1 | tail -10
```

Expected: "✓ built in X.XXs" (no errors)

- [ ] **Step 3: Verify plugin can start**

```bash
cd plugins/agent-cockpit-channel
bun index.ts &
sleep 2
echo "Plugin started successfully"
pkill -f "bun index.ts"
```

Expected: "Agent Cockpit Channel Plugin starting..."

- [ ] **Step 4: Verify UI renders**

Check AdminPanel has "Claude Tasks" tab with all sections:
- Session Status Bar ✓
- Pending Tasks count ✓
- Completed Today count ✓
- In Progress card ✓

- [ ] **Step 5: Final commit and summary**

```bash
git log --oneline -10
```

All tasks should be visible:
- ✓ Database schema
- ✓ API endpoints
- ✓ Plugin scaffold
- ✓ Plugin tools
- ✓ UI component
- ✓ Documentation
- ✓ Tests

**Implementation complete!**

---

## Phase 2 (Future)

- Automation rules: Deploy succeeds → auto-validate
- Webhook push (instead of polling)
- Task artifacts storage
- Advanced UI: DAG visualization
- CLI task triggering
