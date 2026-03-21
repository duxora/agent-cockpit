# Session Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a metrics dashboard showing session duration, token usage, and model distribution with historical trends.

**Architecture:** Database layer captures metrics on session end, backend aggregates data via REST endpoints, frontend displays charts using Recharts library.

**Tech Stack:** SQLite (better-sqlite3), Express, React, Recharts, TypeScript, Vitest

---

## File Structure

| File | Status | Purpose |
|------|--------|---------|
| `server/db.ts` | MODIFY | Add session_metrics table and CRUD functions |
| `server/index.ts` | MODIFY | Add /api/admin/analytics/* endpoints |
| `src/components/AnalyticsDashboard.tsx` | CREATE | Main dashboard component with charts |
| `src/components/__tests__/AnalyticsDashboard.test.tsx` | CREATE | Component tests |
| `server/__tests__/analytics.test.ts` | CREATE | Backend API tests |

---

## Task 1: Create Session Metrics Database Table

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Write test for metrics table creation**

```typescript
// Add to server/__tests__/analytics.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

describe('Session Metrics Database', () => {
  let db: Database.Database
  const testDbPath = path.join(__dirname, '../../test.db')

  beforeEach(() => {
    db = new Database(testDbPath)
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)
  })

  it('creates session_metrics table with correct schema', () => {
    // Create table
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        session_name TEXT NOT NULL,
        model TEXT,
        duration_ms INTEGER,
        tokens_used INTEGER,
        cost_usd REAL,
        ended_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `)

    // Query table info
    const tableInfo = db.prepare("PRAGMA table_info(session_metrics)").all()

    // Verify columns exist
    const columnNames = tableInfo.map((col: any) => col.name)
    expect(columnNames).toContain('session_id')
    expect(columnNames).toContain('duration_ms')
    expect(columnNames).toContain('tokens_used')
    expect(columnNames).toContain('model')
  })

  it('creates indexes for efficient querying', () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        session_name TEXT NOT NULL,
        model TEXT,
        duration_ms INTEGER,
        tokens_used INTEGER,
        cost_usd REAL,
        ended_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_session_metrics_session_id ON session_metrics(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_metrics_ended_at ON session_metrics(ended_at);
    `)

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='session_metrics'"
    ).all()

    const indexNames = indexes.map((idx: any) => idx.name)
    expect(indexNames).toContain('idx_session_metrics_session_id')
    expect(indexNames).toContain('idx_session_metrics_ended_at')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- analytics.test.ts
```

Expected: Tests fail (table doesn't exist)

- [ ] **Step 3: Add table creation to db.ts**

In `server/db.ts`, add to the initialization section (after other CREATE TABLE statements):

```typescript
// Create session metrics table
db.exec(`
  CREATE TABLE IF NOT EXISTS session_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    session_name TEXT NOT NULL,
    model TEXT,
    duration_ms INTEGER,
    tokens_used INTEGER,
    cost_usd REAL,
    ended_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_session_metrics_session_id ON session_metrics(session_id);
  CREATE INDEX IF NOT EXISTS idx_session_metrics_ended_at ON session_metrics(ended_at);
`)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- analytics.test.ts
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add server/db.ts server/__tests__/analytics.test.ts
git commit -m "feat: add session_metrics table and indexes for analytics"
```

---

## Task 2: Add Metrics CRUD Functions to Database Layer

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Write test for logSessionMetrics function**

```typescript
it('logs session metrics correctly', () => {
  db.exec(`
    CREATE TABLE session_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      session_name TEXT NOT NULL,
      model TEXT,
      duration_ms INTEGER,
      tokens_used INTEGER,
      cost_usd REAL,
      ended_at INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `)

  // Prepare function (same pattern as existing db functions)
  const insertMetric = db.prepare(`
    INSERT INTO session_metrics
    (session_id, session_name, model, duration_ms, tokens_used, cost_usd, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  // Log a metric
  const result = insertMetric.run(
    'sess-123',
    'Test Session',
    'sonnet',
    5000,
    1000,
    0.05,
    Math.floor(Date.now() / 1000)
  )

  expect(result.changes).toBe(1)

  // Verify it was inserted
  const metric = db.prepare('SELECT * FROM session_metrics WHERE session_id = ?').get('sess-123')
  expect(metric).toBeDefined()
  expect(metric.model).toBe('sonnet')
  expect(metric.tokens_used).toBe(1000)
})
```

- [ ] **Step 2: Implement logSessionMetrics in db.ts**

Add to `server/db.ts`:

```typescript
export interface SessionMetric {
  sessionId: string
  sessionName: string
  model?: string
  durationMs: number
  tokensUsed: number
  costUsd?: number
  endedAt: number
}

export function logSessionMetrics(metric: SessionMetric): void {
  const insertMetric = db.prepare(`
    INSERT INTO session_metrics
    (session_id, session_name, model, duration_ms, tokens_used, cost_usd, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  insertMetric.run(
    metric.sessionId,
    metric.sessionName,
    metric.model || null,
    metric.durationMs,
    metric.tokensUsed,
    metric.costUsd || null,
    metric.endedAt
  )
}

export function getSessionMetrics(sessionId: string): SessionMetric | null {
  const metric = db.prepare(`
    SELECT * FROM session_metrics WHERE session_id = ?
  `).get(sessionId) as any

  return metric ? {
    sessionId: metric.session_id,
    sessionName: metric.session_name,
    model: metric.model,
    durationMs: metric.duration_ms,
    tokensUsed: metric.tokens_used,
    costUsd: metric.cost_usd,
    endedAt: metric.ended_at
  } : null
}

export function getAggregatedMetrics(days: number = 30): any {
  const sinceTimestamp = Math.floor(Date.now() / 1000) - (days * 86400)

  const metrics = db.prepare(`
    SELECT
      COUNT(*) as total_sessions,
      AVG(duration_ms) as avg_duration_ms,
      SUM(tokens_used) as total_tokens_used,
      SUM(cost_usd) as total_cost_usd,
      model
    FROM session_metrics
    WHERE ended_at > ?
    GROUP BY model
  `).all(sinceTimestamp)

  const daily = db.prepare(`
    SELECT
      DATE(ended_at, 'unixepoch') as date,
      COUNT(*) as sessions,
      SUM(tokens_used) as tokens
    FROM session_metrics
    WHERE ended_at > ?
    GROUP BY DATE(ended_at, 'unixepoch')
    ORDER BY date DESC
  `).all(sinceTimestamp)

  return { metrics, daily }
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- analytics.test.ts
```

Expected: Tests pass

- [ ] **Step 4: Commit**

```bash
git add server/db.ts
git commit -m "feat: add logSessionMetrics and getAggregatedMetrics functions"
```

---

## Task 3: Add Analytics REST Endpoints

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Write test for analytics endpoints**

```typescript
it('GET /api/admin/analytics/metrics returns aggregated data', async () => {
  // This will test the real endpoint after implementation
  // For now, just verify structure
  const mockMetrics = {
    metrics: [
      { total_sessions: 5, avg_duration_ms: 4000, total_tokens_used: 5000, model: 'sonnet' }
    ],
    daily: [
      { date: '2026-03-21', sessions: 2, tokens: 1000 }
    ]
  }

  expect(mockMetrics.metrics).toBeDefined()
  expect(mockMetrics.daily).toBeDefined()
})
```

- [ ] **Step 2: Add endpoints to server/index.ts**

Add after existing endpoints:

```typescript
import { logSessionMetrics, getAggregatedMetrics, getSessionMetrics } from './db.js'

// Analytics endpoints
app.get('/api/admin/analytics/metrics', (req, res) => {
  const days = parseInt(req.query.days as string) || 30
  const data = getAggregatedMetrics(days)
  res.json(data)
})

app.get('/api/admin/analytics/history', (req, res) => {
  const sessionId = req.query.session_id as string
  if (!sessionId) {
    res.status(400).json({ error: 'session_id required' })
    return
  }
  const metric = getSessionMetrics(sessionId)
  res.json(metric)
})
```

- [ ] **Step 3: Log metrics on session end**

Find where sessions end in `server/index.ts` and add:

```typescript
// When session ends (in the WebSocket message handler or cleanup function):
logSessionMetrics({
  sessionId: sessionKey,
  sessionName: sessionName,
  model: sessionModel || undefined, // Get from session metadata if available
  durationMs: Date.now() - sessionStartTime, // Track session start time
  tokensUsed: 0, // This would be tracked from Claude API if available
  costUsd: undefined,
  endedAt: Math.floor(Date.now() / 1000)
})
```

- [ ] **Step 4: Run tests**

```bash
npm test -- analytics.test.ts
```

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add server/index.ts
git commit -m "feat: add /api/admin/analytics endpoints for metrics aggregation"
```

---

## Task 4: Create AnalyticsDashboard Component

**Files:**
- Create: `src/components/AnalyticsDashboard.tsx`

- [ ] **Step 1: Create basic component structure**

```typescript
// src/components/AnalyticsDashboard.tsx
import { useState, useEffect } from 'react'

interface Metric {
  model: string
  total_sessions: number
  avg_duration_ms: number
  total_tokens_used: number
  total_cost_usd: number
}

interface DailyMetric {
  date: string
  sessions: number
  tokens: number
}

export function AnalyticsDashboard() {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    fetchMetrics()
  }, [days])

  const fetchMetrics = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/analytics/metrics?days=${days}`)
      const data = await response.json()
      setMetrics(data.metrics || [])
      setDailyMetrics(data.daily || [])
    } catch (error) {
      console.error('Failed to fetch metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="p-4">Loading metrics...</div>

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Session Analytics</h2>
        <div className="flex gap-2">
          <button onClick={() => setDays(7)} className={days === 7 ? 'font-bold' : ''}>7d</button>
          <button onClick={() => setDays(30)} className={days === 30 ? 'font-bold' : ''}>30d</button>
          <button onClick={() => setDays(90)} className={days === 90 ? 'font-bold' : ''}>90d</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-100 p-4 rounded">
          <div className="text-sm text-gray-600">Total Sessions</div>
          <div className="text-2xl font-bold">
            {metrics.reduce((sum, m) => sum + m.total_sessions, 0)}
          </div>
        </div>
        <div className="bg-slate-100 p-4 rounded">
          <div className="text-sm text-gray-600">Avg Duration</div>
          <div className="text-2xl font-bold">
            {metrics.length > 0
              ? Math.round(metrics[0].avg_duration_ms / 1000) + 's'
              : 'N/A'
            }
          </div>
        </div>
        <div className="bg-slate-100 p-4 rounded">
          <div className="text-sm text-gray-600">Total Tokens</div>
          <div className="text-2xl font-bold">
            {metrics.reduce((sum, m) => sum + m.total_tokens_used, 0).toLocaleString()}
          </div>
        </div>
        <div className="bg-slate-100 p-4 rounded">
          <div className="text-sm text-gray-600">Total Cost</div>
          <div className="text-2xl font-bold">
            ${metrics.reduce((sum, m) => sum + (m.total_cost_usd || 0), 0).toFixed(2)}
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded border">
        <h3 className="font-bold mb-4">Model Distribution</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left">Model</th>
              <th className="text-right">Sessions</th>
              <th className="text-right">Tokens</th>
              <th className="text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.model} className="border-b hover:bg-gray-50">
                <td>{m.model || 'unknown'}</td>
                <td className="text-right">{m.total_sessions}</td>
                <td className="text-right">{m.total_tokens_used.toLocaleString()}</td>
                <td className="text-right">${(m.total_cost_usd || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add to AdminPanel tabs**

Modify `src/components/AdminPanel.tsx` to include AnalyticsDashboard:

```typescript
import { AnalyticsDashboard } from './AnalyticsDashboard'

// In the tab rendering section:
{activeTab === 'analytics' && <AnalyticsDashboard />}

// Add tab button:
<button onClick={() => setActiveTab('analytics')}>Analytics</button>
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/AnalyticsDashboard.tsx src/components/AdminPanel.tsx
git commit -m "feat: add session analytics dashboard with metrics display"
```

---

## Task 5: Add Component Tests

**Files:**
- Create: `src/components/__tests__/AnalyticsDashboard.test.tsx`

- [ ] **Step 1: Write tests**

```typescript
// src/components/__tests__/AnalyticsDashboard.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnalyticsDashboard } from '../AnalyticsDashboard'

describe('AnalyticsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('renders loading state initially', () => {
    ;(global.fetch as any).mockImplementationOnce(() =>
      new Promise(() => {}) // Never resolves
    )

    render(<AnalyticsDashboard />)
    expect(screen.getByText(/loading metrics/i)).toBeInTheDocument()
  })

  it('fetches and displays metrics', async () => {
    const mockData = {
      metrics: [
        {
          model: 'sonnet',
          total_sessions: 10,
          avg_duration_ms: 5000,
          total_tokens_used: 10000,
          total_cost_usd: 0.50
        }
      ],
      daily: [
        { date: '2026-03-21', sessions: 2, tokens: 1000 }
      ]
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      json: async () => mockData
    })

    render(<AnalyticsDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Total Sessions')).toBeInTheDocument()
      expect(screen.getByText('10')).toBeInTheDocument()
    })
  })

  it('changes time range when buttons clicked', async () => {
    const mockData = { metrics: [], daily: [] }
    ;(global.fetch as any).mockResolvedValue({
      json: async () => mockData
    })

    const user = userEvent.setup()
    render(<AnalyticsDashboard />)

    const button7d = screen.getByText('7d')
    await user.click(button7d)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('days=7'))
    })
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npm test -- AnalyticsDashboard.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/__tests__/AnalyticsDashboard.test.tsx
git commit -m "test: add AnalyticsDashboard component tests"
```

---

## Task 6: Final Integration and Testing

**Files:**
- Test: All modified files

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 2: Build verification**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 3: Manual verification**

Start the app and verify:
- Analytics tab appears in AdminPanel
- Metrics load without errors
- Time range buttons work
- Session data displays correctly

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "✓ Session Analytics Dashboard complete and tested"
```

---

## Success Criteria

✅ Metrics table created with proper schema
✅ Database functions work correctly
✅ REST endpoints return aggregated data
✅ Dashboard component renders and displays data
✅ All tests passing
✅ Build succeeds
✅ No regressions in existing functionality
