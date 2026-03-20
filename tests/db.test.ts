import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import os from 'os'
import fs from 'fs'

// Create a test database in temp directory to avoid touching production db
const TEST_DB_PATH = path.join(os.tmpdir(), `cockpit-test-${Date.now()}.db`)

function createTestDb() {
  const db = new Database(TEST_DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      data TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS managed_sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cwd TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      started_at INTEGER NOT NULL,
      last_heartbeat INTEGER NOT NULL,
      metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS session_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      cwd TEXT DEFAULT '~',
      icon TEXT DEFAULT '🤖',
      category TEXT DEFAULT 'general',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)
  return db
}

describe('Session Events', () => {
  let db: InstanceType<typeof Database>
  let insertEvent: ReturnType<InstanceType<typeof Database>['prepare']>
  let getEvents: ReturnType<InstanceType<typeof Database>['prepare']>
  let getRecentEvents: ReturnType<InstanceType<typeof Database>['prepare']>

  beforeEach(() => {
    db = createTestDb()
    db.exec('DELETE FROM session_events')
    insertEvent = db.prepare('INSERT INTO session_events (session_name, event_type, data) VALUES (?, ?, ?)')
    getEvents = db.prepare('SELECT id, session_name as sessionName, event_type as eventType, data, created_at as createdAt FROM session_events WHERE session_name = ? ORDER BY created_at DESC LIMIT ?')
    getRecentEvents = db.prepare('SELECT id, session_name as sessionName, event_type as eventType, data, created_at as createdAt FROM session_events ORDER BY created_at DESC LIMIT ?')
  })

  it('inserts and retrieves session events', () => {
    insertEvent.run('test-session', 'created', '{"command":"claude"}')
    const events = getEvents.all('test-session', 10) as any[]
    expect(events).toHaveLength(1)
    expect(events[0].sessionName).toBe('test-session')
    expect(events[0].eventType).toBe('created')
    expect(events[0].data).toBe('{"command":"claude"}')
  })

  it('inserts events with null data', () => {
    insertEvent.run('test-session', 'killed', null)
    const events = getEvents.all('test-session', 10) as any[]
    expect(events).toHaveLength(1)
    expect(events[0].data).toBeNull()
  })

  it('retrieves recent events across sessions', () => {
    insertEvent.run('session-1', 'created', null)
    insertEvent.run('session-2', 'created', null)
    insertEvent.run('session-1', 'killed', null)

    const events = getRecentEvents.all(10) as any[]
    expect(events).toHaveLength(3)
  })

  it('respects limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      insertEvent.run('test', `event-${i}`, null)
    }
    const events = getEvents.all('test', 3) as any[]
    expect(events).toHaveLength(3)
  })

  it('returns empty array for unknown session', () => {
    const events = getEvents.all('nonexistent', 10) as any[]
    expect(events).toHaveLength(0)
  })
})

