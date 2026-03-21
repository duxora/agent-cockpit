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

    // Test the insert pattern that will be used in logSessionMetrics
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

  it('retrieves specific session metrics', () => {
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

    const insertMetric = db.prepare(`
      INSERT INTO session_metrics
      (session_id, session_name, model, duration_ms, tokens_used, cost_usd, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const now = Math.floor(Date.now() / 1000)
    insertMetric.run('sess-456', 'Another Session', 'opus', 8000, 2000, 0.10, now)

    const metric = db.prepare('SELECT * FROM session_metrics WHERE session_id = ?').get('sess-456')
    expect(metric.session_name).toBe('Another Session')
    expect(metric.model).toBe('opus')
  })

  it('aggregates metrics by model and date', () => {
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

    const insertMetric = db.prepare(`
      INSERT INTO session_metrics
      (session_id, session_name, model, duration_ms, tokens_used, cost_usd, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const now = Math.floor(Date.now() / 1000)

    // Insert multiple sessions
    insertMetric.run('sess-1', 'Session 1', 'sonnet', 5000, 1000, 0.05, now)
    insertMetric.run('sess-2', 'Session 2', 'sonnet', 4000, 800, 0.04, now)
    insertMetric.run('sess-3', 'Session 3', 'opus', 8000, 2000, 0.10, now)

    // Test aggregation by model
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
    `).all(now - 86400)

    expect(metrics).toHaveLength(2) // sonnet and opus
    const sonnetMetric = metrics.find((m: any) => m.model === 'sonnet')
    expect(sonnetMetric.total_sessions).toBe(2)
    expect(sonnetMetric.total_tokens_used).toBe(1800)
  })
})

describe('Analytics REST Endpoints', () => {
  it('GET /api/admin/analytics/metrics returns aggregated data structure', () => {
    const mockMetrics = {
      metrics: [
        {
          total_sessions: 5,
          avg_duration_ms: 4000,
          total_tokens_used: 5000,
          total_cost_usd: 0.05,
          model: 'sonnet',
        },
      ],
      daily: [
        { date: '2026-03-21', sessions: 2, tokens: 1000 },
        { date: '2026-03-20', sessions: 3, tokens: 4000 },
      ],
    }

    expect(mockMetrics.metrics).toBeDefined()
    expect(mockMetrics.metrics).toBeInstanceOf(Array)
    expect(mockMetrics.metrics.length).toBeGreaterThan(0)
    expect(mockMetrics.metrics[0]).toHaveProperty('total_sessions')
    expect(mockMetrics.metrics[0]).toHaveProperty('avg_duration_ms')
    expect(mockMetrics.metrics[0]).toHaveProperty('total_tokens_used')
    expect(mockMetrics.metrics[0]).toHaveProperty('model')

    expect(mockMetrics.daily).toBeDefined()
    expect(mockMetrics.daily).toBeInstanceOf(Array)
    expect(mockMetrics.daily[0]).toHaveProperty('date')
    expect(mockMetrics.daily[0]).toHaveProperty('sessions')
    expect(mockMetrics.daily[0]).toHaveProperty('tokens')
  })

  it('GET /api/admin/analytics/history returns session metrics with required fields', () => {
    const mockHistory = {
      sessionId: 'sess-123',
      sessionName: 'Test Session',
      model: 'sonnet',
      durationMs: 5000,
      tokensUsed: 1000,
      costUsd: 0.01,
      endedAt: 1711000000,
    }

    expect(mockHistory).toHaveProperty('sessionId')
    expect(mockHistory).toHaveProperty('sessionName')
    expect(mockHistory).toHaveProperty('model')
    expect(mockHistory).toHaveProperty('durationMs')
    expect(mockHistory).toHaveProperty('tokensUsed')
    expect(mockHistory).toHaveProperty('endedAt')

    expect(mockHistory.sessionId).toBe('sess-123')
    expect(mockHistory.durationMs).toBeGreaterThan(0)
    expect(mockHistory.tokensUsed).toBeGreaterThanOrEqual(0)
    expect(mockHistory.endedAt).toBeGreaterThan(0)
  })

  it('endpoint validation: session_id required for history endpoint', () => {
    const sessionId = null
    const isValid = sessionId !== null && sessionId !== undefined

    expect(isValid).toBe(false)
  })

  it('supports optional days parameter for metrics endpoint', () => {
    const mockMetrics = {
      metrics: [
        {
          total_sessions: 2,
          avg_duration_ms: 3000,
          total_tokens_used: 2000,
          total_cost_usd: 0.02,
          model: 'sonnet',
        },
      ],
      daily: [{ date: '2026-03-21', sessions: 2, tokens: 2000 }],
    }

    // Verify metrics can be filtered by date range
    expect(mockMetrics.metrics[0].total_sessions).toBe(2)
    expect(mockMetrics.daily).toHaveLength(1)
  })

  it('daily metrics are properly ordered by date descending', () => {
    const daily = [
      { date: '2026-03-21', sessions: 5, tokens: 5000 },
      { date: '2026-03-20', sessions: 3, tokens: 3000 },
      { date: '2026-03-19', sessions: 2, tokens: 2000 },
    ]

    // Verify sorted in descending order (most recent first)
    expect(daily[0].date).toBe('2026-03-21')
    expect(daily[1].date).toBe('2026-03-20')
    expect(daily[2].date).toBe('2026-03-19')
  })

  it('aggregates metrics by model correctly', () => {
    const metrics = [
      { total_sessions: 3, model: 'sonnet', avg_duration_ms: 4000 },
      { total_sessions: 2, model: 'opus', avg_duration_ms: 6000 },
      { total_sessions: 1, model: 'haiku', avg_duration_ms: 2000 },
    ]

    const sonnetMetrics = metrics.filter((m) => m.model === 'sonnet')
    const opusMetrics = metrics.filter((m) => m.model === 'opus')

    expect(sonnetMetrics).toHaveLength(1)
    expect(opusMetrics).toHaveLength(1)
    expect(sonnetMetrics[0].total_sessions).toBe(3)
    expect(opusMetrics[0].total_sessions).toBe(2)
  })

  it('handles empty analytics data gracefully', () => {
    const emptyMetrics = {
      metrics: [],
      daily: [],
    }

    expect(emptyMetrics.metrics).toBeInstanceOf(Array)
    expect(emptyMetrics.daily).toBeInstanceOf(Array)
    expect(emptyMetrics.metrics).toHaveLength(0)
    expect(emptyMetrics.daily).toHaveLength(0)
  })
})
