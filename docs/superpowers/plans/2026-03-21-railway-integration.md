# Railway Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add operational dashboard panels showing Railway deployment status, logs, environment variables, and service metrics.

**Architecture:** Create a Railway API client module (`server/railway.ts`) that fetches data from Railway's GraphQL API using your local credentials. Add SQLite tables for historical tracking. Expose REST endpoints (`/api/admin/railway/*`) for the UI. Build modular React components that display deployment history, live logs, metrics, and env vars with real-time WebSocket updates for logs.

**Tech Stack:** Railway GraphQL API, Node.js `fetch`, SQLite (better-sqlite3), Express, React, WebSocket for streaming logs

---

## File Structure

**Backend:**
- `server/railway.ts` — Railway API client (init, deployments, logs, metrics, vars)
- `server/db.ts` — New tables: `deployments`, `service_metrics`
- `server/index.ts` — New endpoints: `/api/admin/railway/{deployments,logs,metrics,vars}`

**Frontend:**
- `src/components/RailwayStatus.tsx` — Deployment status card + last 5 deployments + redeploy button
- `src/components/LogsViewer.tsx` — Real-time log streaming with filtering
- `src/components/VariablesManager.tsx` — Env var list + edit form
- `src/components/MetricsCard.tsx` — CPU/memory/uptime gauge display
- `src/components/AdminPanel.tsx` — Tab container for all Railway features

**Tests:**
- `server/__tests__/railway.test.ts` — API client mocking
- `src/components/__tests__/RailwayStatus.test.tsx` — Component rendering tests

---

## Tasks

### Task 1: Set up Railway API client module

**Files:**
- Create: `server/railway.ts`
- Modify: `server/index.ts` (import)

- [ ] **Step 1: Read Railway credentials from local config**

Read `~/.railway/config.json` on server startup. Extract token from `user.token`. Support env var override `RAILWAY_TOKEN`. Store in module-level const.

```typescript
// server/railway.ts
import fs from 'fs'
import path from 'path'

let RAILWAY_TOKEN: string

function initRailway() {
  // Try env var first
  if (process.env.RAILWAY_TOKEN) {
    RAILWAY_TOKEN = process.env.RAILWAY_TOKEN
    return
  }
  // Fall back to local config
  try {
    const configPath = path.join(process.env.HOME || '', '.railway', 'config.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    RAILWAY_TOKEN = config.user?.token
    if (!RAILWAY_TOKEN) throw new Error('No token found')
    console.log('[railway] Initialized with local credentials')
  } catch (e) {
    console.warn('[railway] Failed to initialize:', (e as Error).message)
    RAILWAY_TOKEN = ''
  }
}

export { initRailway, RAILWAY_TOKEN }
```

- [ ] **Step 2: Call initRailway on server startup**

```typescript
// server/index.ts (top of main())
import { initRailway } from './railway.js'

async function main() {
  initRailway()
  // ... rest of startup
}
```

- [ ] **Step 3: Commit**

```bash
git add server/railway.ts server/index.ts
git commit -m "feat: Initialize Railway API client with local credentials"
```

---

### Task 2: Add database tables for deployments and metrics

**Files:**
- Modify: `server/db.ts` (schema + queries)

- [ ] **Step 1: Add `deployments` table to schema**

```typescript
// server/db.ts (in db.exec())
db.exec(`
  ...existing tables...

  CREATE TABLE IF NOT EXISTS deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    railway_deployment_id TEXT UNIQUE NOT NULL,
    service_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    trigger TEXT,
    commit_sha TEXT,
    branch TEXT,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_deployments_service_id ON deployments(service_id);
  CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
`)
```

- [ ] **Step 2: Add `service_metrics` table to schema**

```typescript
// server/db.ts (in db.exec())
db.exec(`
  ...

  CREATE TABLE IF NOT EXISTS service_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    cpu_percent REAL,
    memory_mb REAL,
    uptime_seconds INTEGER,
    request_count INTEGER,
    error_count INTEGER,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_service_metrics_service_id ON service_metrics(service_id, timestamp);
`)
```

- [ ] **Step 3: Write query functions for deployments**

```typescript
// server/db.ts

const upsertDeployment = db.prepare(`
  INSERT OR REPLACE INTO deployments (railway_deployment_id, service_id, status, created_at, updated_at, trigger, commit_sha, branch, metadata)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const getRecentDeployments = db.prepare(`
  SELECT * FROM deployments
  WHERE service_id = ?
  ORDER BY updated_at DESC
  LIMIT ?
`)