describe('Managed Sessions', () => {
  let db: InstanceType<typeof Database>
  let upsertSession: ReturnType<InstanceType<typeof Database>['prepare']>
  let updateHeartbeat: ReturnType<InstanceType<typeof Database>['prepare']>
  let stopSession: ReturnType<InstanceType<typeof Database>['prepare']>
  let getActiveSessions: ReturnType<InstanceType<typeof Database>['prepare']>
  let cleanupIdle: ReturnType<InstanceType<typeof Database>['prepare']>
  let cleanupStopped: ReturnType<InstanceType<typeof Database>['prepare']>
  let deleteOld: ReturnType<InstanceType<typeof Database>['prepare']>

  beforeEach(() => {
    db = createTestDb()
    db.exec('DELETE FROM managed_sessions')
    upsertSession = db.prepare(
      `INSERT OR REPLACE INTO managed_sessions (id, name, cwd, status, started_at, last_heartbeat, metadata) VALUES (?, ?, ?, 'active', ?, ?, ?)`
    )
    updateHeartbeat = db.prepare('UPDATE managed_sessions SET last_heartbeat = ?, status = ? WHERE id = ?')
    stopSession = db.prepare(`UPDATE managed_sessions SET status = 'stopped' WHERE id = ?`)
    getActiveSessions = db.prepare(`SELECT * FROM managed_sessions WHERE status != 'stopped' ORDER BY last_heartbeat DESC`)
    cleanupIdle = db.prepare(`UPDATE managed_sessions SET status = 'idle' WHERE status = 'active' AND last_heartbeat < ?`)
    cleanupStopped = db.prepare(`UPDATE managed_sessions SET status = 'stopped' WHERE status IN ('active', 'idle') AND last_heartbeat < ?`)
    deleteOld = db.prepare(`DELETE FROM managed_sessions WHERE status = 'stopped' AND last_heartbeat < ?`)
  })

  it('registers a new session', () => {
    const now = Math.floor(Date.now() / 1000)
    upsertSession.run('session-1', 'my-project', '/home/user/project', now, now, null)

    const sessions = getActiveSessions.all() as any[]
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe('session-1')
    expect(sessions[0].name).toBe('my-project')
    expect(sessions[0].cwd).toBe('/home/user/project')
    expect(sessions[0].status).toBe('active')
  })

  it('replaces session on re-register (INSERT OR REPLACE)', () => {
    const now = Math.floor(Date.now() / 1000)
    upsertSession.run('session-1', 'old-name', '/old/path', now - 100, now - 100, null)
    upsertSession.run('session-1', 'new-name', '/new/path', now, now, null)

    const sessions = getActiveSessions.all() as any[]
    expect(sessions).toHaveLength(1)
    expect(sessions[0].name).toBe('new-name')
    expect(sessions[0].cwd).toBe('/new/path')
  })

  it('updates heartbeat and status', () => {
    const now = Math.floor(Date.now() / 1000)
    upsertSession.run('session-1', 'test', '/tmp', now, now, null)

    updateHeartbeat.run(now + 60, 'waiting', 'session-1')

    const sessions = getActiveSessions.all() as any[]
    expect(sessions[0].status).toBe('waiting')
    expect(sessions[0].last_heartbeat).toBe(now + 60)
  })

  it('stops a session', () => {
    const now = Math.floor(Date.now() / 1000)
    upsertSession.run('session-1', 'test', '/tmp', now, now, null)
    stopSession.run('session-1')

    const sessions = getActiveSessions.all() as any[]
    expect(sessions).toHaveLength(0) // stopped sessions excluded
  })

  it('handles multiple concurrent sessions', () => {
    const now = Math.floor(Date.now() / 1000)
    upsertSession.run('s1', 'project-a', '/a', now, now, null)
    upsertSession.run('s2', 'project-b', '/b', now, now, null)
    upsertSession.run('s3', 'project-c', '/c', now, now, null)

    const sessions = getActiveSessions.all() as any[]
    expect(sessions).toHaveLength(3)
  })

  it('stores metadata as JSON', () => {
    const now = Math.floor(Date.now() / 1000)
    const meta = JSON.stringify({ permission_mode: 'default' })
    upsertSession.run('session-1', 'test', '/tmp', now, now, meta)

    const sessions = getActiveSessions.all() as any[]
    expect(JSON.parse(sessions[0].metadata)).toEqual({ permission_mode: 'default' })
  })

  it('cleans up idle sessions (no heartbeat for 5 minutes)', () => {
    const now = Math.floor(Date.now() / 1000)
    // Session with heartbeat 10 minutes ago
    upsertSession.run('old-session', 'test', '/tmp', now - 600, now - 600, null)
    // Session with recent heartbeat
    upsertSession.run('new-session', 'test', '/tmp', now, now, null)

    cleanupIdle.run(now - 300) // Mark as idle if heartbeat > 5 min ago

    const sessions = getActiveSessions.all() as any[]
    const oldSession = sessions.find((s: any) => s.id === 'old-session')
    const newSession = sessions.find((s: any) => s.id === 'new-session')
    expect(oldSession?.status).toBe('idle')
    expect(newSession?.status).toBe('active')
  })

  it('cleans up stopped sessions (no heartbeat for 30 minutes)', () => {
    const now = Math.floor(Date.now() / 1000)
    upsertSession.run('very-old', 'test', '/tmp', now - 3600, now - 3600, null)
    cleanupStopped.run(now - 1800)

    const sessions = getActiveSessions.all() as any[]
    expect(sessions.find((s: any) => s.id === 'very-old')).toBeUndefined()
  })

  it('deletes old stopped sessions (stopped for 24 hours)', () => {
    const now = Math.floor(Date.now() / 1000)
    upsertSession.run('ancient', 'test', '/tmp', now - 100000, now - 100000, null)
    stopSession.run('ancient')
    deleteOld.run(now - 86400)

    // Should be deleted entirely
    const all = db.prepare('SELECT * FROM managed_sessions WHERE id = ?').all('ancient')
    expect(all).toHaveLength(0)
  })
})

