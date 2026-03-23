import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'

// Create a test database in temp directory
const TEST_DB_PATH = path.join(os.tmpdir(), `cockpit-oauth-test-${Date.now()}.db`)

function createTestDb() {
  const db = new Database(TEST_DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at INTEGER DEFAULT (unixepoch()),
      last_login INTEGER
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      session_token TEXT UNIQUE NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      last_activity INTEGER DEFAULT (unixepoch()),
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_email ON admin_sessions(user_email);
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
  `)
  return db
}

describe('Admin Sessions', () => {
  let db: InstanceType<typeof Database>
  let createSessionStmt: ReturnType<InstanceType<typeof Database>['prepare']>
  let getSessionByTokenStmt: ReturnType<InstanceType<typeof Database>['prepare']>
  let deleteSessionStmt: ReturnType<InstanceType<typeof Database>['prepare']>
  let cleanupExpiredStmt: ReturnType<InstanceType<typeof Database>['prepare']>

  beforeEach(() => {
    db = createTestDb()
    db.exec('DELETE FROM admin_sessions')
    db.exec('DELETE FROM admin_users')

    createSessionStmt = db.prepare(`
      INSERT INTO admin_sessions (id, user_email, session_token, expires_at, created_at, last_activity, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    getSessionByTokenStmt = db.prepare(`
      SELECT id, user_email as userEmail, session_token as sessionToken, expires_at as expiresAt,
             created_at as createdAt, last_activity as lastActivity, user_agent as userAgent
      FROM admin_sessions
      WHERE session_token = ?
    `)
    deleteSessionStmt = db.prepare('DELETE FROM admin_sessions WHERE session_token = ?')
    cleanupExpiredStmt = db.prepare(`
      DELETE FROM admin_sessions WHERE expires_at < ?
    `)
  })

  it('creates an admin session', () => {
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = now + 86400 // 24 hours
    const result = createSessionStmt.run([
      'sess-1',
      'admin@example.com',
      'token-abc123',
      expiresAt,
      now,
      now,
      'Mozilla/5.0'
    ])
    expect(result.changes).toBe(1)

    const session = getSessionByTokenStmt.get('token-abc123') as any
    expect(session).toBeDefined()
    expect(session.userEmail).toBe('admin@example.com')
    expect(session.sessionToken).toBe('token-abc123')
    expect(session.expiresAt).toBe(expiresAt)
  })

  it('retrieves session by token', () => {
    const now = Math.floor(Date.now() / 1000)
    createSessionStmt.run([
      'sess-1',
      'admin@example.com',
      'token-xyz789',
      now + 86400,
      now,
      now,
      'Chrome'
    ])

    const session = getSessionByTokenStmt.get('token-xyz789') as any
    expect(session.id).toBe('sess-1')
    expect(session.userAgent).toBe('Chrome')
  })

  it('returns undefined for non-existent token', () => {
    const session = getSessionByTokenStmt.get('nonexistent') as any
    expect(session).toBeUndefined()
  })

  it('deletes a session by token', () => {
    const now = Math.floor(Date.now() / 1000)
    createSessionStmt.run([
      'sess-1',
      'admin@example.com',
      'token-del',
      now + 86400,
      now,
      now,
      null
    ])

    const result = deleteSessionStmt.run(['token-del'])
    expect(result.changes).toBe(1)

    const session = getSessionByTokenStmt.get('token-del')
    expect(session).toBeUndefined()
  })

  it('cleans up expired sessions', () => {
    const now = Math.floor(Date.now() / 1000)

    // Expired session
    createSessionStmt.run([
      'sess-1',
      'admin@example.com',
      'token-expired',
      now - 1000, // expired
      now - 2000,
      now - 1000,
      null
    ])

    // Valid session
    createSessionStmt.run([
      'sess-2',
      'admin@example.com',
      'token-valid',
      now + 86400, // valid
      now,
      now,
      null
    ])

    const result = cleanupExpiredStmt.run([now])
    expect(result.changes).toBe(1) // Only expired session deleted

    const validSession = getSessionByTokenStmt.get('token-valid')
    expect(validSession).toBeDefined()

    const expiredSession = getSessionByTokenStmt.get('token-expired')
    expect(expiredSession).toBeUndefined()
  })

  it('enforces unique session tokens', () => {
    const now = Math.floor(Date.now() / 1000)
    createSessionStmt.run([
      'sess-1',
      'admin@example.com',
      'token-unique',
      now + 86400,
      now,
      now,
      null
    ])

    // Try to insert duplicate token
    expect(() => {
      createSessionStmt.run([
        'sess-2',
        'admin@example.com',
        'token-unique', // Duplicate
        now + 86400,
        now,
        now,
        null
      ])
    }).toThrow()
  })

  it('stores user agent for session tracking', () => {
    const now = Math.floor(Date.now() / 1000)
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
    createSessionStmt.run([
      'sess-1',
      'admin@example.com',
      'token-ua',
      now + 86400,
      now,
      now,
      userAgent
    ])

    const session = getSessionByTokenStmt.get('token-ua') as any
    expect(session.userAgent).toBe(userAgent)
  })
})

