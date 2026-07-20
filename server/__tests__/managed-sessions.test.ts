import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import Database from 'better-sqlite3'

const testDbPath = path.join(__dirname, '../../managed-sessions.test.db')

// db.ts opens its database at import time, so the path override has to be set
// before the dynamic import below.
process.env.COCKPIT_DB_PATH = testDbPath

let db: typeof import('../db.js')

function cleanup() {
  for (const suffix of ['', '-wal', '-shm']) {
    const p = testDbPath + suffix
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
}

beforeAll(async () => {
  cleanup()
  db = await import('../db.js')
})

afterAll(() => cleanup())

// Backdate started_at so a reset is detectable regardless of clock resolution.
function backdate(id: string, startedAt: number) {
  const raw = new Database(testDbPath)
  raw.prepare('UPDATE managed_sessions SET started_at = ? WHERE id = ?').run(startedAt, id)
  raw.close()
}

describe('registerManagedSession', () => {
  it('preserves started_at when a session is re-registered from a continuation source', () => {
    const id = 'sess-resume'
    db.registerManagedSession(id, 'alpha', '/tmp/a', undefined, 'startup')
    const original = Math.floor(Date.now() / 1000) - 3600
    backdate(id, original)

    db.registerManagedSession(id, 'alpha', '/tmp/a', undefined, 'resume')

    expect(db.getManagedSessionById(id)?.started_at).toBe(original)
  })

  it.each(['resume', 'fork', 'clear', 'compact'] as const)(
    'preserves started_at for source=%s',
    (source) => {
      const id = `sess-${source}`
      db.registerManagedSession(id, 'beta', '/tmp/b', undefined, 'startup')
      const original = Math.floor(Date.now() / 1000) - 1234
      backdate(id, original)

      db.registerManagedSession(id, 'beta', '/tmp/b', undefined, source)

      expect(db.getManagedSessionById(id)?.started_at).toBe(original)
    }
  )

  it('still updates name, cwd, heartbeat and metadata on continuation', () => {
    const id = 'sess-update'
    db.registerManagedSession(id, 'old-name', '/tmp/old', '{"a":1}', 'startup')
    backdate(id, Math.floor(Date.now() / 1000) - 60)

    db.registerManagedSession(id, 'new-name', '/tmp/new', '{"a":2}', 'fork')

    const row = db.getManagedSessionById(id)!
    expect(row.name).toBe('new-name')
    expect(row.cwd).toBe('/tmp/new')
    expect(row.metadata).toBe('{"a":2}')
    expect(row.status).toBe('active')
  })

  it('resets started_at for a cold start reusing the same id', () => {
    const id = 'sess-startup'
    db.registerManagedSession(id, 'gamma', '/tmp/c', undefined, 'startup')
    const stale = Math.floor(Date.now() / 1000) - 9999
    backdate(id, stale)

    db.registerManagedSession(id, 'gamma', '/tmp/c', undefined, 'startup')

    expect(db.getManagedSessionById(id)?.started_at).toBeGreaterThan(stale)
  })

  it('defaults to cold-start behaviour when no source is given', () => {
    const id = 'sess-default'
    db.registerManagedSession(id, 'delta', '/tmp/d')
    const stale = Math.floor(Date.now() / 1000) - 9999
    backdate(id, stale)

    db.registerManagedSession(id, 'delta', '/tmp/d')

    expect(db.getManagedSessionById(id)?.started_at).toBeGreaterThan(stale)
  })
})