describe('Session Templates', () => {
  let db: InstanceType<typeof Database>
  let insertTemplate: ReturnType<InstanceType<typeof Database>['prepare']>
  let getAllTemplates: ReturnType<InstanceType<typeof Database>['prepare']>
  let deleteTemplate: ReturnType<InstanceType<typeof Database>['prepare']>

  beforeEach(() => {
    db = createTestDb()
    db.exec('DELETE FROM session_templates')
    insertTemplate = db.prepare('INSERT INTO session_templates (name, command, cwd, icon, category) VALUES (?, ?, ?, ?, ?)')
    getAllTemplates = db.prepare('SELECT * FROM session_templates ORDER BY category, name')
    deleteTemplate = db.prepare('DELETE FROM session_templates WHERE id = ?')
  })

  it('creates a template', () => {
    const result = insertTemplate.run('My Agent', 'claude --verbose', '~/projects', '🤖', 'general')
    expect(Number(result.lastInsertRowid)).toBeGreaterThan(0)

    const templates = getAllTemplates.all() as any[]
    expect(templates).toHaveLength(1)
    expect(templates[0].name).toBe('My Agent')
    expect(templates[0].command).toBe('claude --verbose')
    expect(templates[0].cwd).toBe('~/projects')
  })

  it('creates multiple templates', () => {
    insertTemplate.run('Agent 1', 'claude', '~', '🤖', 'general')
    insertTemplate.run('Agent 2', 'claude --plan', '~', '📋', 'planning')

    const templates = getAllTemplates.all() as any[]
    expect(templates).toHaveLength(2)
  })

  it('deletes a template', () => {
    const result = insertTemplate.run('Temp', 'bash', '~', '💻', 'general')
    const id = Number(result.lastInsertRowid)

    const changes = deleteTemplate.run(id)
    expect(changes.changes).toBe(1)

    const templates = getAllTemplates.all() as any[]
    expect(templates).toHaveLength(0)
  })

  it('returns 0 changes when deleting non-existent template', () => {
    const changes = deleteTemplate.run(99999)
    expect(changes.changes).toBe(0)
  })

  it('orders templates by category then name', () => {
    insertTemplate.run('Zebra', 'cmd', '~', '🤖', 'beta')
    insertTemplate.run('Apple', 'cmd', '~', '🤖', 'beta')
    insertTemplate.run('Mango', 'cmd', '~', '🤖', 'alpha')

    const templates = getAllTemplates.all() as any[]
    expect(templates[0].name).toBe('Mango')  // alpha category first
    expect(templates[1].name).toBe('Apple')  // beta, alphabetical
    expect(templates[2].name).toBe('Zebra')
  })

  it('uses default values for icon and category', () => {
    db.prepare('INSERT INTO session_templates (name, command) VALUES (?, ?)').run('Simple', 'bash')

    const templates = getAllTemplates.all() as any[]
    expect(templates[0].cwd).toBe('~')
    expect(templates[0].icon).toBe('🤖')
    expect(templates[0].category).toBe('general')
  })
})

// Cleanup
import { afterAll } from 'vitest'
afterAll(() => {
  try { fs.unlinkSync(TEST_DB_PATH) } catch {}
  try { fs.unlinkSync(TEST_DB_PATH + '-wal') } catch {}
  try { fs.unlinkSync(TEST_DB_PATH + '-shm') } catch {}
})