describe('Admin Users', () => {
  let db: InstanceType<typeof Database>
  let createUserStmt: ReturnType<InstanceType<typeof Database>['prepare']>
  let getUserByEmailStmt: ReturnType<InstanceType<typeof Database>['prepare']>
  let listUsersStmt: ReturnType<InstanceType<typeof Database>['prepare']>

  beforeEach(() => {
    db = createTestDb()
    db.exec('DELETE FROM admin_users')

    createUserStmt = db.prepare(`
      INSERT INTO admin_users (id, email, role, created_at)
      VALUES (?, ?, ?, ?)
    `)
    getUserByEmailStmt = db.prepare(`
      SELECT id, email, role, created_at as createdAt, last_login as lastLogin
      FROM admin_users
      WHERE email = ?
    `)
    listUsersStmt = db.prepare(`
      SELECT id, email, role, created_at as createdAt, last_login as lastLogin
      FROM admin_users
      ORDER BY created_at DESC
    `)
  })

  it('creates an admin user', () => {
    const now = Math.floor(Date.now() / 1000)
    const result = createUserStmt.run(['user-1', 'admin@example.com', 'admin', now])
    expect(result.changes).toBe(1)

    const user = getUserByEmailStmt.get('admin@example.com') as any
    expect(user).toBeDefined()
    expect(user.email).toBe('admin@example.com')
    expect(user.role).toBe('admin')
  })

  it('enforces unique email addresses', () => {
    const now = Math.floor(Date.now() / 1000)
    createUserStmt.run(['user-1', 'admin@example.com', 'admin', now])

    expect(() => {
      createUserStmt.run(['user-2', 'admin@example.com', 'admin', now])
    }).toThrow()
  })

  it('uses admin as default role', () => {
    const now = Math.floor(Date.now() / 1000)
    db.prepare(`
      INSERT INTO admin_users (id, email, created_at)
      VALUES (?, ?, ?)
    `).run(['user-1', 'default@example.com', now])

    const user = getUserByEmailStmt.get('default@example.com') as any
    expect(user.role).toBe('admin')
  })

  it('lists all users ordered by creation date', () => {
    const now = Math.floor(Date.now() / 1000)
    createUserStmt.run(['user-2', 'second@example.com', 'admin', now + 100])
    createUserStmt.run(['user-1', 'first@example.com', 'admin', now])

    const users = (listUsersStmt.all as any)() as any[]
    expect(users).toHaveLength(2)
    expect(users[0].email).toBe('second@example.com') // Most recent first
    expect(users[1].email).toBe('first@example.com')
  })

  it('returns null for non-existent user', () => {
    const user = getUserByEmailStmt.get('nonexistent@example.com')
    expect(user).toBeUndefined()
  })
})

// Cleanup
afterAll(() => {
  try { fs.unlinkSync(TEST_DB_PATH) } catch {}
  try { fs.unlinkSync(TEST_DB_PATH + '-wal') } catch {}
  try { fs.unlinkSync(TEST_DB_PATH + '-shm') } catch {}
})
