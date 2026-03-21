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