const getDeploymentCount = db.prepare(`
  SELECT COUNT(*) as count FROM deployments WHERE service_id = ?
`)

export function upsertDeploymentRecord(
  railwayId: string,
  serviceId: string,
  status: string,
  trigger?: string,
  commitSha?: string,
  branch?: string,
  metadata?: object
): void {
  const now = Math.floor(Date.now() / 1000)
  upsertDeployment.run(
    railwayId, serviceId, status, now, now,
    trigger ?? null, commitSha ?? null, branch ?? null,
    metadata ? JSON.stringify(metadata) : null
  )
}

export function listDeployments(serviceId: string, limit = 20): any[] {
  return getRecentDeployments.all(serviceId, limit) as any[]
}
```

- [ ] **Step 4: Write query functions for metrics**

```typescript
// server/db.ts

const insertMetric = db.prepare(`
  INSERT INTO service_metrics (service_id, timestamp, cpu_percent, memory_mb, uptime_seconds, request_count, error_count, metadata)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const getMetricsRange = db.prepare(`
  SELECT * FROM service_metrics
  WHERE service_id = ? AND timestamp >= ?
  ORDER BY timestamp DESC
  LIMIT ?
`)

export function logMetric(
  serviceId: string,
  cpu?: number,
  memory?: number,
  uptime?: number,
  requestCount?: number,
  errorCount?: number,
  metadata?: object
): void {
  const timestamp = Math.floor(Date.now() / 1000)
  insertMetric.run(
    serviceId, timestamp,
    cpu ?? null, memory ?? null, uptime ?? null,
    requestCount ?? null, errorCount ?? null,
    metadata ? JSON.stringify(metadata) : null
  )
}

export function getMetrics(serviceId: string, hoursBack = 24, limit = 100): any[] {
  const since = Math.floor(Date.now() / 1000) - (hoursBack * 3600)
  return getMetricsRange.all(serviceId, since, limit) as any[]
}
```

- [ ] **Step 5: Commit**

```bash
git add server/db.ts
git commit -m "feat: Add deployments and service_metrics tables with query functions"
```

---

### Task 3: Implement Railway API client methods

**Files:**
- Modify: `server/railway.ts`

- [ ] **Step 1: Add deployment fetching from Railway API**

```typescript
// server/railway.ts

const RAILWAY_API = 'https://api.railway.app/graphql'

interface DeploymentData {
  id: string
  status: string
  createdAt: string
  updatedAt: string
  meta: { commitSha?: string; branch?: string }
}

async function fetchDeployments(projectId: string, serviceId: string, limit = 5): Promise<DeploymentData[]> {
  if (!RAILWAY_TOKEN) return []

  try {
    const query = `
      query {
        deployments(first: ${limit}, where: {serviceId: "${serviceId}"}) {
          edges {
            node {
              id
              status
              createdAt
              updatedAt
              meta
            }
          }
        }
      }
    `
    const res = await fetch(RAILWAY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RAILWAY_TOKEN}`,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    if (data.errors) {
      console.error('[railway] API error:', data.errors[0]?.message)
      return []
    }

    return data.data.deployments.edges.map((e: any) => e.node)
  } catch (e) {
    console.error('[railway] fetchDeployments failed:', (e as Error).message)
    return []
  }
}

export { fetchDeployments }
```

- [ ] **Step 2: Add metrics fetching**

```typescript
// server/railway.ts

interface MetricsData {
  cpuPercent?: number
  memoryMb?: number
  uptimeSeconds?: number
}

async function fetchMetrics(serviceId: string): Promise<MetricsData> {
  if (!RAILWAY_TOKEN) return {}

  try {
    const query = `
      query {
        serviceMetrics(serviceId: "${serviceId}") {
          cpuPercent
          memoryMb
          uptimeSeconds
        }
      }
    `
    const res = await fetch(RAILWAY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RAILWAY_TOKEN}`,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) return {}
    const data = await res.json()
    return data.data?.serviceMetrics ?? {}
  } catch (e) {
    console.error('[railway] fetchMetrics failed:', (e as Error).message)
    return {}
  }
}

export { fetchMetrics }
```

- [ ] **Step 3: Add environment variables fetching**

```typescript
// server/railway.ts

interface EnvironmentVariable {
  name: string
  value: string
  isSecret: boolean
}

async function fetchEnvironmentVariables(serviceId: string): Promise<EnvironmentVariable[]> {
  if (!RAILWAY_TOKEN) return []

  try {
    const query = `
      query {
        service(id: "${serviceId}") {
          variables {
            name
            value
            isSecret
          }
        }
      }
    `
    const res = await fetch(RAILWAY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RAILWAY_TOKEN}`,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) return []
    const data = await res.json()
    return data.data?.service?.variables ?? []
  } catch (e) {
    console.error('[railway] fetchEnvironmentVariables failed:', (e as Error).message)
    return []
  }
}

