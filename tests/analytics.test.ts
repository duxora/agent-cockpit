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