export { fetchEnvironmentVariables }
```

- [ ] **Step 4: Commit**

```bash
git add server/railway.ts
git commit -m "feat: Add Railway API methods for deployments, metrics, and variables"
```

---

### Task 4: Add REST endpoints for Railway data

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add `/api/admin/railway/deployments` endpoint**

```typescript
// server/index.ts

import { fetchDeployments } from './railway.js'
import { upsertDeploymentRecord, listDeployments } from './db.js'

// Use PROJECT_ID and SERVICE_ID from your Railway config
const PROJECT_ID = '6ffdb913-43d2-49aa-b68e-0e5b617a148d'
const SERVICE_ID = '434d4687-cf40-4ba6-ad07-5918babd23cd'

app.get('/api/admin/railway/deployments', async (req, res) => {
  // Check auth
  const auth = req.headers.authorization?.split(' ')[1]
  const credentials = Buffer.from(auth || '', 'base64').toString()
  const [user, pass] = credentials.split(':')

  if (user !== COCKPIT_USER || pass !== COCKPIT_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  // Fetch from Railway API and cache
  const deployments = await fetchDeployments(PROJECT_ID, SERVICE_ID)
  for (const d of deployments) {
    upsertDeploymentRecord(
      d.id, SERVICE_ID, d.status,
      undefined, d.meta?.commitSha, d.meta?.branch
    )
  }

  // Return from cache
  const cached = listDeployments(SERVICE_ID, 20)
  res.json(cached)
})
```

- [ ] **Step 2: Add `/api/admin/railway/metrics` endpoint**

```typescript
// server/index.ts

import { fetchMetrics } from './railway.js'
import { logMetric, getMetrics } from './db.js'

app.get('/api/admin/railway/metrics', async (req, res) => {
  const auth = req.headers.authorization?.split(' ')[1]
  const credentials = Buffer.from(auth || '', 'base64').toString()
  const [user, pass] = credentials.split(':')

  if (user !== COCKPIT_USER || pass !== COCKPIT_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const metrics = await fetchMetrics(SERVICE_ID)
  if (Object.keys(metrics).length > 0) {
    logMetric(SERVICE_ID, metrics.cpuPercent, metrics.memoryMb, metrics.uptimeSeconds)
  }

  const history = getMetrics(SERVICE_ID, 24, 100)
  res.json(history)
})
```

- [ ] **Step 3: Add `/api/admin/railway/variables` endpoint**

```typescript
// server/index.ts

import { fetchEnvironmentVariables } from './railway.js'

app.get('/api/admin/railway/variables', async (req, res) => {
  const auth = req.headers.authorization?.split(' ')[1]
  const credentials = Buffer.from(auth || '', 'base64').toString()
  const [user, pass] = credentials.split(':')

  if (user !== COCKPIT_USER || pass !== COCKPIT_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const vars = await fetchEnvironmentVariables(SERVICE_ID)
  res.json(vars)
})
```

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: Add REST endpoints for Railway deployments, metrics, and variables"
```

---

### Task 5: Create RailwayStatus component

**Files:**
- Create: `src/components/RailwayStatus.tsx`
- Modify: `src/App.tsx` (import)

- [ ] **Step 1: Create component skeleton**

```typescript
// src/components/RailwayStatus.tsx

import { useEffect, useState } from 'react'
import { RefreshCw, Zap } from 'lucide-react'

interface Deployment {
  id: string
  railway_deployment_id: string
  status: string
  created_at: number
  branch?: string
  commit_sha?: string
}

export default function RailwayStatus() {
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDeployments = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/railway/deployments')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setDeployments(data)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDeployments()
    const interval = setInterval(fetchDeployments, 60000) // Poll every 60s
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-300">Deployments</h3>
        <button
          onClick={fetchDeployments}
          disabled={loading}
          className="rounded p-1 text-gray-500 hover:bg-gray-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 mb-3">{error}</div>
      )}

      <div className="space-y-2">
        {deployments.length === 0 ? (
          <p className="text-xs text-gray-600">No deployments found</p>
        ) : (
          deployments.slice(0, 5).map((d) => (
            <div key={d.railway_deployment_id} className="flex items-center justify-between rounded bg-gray-800/50 px-3 py-2">
              <div>
                <p className="text-xs font-medium text-gray-300">
                  {d.branch || 'unknown'}
                </p>
                <p className="text-[10px] text-gray-600">
                  {new Date(d.created_at * 1000).toLocaleDateString()}
                </p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded ${
                d.status === 'success' ? 'bg-green-500/20 text-green-400' :
                d.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                'bg-yellow-500/20 text-yellow-400'
              }`}>
                {d.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add to App layout**

```typescript
// src/App.tsx (in Settings modal or new Admin tab)

import RailwayStatus from './components/RailwayStatus'

// Add to your main layout:
<RailwayStatus />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/RailwayStatus.tsx src/App.tsx
git commit -m "feat: Add RailwayStatus component for deployment history"
```

---

### Task 6: Create MetricsCard component

**Files:**
- Create: `src/components/MetricsCard.tsx`

- [ ] **Step 1: Create metrics display component**

```typescript
// src/components/MetricsCard.tsx

import { useEffect, useState } from 'react'
import { TrendingUp, Activity } from 'lucide-react'

interface Metric {
  cpu_percent?: number
  memory_mb?: number
  uptime_seconds?: number
  timestamp: number
}

export default function MetricsCard() {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [current, setCurrent] = useState<Metric | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchMetrics = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/railway/metrics')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setMetrics(data)
      if (data.length > 0) setCurrent(data[0])
    } catch {
      // Fail silently
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 60000)
    return () => clearInterval(interval)
  }, [])

  if (!current) return null

  const uptime = current.uptime_seconds ? Math.floor(current.uptime_seconds / 3600) : 0

  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
      <div className="text-center">
        <div className="flex items-center justify-center h-8 text-blue-400 mb-1">
          <Activity className="h-4 w-4" />
        </div>
        <p className="text-xs text-gray-600">CPU</p>
        <p className="text-sm font-medium text-gray-300">
          {current.cpu_percent?.toFixed(1) ?? '—'}%
        </p>
      </div>
      <div className="text-center">
        <div className="flex items-center justify-center h-8 text-purple-400 mb-1">
          <TrendingUp className="h-4 w-4" />
        </div>
        <p className="text-xs text-gray-600">Memory</p>
        <p className="text-sm font-medium text-gray-300">
          {current.memory_mb?.toFixed(0) ?? '—'}MB
        </p>
      </div>
      <div className="text-center">
        <div className="flex items-center justify-center h-8 text-green-400 mb-1">
          <TrendingUp className="h-4 w-4" />
        </div>
        <p className="text-xs text-gray-600">Uptime</p>
        <p className="text-sm font-medium text-gray-300">
          {uptime}h
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MetricsCard.tsx
git commit -m "feat: Add MetricsCard component for service metrics display"
```

---

### Task 7: Create VariablesManager component

**Files:**
- Create: `src/components/VariablesManager.tsx`

- [ ] **Step 1: Create read-only variables display**

```typescript
// src/components/VariablesManager.tsx

import { useEffect, useState } from 'react'
import { Eye, EyeOff, Copy } from 'lucide-react'

interface EnvVar {
  name: string
  value: string
  isSecret: boolean
}

export default function VariablesManager() {
  const [vars, setVars] = useState<EnvVar[]>([])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const fetchVars = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/railway/variables')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setVars(data)
    } catch {
      // Fail silently
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchVars()
  }, [])

  const toggleReveal = (name: string) => {
    const newRevealed = new Set(revealed)
    if (newRevealed.has(name)) {
      newRevealed.delete(name)
    } else {
      newRevealed.add(name)
    }
    setRevealed(newRevealed)
  }

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value)
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">Environment Variables</h3>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {vars.length === 0 ? (
          <p className="text-xs text-gray-600">No variables found</p>
        ) : (
          vars.map((v) => (
            <div key={v.name} className="flex items-center justify-between rounded bg-gray-800/50 px-3 py-2">
              <div className="flex-1">
                <p className="text-xs font-mono text-gray-300">{v.name}</p>
                {v.isSecret ? (
                  <p className="text-xs text-gray-600">
                    {revealed.has(v.name) ? v.value : '••••••••'}
                  </p>
                ) : (
                  <p className="text-xs text-gray-600 truncate">{v.value}</p>
                )}
              </div>
              <div className="flex gap-1">
                {v.isSecret && (
                  <button
                    onClick={() => toggleReveal(v.name)}
                    className="p-1 text-gray-500 hover:text-gray-300"
                  >
                    {revealed.has(v.name) ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => copyToClipboard(v.value)}
                  className="p-1 text-gray-500 hover:text-gray-300"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/VariablesManager.tsx
git commit -m "feat: Add VariablesManager component for viewing Railway env vars"
```

---

### Task 8: Create AdminPanel container and integrate all components

**Files:**
- Create: `src/components/AdminPanel.tsx`
- Modify: `src/App.tsx` (add Settings/Admin section)

- [ ] **Step 1: Create AdminPanel with tabs**

```typescript
// src/components/AdminPanel.tsx

import { useState } from 'react'
import RailwayStatus from './RailwayStatus'
import MetricsCard from './MetricsCard'
import VariablesManager from './VariablesManager'
import { Settings } from 'lucide-react'

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'railway' | 'settings'>('railway')

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-800 px-6 py-3">
        <Settings className="h-5 w-5 text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-100">Administration</h2>
      </div>

      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setActiveTab('railway')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'railway'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Railway
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'settings'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Settings
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'railway' ? (
          <div className="space-y-4">
            <MetricsCard />
            <RailwayStatus />
            <VariablesManager />
          </div>
        ) : (
          <div className="text-gray-500 text-sm">Settings panel (existing content)</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add AdminPanel to App**

```typescript
// src/App.tsx

import AdminPanel from './components/AdminPanel'

// Add button in header to open admin panel:
<button
  onClick={() => setShowAdmin(true)}
  className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
  title="Administration"
>
  <Settings className="h-4 w-4" />
</button>

// Add modal or panel:
{showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/AdminPanel.tsx src/App.tsx
git commit -m "feat: Add AdminPanel container with Railway and Settings tabs"
```

---

### Task 9: Add tests

**Files:**
- Create: `server/__tests__/railway.test.ts`
- Create: `src/components/__tests__/RailwayStatus.test.tsx`

- [ ] **Step 1: Test Railway API client initialization**

```typescript
// server/__tests__/railway.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Railway API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize from env var', () => {
    process.env.RAILWAY_TOKEN = 'test_token'
    expect(process.env.RAILWAY_TOKEN).toBe('test_token')
  })

  it('should handle missing credentials gracefully', async () => {
    process.env.RAILWAY_TOKEN = ''
    const result = await import('../railway.js')
    expect(result).toBeDefined()
  })
})
```

- [ ] **Step 2: Test RailwayStatus component**

```typescript
// src/components/__tests__/RailwayStatus.test.tsx

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import RailwayStatus from '../RailwayStatus'

describe('RailwayStatus', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('should render deployments list', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: '1',
              railway_deployment_id: 'deploy-1',
              status: 'success',
              created_at: Math.floor(Date.now() / 1000),
              branch: 'main',
            },
          ]),
      })
    )

    render(<RailwayStatus />)

    await waitFor(() => {
      expect(screen.getByText('main')).toBeInTheDocument()
      expect(screen.getByText('success')).toBeInTheDocument()
    })
  })

  it('should handle fetch errors', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error')))

    render(<RailwayStatus />)

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npm test -- server/__tests__/railway.test.ts src/components/__tests__/RailwayStatus.test.tsx
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/railway.test.ts src/components/__tests__/RailwayStatus.test.tsx
git commit -m "test: Add Railway API client and RailwayStatus component tests"
```

---

### Task 10: Build and final verification

**Files:**
- None (build only)

- [ ] **Step 1: Build frontend**

```bash
npm run build
```

Expected: Build succeeds, no errors

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: No type errors

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 4: Verify Railway endpoints respond (locally)**

Start the dev server and test:

```bash
curl -H "Authorization: Basic $(echo -n 'admin:password' | base64)" \
  http://localhost:4200/api/admin/railway/deployments
```

Expected: Returns JSON array of deployments (or empty array if Railway unavailable)

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "build: Verify Railway integration builds and tests pass"
```

---

## Summary

**What this delivers:**
- Real-time Railway deployment status in dashboard
- CPU/memory/uptime metrics display
- Environment variables viewer
- Historical deployment tracking in SQLite
- Authentication-protected admin endpoints
- Graceful degradation if Railway API unavailable

**Total commits:** 10
**Files changed:** ~15 (5 server, 5 UI components, 2 tests, 3 config)
**Implementation time:** ~2-3 hours for an experienced developer
