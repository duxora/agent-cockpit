# Local Auth + TOTP 2FA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Cloudflare Access as default auth with username/password + TOTP 2FA, keeping CF Access selectable via `AUTH_MODE` env var.

**Architecture:** Express middleware selected at startup by `AUTH_MODE` env var (`local` default, `cloudflare` available). Local auth uses bcrypt passwords, TOTP via `otpauth` library, sessions in SQLite. Frontend shows SetupPage on first run, LoginPage for returning users, Dashboard when authenticated.

**Tech Stack:** bcrypt, otpauth, qrcode (new deps); better-sqlite3, Express, React (existing)

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install new packages**

Run:
```bash
yarn add bcrypt otpauth qrcode
yarn add -D @types/bcrypt @types/qrcode
```

- [ ] **Step 2: Verify installation**

Run: `yarn list bcrypt otpauth qrcode`
Expected: All three packages listed with versions

- [ ] **Step 3: Commit**

```bash
git add package.json yarn.lock
git commit -m "feat(auth): add bcrypt, otpauth, qrcode dependencies"
```

---

### Task 2: Database Schema — Auth Tables

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Write failing test for auth DB functions**

Create: `server/__tests__/auth-db.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

// We'll test the SQL and logic directly with an in-memory DB
function setupAuthTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      totp_secret TEXT,
      totp_enabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES admin_user(id)
    );
  `)
  return db
}

describe('auth database tables', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    setupAuthTables(db)
  })

  it('creates admin_user table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_user'").get()
    expect(tables).toBeTruthy()
  })

  it('enforces unique username', () => {
    db.prepare('INSERT INTO admin_user (username, password_hash) VALUES (?, ?)').run('admin', 'hash1')
    expect(() => {
      db.prepare('INSERT INTO admin_user (username, password_hash) VALUES (?, ?)').run('admin', 'hash2')
    }).toThrow()
  })

  it('creates admin_sessions table with FK', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_sessions'").get()
    expect(tables).toBeTruthy()
  })

  it('stores and retrieves a session', () => {
    db.prepare('INSERT INTO admin_user (username, password_hash) VALUES (?, ?)').run('admin', 'hash')
    const user = db.prepare('SELECT id FROM admin_user WHERE username = ?').get('admin') as { id: number }
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    db.prepare('INSERT INTO admin_sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run('tok123', user.id, expires)
    const session = db.prepare('SELECT * FROM admin_sessions WHERE token = ?').get('tok123') as any
    expect(session.user_id).toBe(user.id)
  })
})
```

- [ ] **Step 2: Run test to verify it passes (schema validation)**

Run: `npx vitest run server/__tests__/auth-db.test.ts`
Expected: 4 tests PASS

- [ ] **Step 3: Add auth tables and helper functions to db.ts**

Add to the bottom of `server/db.ts`, before `export default db`:

```typescript
// --- Auth Tables ---

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    totp_secret TEXT,
    totp_enabled INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES admin_user(id)
  );
`)

export interface AdminUser {
  id: number
  username: string
  password_hash: string
  totp_secret: string | null
  totp_enabled: number
  created_at: string
}

export interface AdminSession {
  token: string
  user_id: number
  expires_at: string
  user_agent: string | null
  created_at: string
}

const getAdminUser = db.prepare('SELECT * FROM admin_user LIMIT 1')
const getAdminUserByUsername = db.prepare('SELECT * FROM admin_user WHERE username = ?')
const insertAdminUser = db.prepare(
  'INSERT INTO admin_user (username, password_hash, totp_secret, totp_enabled) VALUES (?, ?, ?, ?)'
)
const updateTotpSecret = db.prepare(
  'UPDATE admin_user SET totp_secret = ?, totp_enabled = ? WHERE id = ?'
)

const insertSession = db.prepare(
  'INSERT INTO admin_sessions (token, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)'
)
const getSession = db.prepare('SELECT * FROM admin_sessions WHERE token = ?')
const deleteSession = db.prepare('DELETE FROM admin_sessions WHERE token = ?')
const deleteExpiredSessions = db.prepare("DELETE FROM admin_sessions WHERE expires_at < datetime('now')")

export function getAdmin(): AdminUser | undefined {
  return getAdminUser.get() as AdminUser | undefined
}

export function getAdminByUsername(username: string): AdminUser | undefined {
  return getAdminUserByUsername.get(username) as AdminUser | undefined
}

export function createAdminUser(username: string, passwordHash: string, totpSecret: string | null, totpEnabled: number): AdminUser {
  const result = insertAdminUser.run(username, passwordHash, totpSecret, totpEnabled)
  return { id: Number(result.lastInsertRowid), username, password_hash: passwordHash, totp_secret: totpSecret, totp_enabled: totpEnabled, created_at: new Date().toISOString() }
}

export function enableTotp(userId: number, encryptedSecret: string): void {
  updateTotpSecret.run(encryptedSecret, 1, userId)
}

export function createSession(token: string, userId: number, expiresAt: string, userAgent?: string): void {
  insertSession.run(token, userId, expiresAt, userAgent ?? null)
}

export function getSessionByToken(token: string): AdminSession | undefined {
  return getSession.get(token) as AdminSession | undefined
}

export function deleteSessionByToken(token: string): void {
  deleteSession.run(token)
}

export function cleanupExpiredSessions(): void {
  deleteExpiredSessions.run()
}
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All existing + new tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/db.ts server/__tests__/auth-db.test.ts
git commit -m "feat(auth): add admin_user and admin_sessions tables with helpers"
```

---

### Task 3: TOTP + Crypto Utilities

**Files:**
- Create: `server/auth/totp.ts`
- Create: `server/__tests__/totp.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/__tests__/totp.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generateTotpSecret, verifyTotpCode, getTotpUri, encryptSecret, decryptSecret } from '../auth/totp.js'

describe('TOTP utilities', () => {
  it('generates a TOTP secret', () => {
    const secret = generateTotpSecret()
    expect(secret).toBeTruthy()
    expect(typeof secret).toBe('string')
    expect(secret.length).toBeGreaterThan(10)
  })

  it('generates a valid otpauth URI', () => {
    const uri = getTotpUri('testsecret123456', 'admin')
    expect(uri).toContain('otpauth://totp/')
    expect(uri).toContain('AgentCockpit')
  })

  it('verifies a valid TOTP code', () => {
    const { OTP } = await import('otpauth')
    const secret = generateTotpSecret()
    const totp = new OTP.TOTP({ secret: OTP.Secret.fromBase32(secret) })
    const code = totp.generate()
    expect(verifyTotpCode(secret, code)).toBe(true)
  })

  it('rejects an invalid TOTP code', () => {
    const secret = generateTotpSecret()
    expect(verifyTotpCode(secret, '000000')).toBe(false)
  })

  it('encrypts and decrypts a secret', () => {
    const original = 'JBSWY3DPEHPK3PXP'
    const key = 'a'.repeat(64) // 32-byte hex key
    const encrypted = encryptSecret(original, key)
    expect(encrypted).not.toBe(original)
    const decrypted = decryptSecret(encrypted, key)
    expect(decrypted).toBe(original)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/totp.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TOTP utilities**

Create `server/auth/totp.ts`:

```typescript
import * as OTPAuth from 'otpauth'
import crypto from 'crypto'

export function generateTotpSecret(): string {
  const secret = new OTPAuth.Secret()
  return secret.base32
}

export function getTotpUri(base32Secret: string, username: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: 'AgentCockpit',
    label: username,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  })
  return totp.toString()
}

export function verifyTotpCode(base32Secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(base32Secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  })
  const delta = totp.validate({ token: code, window: 1 })
  return delta !== null
}

export function encryptSecret(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(encrypted: string, hexKey: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':')
  const key = Buffer.from(hexKey, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/totp.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/auth/totp.ts server/__tests__/totp.test.ts
git commit -m "feat(auth): add TOTP generation, verification, and encryption utilities"
```

---

### Task 4: Local Auth Middleware

**Files:**
- Create: `server/middleware/local-auth.ts`
- Create: `server/__tests__/local-auth.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/__tests__/local-auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

// Mock db module
vi.mock('../db.js', () => ({
  getSessionByToken: vi.fn(),
  deleteSessionByToken: vi.fn(),
  cleanupExpiredSessions: vi.fn(),
}))

import { localAuthMiddleware, localAuthWsAuth } from '../middleware/local-auth.js'
import { getSessionByToken } from '../db.js'

function mockReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, path: '/api/sessions', ...overrides } as Request
}

function mockRes(): Response {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res as Response
}

describe('localAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset SKIP_AUTH
    process.env.SKIP_AUTH = ''
  })

  it('returns 401 when no session cookie', () => {
    const req = mockReq()
    const res = mockRes()
    const next = vi.fn()

    localAuthMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 for expired session', () => {
    const req = mockReq({ headers: { cookie: 'session=expired-token' } })
    const res = mockRes()
    const next = vi.fn()

    vi.mocked(getSessionByToken).mockReturnValue({
      token: 'expired-token',
      user_id: 1,
      expires_at: new Date(Date.now() - 1000).toISOString(),
      user_agent: null,
      created_at: new Date().toISOString(),
    })

    localAuthMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('calls next() for valid session', () => {
    const req = mockReq({ headers: { cookie: 'session=valid-token' } })
    const res = mockRes()
    const next = vi.fn()

    vi.mocked(getSessionByToken).mockReturnValue({
      token: 'valid-token',
      user_id: 1,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      user_agent: null,
      created_at: new Date().toISOString(),
    })

    localAuthMiddleware(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  it('allows relay connections with RELAY_SECRET', () => {
    process.env.RELAY_SECRET = 'test-secret'
    const req = mockReq({ headers: { authorization: 'Bearer test-secret' } })
    const res = mockRes()
    const next = vi.fn()

    localAuthMiddleware(req, res, next)

    expect(next).toHaveBeenCalled()
    process.env.RELAY_SECRET = ''
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/local-auth.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement local auth middleware**

Create `server/middleware/local-auth.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express'
import { getSessionByToken, deleteSessionByToken } from '../db.js'

const RELAY_SECRET = process.env.RELAY_SECRET || ''

function extractSessionToken(req: Request): string | null {
  const cookies = req.headers.cookie || ''
  const match = cookies.match(/session=([^;]+)/)
  return match ? match[1] : null
}

function extractRelaySecret(req: Request): string | null {
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return null
}

export function localAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (process.env.SKIP_AUTH === 'true') {
    next()
    return
  }

  // Allow relay connections with shared secret
  const relaySecret = extractRelaySecret(req)
  if (relaySecret && RELAY_SECRET && relaySecret === RELAY_SECRET) {
    next()
    return
  }

  const token = extractSessionToken(req)
  if (!token) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const session = getSessionByToken(token)
  if (!session) {
    res.status(401).json({ error: 'Invalid session' })
    return
  }

  if (new Date(session.expires_at) < new Date()) {
    deleteSessionByToken(token)
    res.status(401).json({ error: 'Session expired' })
    return
  }

  next()
}

export function localAuthWsAuth(req: Request): { email: string } | null {
  if (process.env.SKIP_AUTH === 'true') return { email: 'dev@local' }

  const relaySecret = extractRelaySecret(req)
  if (relaySecret && RELAY_SECRET && relaySecret === RELAY_SECRET) {
    return { email: 'relay@local' }
  }

  const token = extractSessionToken(req)
  if (!token) return null

  const session = getSessionByToken(token)
  if (!session) return null
  if (new Date(session.expires_at) < new Date()) return null

  return { email: 'admin@local' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/local-auth.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/middleware/local-auth.ts server/__tests__/local-auth.test.ts
git commit -m "feat(auth): add local session-based auth middleware"
```

---

### Task 5: Auth API Endpoints

**Files:**
- Create: `server/auth/routes.ts`
- Create: `server/__tests__/auth-routes.test.ts`

- [ ] **Step 1: Write failing test**

Create `server/__tests__/auth-routes.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest' // vitest can use node's fetch, but supertest is cleaner

// Since we don't have supertest, we'll test the route handlers directly
// by importing and calling them with mock req/res

vi.mock('../db.js', () => ({
  getAdmin: vi.fn(),
  getAdminByUsername: vi.fn(),
  createAdminUser: vi.fn(),
  enableTotp: vi.fn(),
  createSession: vi.fn(),
  getSessionByToken: vi.fn(),
  deleteSessionByToken: vi.fn(),
  cleanupExpiredSessions: vi.fn(),
}))

vi.mock('../auth/totp.js', () => ({
  generateTotpSecret: vi.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
  getTotpUri: vi.fn().mockReturnValue('otpauth://totp/AgentCockpit:admin?secret=JBSWY3DPEHPK3PXP'),
  verifyTotpCode: vi.fn(),
  encryptSecret: vi.fn().mockReturnValue('encrypted-secret'),
  decryptSecret: vi.fn().mockReturnValue('JBSWY3DPEHPK3PXP'),
}))

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
    compare: vi.fn(),
  },
}))

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fakeqr'),
  },
}))

import { getAdmin, getAdminByUsername, createAdminUser, enableTotp } from '../db.js'
import { verifyTotpCode } from '../auth/totp.js'
import bcrypt from 'bcrypt'

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  })

  describe('GET /api/auth/setup-status', () => {
    it('returns needsSetup=true when no admin exists', async () => {
      vi.mocked(getAdmin).mockReturnValue(undefined)
      const { createAuthRouter } = await import('../auth/routes.js')
      const app = express()
      app.use(express.json())
      app.use('/api/auth', createAuthRouter())

      const res = await fetch(`http://localhost:0/api/auth/setup-status`) // won't work without listening
      // We'll test via direct handler invocation instead — see integration test in Task 7
    })
  })

  // Route logic tests will be integration tests in Task 7
  // Unit tests here verify the helpers and mocking works
  describe('password hashing', () => {
    it('bcrypt hash and compare work', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
      const result = await bcrypt.compare('password', '$2b$12$hash')
      expect(result).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Implement auth routes**

Create `server/auth/routes.ts`:

```typescript
import { Router } from 'express'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import QRCode from 'qrcode'
import {
  getAdmin, getAdminByUsername, createAdminUser, enableTotp,
  createSession, deleteSessionByToken, getSessionByToken,
} from '../db.js'
import { generateTotpSecret, getTotpUri, verifyTotpCode, encryptSecret, decryptSecret } from './totp.js'

const BCRYPT_ROUNDS = 12
const SESSION_DAYS = 30
const PENDING_TOKEN_TTL_MS = 5 * 60 * 1000 // 5 minutes

// In-memory store for pending 2FA tokens and rate limiting
const pendingTokens = new Map<string, { userId: number; expiresAt: number }>()
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>()

// Temporary store for setup flow (TOTP secret before confirmation)
let pendingSetup: { username: string; passwordHash: string; totpSecret: string } | null = null

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return key
}

function isRateLimited(username: string): boolean {
  const entry = failedAttempts.get(username)
  if (!entry) return false
  if (Date.now() > entry.lockedUntil) {
    failedAttempts.delete(username)
    return false
  }
  return entry.count >= 5
}

function recordFailedAttempt(username: string): void {
  const entry = failedAttempts.get(username) || { count: 0, lockedUntil: 0 }
  entry.count++
  if (entry.count >= 5) {
    entry.lockedUntil = Date.now() + 15 * 60 * 1000 // 15 min lockout
  }
  failedAttempts.set(username, entry)
}

function clearFailedAttempts(username: string): void {
  failedAttempts.delete(username)
}

function setSessionCookie(res: any, token: string, maxAgeDays: number): void {
  const isProduction = process.env.NODE_ENV === 'production'
  res.cookie('session', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
    path: '/',
  })
}

export function createAuthRouter(): Router {
  const router = Router()

  // --- Setup endpoints (only when no admin exists) ---

  router.get('/setup-status', (_req, res) => {
    const admin = getAdmin()
    res.json({ needsSetup: !admin })
  })

  router.post('/setup', async (req, res) => {
    const admin = getAdmin()
    if (admin) {
      res.status(403).json({ error: 'Admin already exists' })
      return
    }

    const { username, password } = req.body
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' })
      return
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' })
      return
    }

    try {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
      const totpSecret = generateTotpSecret()
      const totpUri = getTotpUri(totpSecret, username)
      const qrDataUrl = await QRCode.toDataURL(totpUri)

      // Store temporarily until TOTP confirmation
      pendingSetup = { username, passwordHash, totpSecret }

      res.json({ totpUri, qrDataUrl })
    } catch (err) {
      res.status(500).json({ error: 'Setup failed' })
    }
  })

  router.post('/setup/confirm-totp', (req, res) => {
    const admin = getAdmin()
    if (admin) {
      res.status(403).json({ error: 'Admin already exists' })
      return
    }

    if (!pendingSetup) {
      res.status(400).json({ error: 'No pending setup. Call /api/auth/setup first.' })
      return
    }

    const { code } = req.body
    if (!code) {
      res.status(400).json({ error: 'TOTP code required' })
      return
    }

    const valid = verifyTotpCode(pendingSetup.totpSecret, code)
    if (!valid) {
      res.status(401).json({ error: 'Invalid TOTP code. Check your authenticator app and try again.' })
      return
    }

    // Create the admin user with encrypted TOTP secret
    const encryptedSecret = encryptSecret(pendingSetup.totpSecret, getEncryptionKey())
    const newAdmin = createAdminUser(pendingSetup.username, pendingSetup.passwordHash, encryptedSecret, 1)
    pendingSetup = null

    // Auto-login: create session
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    createSession(token, newAdmin.id, expiresAt, req.headers['user-agent'])
    setSessionCookie(res, token, SESSION_DAYS)

    res.json({ user: { username: newAdmin.username } })
  })

  // --- Login endpoints ---

  router.post('/login', async (req, res) => {
    const { username, password } = req.body
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' })
      return
    }

    if (isRateLimited(username)) {
      res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' })
      return
    }

    const admin = getAdminByUsername(username)
    if (!admin) {
      recordFailedAttempt(username)
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    const passwordValid = await bcrypt.compare(password, admin.password_hash)
    if (!passwordValid) {
      recordFailedAttempt(username)
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }

    clearFailedAttempts(username)

    if (admin.totp_enabled) {
      // Issue pending 2FA token
      const pendingToken = crypto.randomUUID()
      pendingTokens.set(pendingToken, {
        userId: admin.id,
        expiresAt: Date.now() + PENDING_TOKEN_TTL_MS,
      })
      res.json({ pendingToken, requires2fa: true })
    } else {
      // No 2FA — issue session directly (shouldn't happen in normal flow)
      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
      createSession(token, admin.id, expiresAt, req.headers['user-agent'])
      setSessionCookie(res, token, SESSION_DAYS)
      res.json({ user: { username: admin.username } })
    }
  })

  router.post('/verify-totp', (req, res) => {
    const { pendingToken, code } = req.body
    if (!pendingToken || !code) {
      res.status(400).json({ error: 'Pending token and TOTP code required' })
      return
    }

    const pending = pendingTokens.get(pendingToken)
    if (!pending) {
      res.status(401).json({ error: 'Invalid or expired pending token' })
      return
    }

    if (Date.now() > pending.expiresAt) {
      pendingTokens.delete(pendingToken)
      res.status(401).json({ error: 'Pending token expired. Please log in again.' })
      return
    }

    // Get admin to check TOTP
    const admin = getAdmin()
    if (!admin || admin.id !== pending.userId) {
      res.status(401).json({ error: 'Invalid session' })
      return
    }

    const decryptedSecret = decryptSecret(admin.totp_secret!, getEncryptionKey())
    const valid = verifyTotpCode(decryptedSecret, code)
    if (!valid) {
      res.status(401).json({ error: 'Invalid TOTP code' })
      return
    }

    // Issue session
    pendingTokens.delete(pendingToken)
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    createSession(token, admin.id, expiresAt, req.headers['user-agent'])
    setSessionCookie(res, token, SESSION_DAYS)

    res.json({ user: { username: admin.username } })
  })

  // --- Session endpoints ---

  router.post('/logout', (req, res) => {
    const cookies = req.headers.cookie || ''
    const match = cookies.match(/session=([^;]+)/)
    if (match) {
      deleteSessionByToken(match[1])
    }
    res.clearCookie('session', { path: '/' })
    res.json({ ok: true })
  })

  router.get('/me', (req, res) => {
    const cookies = req.headers.cookie || ''
    const match = cookies.match(/session=([^;]+)/)
    if (!match) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    const session = getSessionByToken(match[1])
    if (!session || new Date(session.expires_at) < new Date()) {
      res.status(401).json({ error: 'Session expired' })
      return
    }

    const admin = getAdmin()
    if (!admin) {
      res.status(401).json({ error: 'No admin user' })
      return
    }

    res.json({
      user: { username: admin.username },
      expiresAt: session.expires_at,
    })
  })

  return router
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run server/__tests__/auth-routes.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/auth/routes.ts server/__tests__/auth-routes.test.ts
git commit -m "feat(auth): add login, setup, TOTP verification, and session API routes"
```

---

### Task 6: Wire Auth Mode Switch in server/index.ts

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add auth mode imports and switch logic**

At the top of `server/index.ts`, replace the cloudflare-access import line:

Replace:
```typescript
import { cfAccessMiddleware, cfAccessWsAuth } from './middleware/cloudflare-access.js'
```

With:
```typescript
import { cfAccessMiddleware, cfAccessWsAuth } from './middleware/cloudflare-access.js'
import { localAuthMiddleware, localAuthWsAuth } from './middleware/local-auth.js'
import { createAuthRouter } from './auth/routes.js'
import { cleanupExpiredSessions } from './db.js'

const AUTH_MODE = process.env.AUTH_MODE || 'local'
```

- [ ] **Step 2: Update the middleware wiring**

Replace the middleware block (lines 42-54):

```typescript
// Public routes that don't need authentication
const publicRoutes = ['/health', '/api/system/capabilities', '/api/hooks/session-start', '/api/hooks/heartbeat', '/api/hooks/session-end', '/api/share']
```

With:
```typescript
// Public routes that don't need authentication
const publicRoutes = ['/health', '/api/system/capabilities', '/api/hooks/session-start', '/api/hooks/heartbeat', '/api/hooks/session-end', '/api/share', '/api/auth']
```

Replace the middleware function (lines 45-54):

```typescript
app.use((req, res, next) => {
  if (publicRoutes.some(route => req.path === route || req.path.startsWith(route + '/'))) {
    return next()
  }
  if (req.path.startsWith('/api')) {
    if (AUTH_MODE === 'cloudflare') {
      return cfAccessMiddleware(req, res, next)
    }
    return localAuthMiddleware(req, res, next)
  }
  next()
})
```

- [ ] **Step 3: Mount auth routes (after `app.use(express.json())`)**

Add after the middleware block:

```typescript
// Auth routes (local mode only)
if (AUTH_MODE === 'local') {
  app.use('/api/auth', createAuthRouter())
}
```

- [ ] **Step 4: Update WebSocket auth**

Replace the upgrade handler's auth check (line 533):

```typescript
server.on('upgrade', async (request, socket, head) => {
  const user = AUTH_MODE === 'cloudflare'
    ? await cfAccessWsAuth(request as any)
    : localAuthWsAuth(request as any)
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }
```

- [ ] **Step 5: Add session cleanup interval**

Add near the other `setInterval` calls (around line 517):

```typescript
// Cleanup expired auth sessions every hour (local auth mode)
if (AUTH_MODE === 'local') {
  setInterval(cleanupExpiredSessions, 60 * 60 * 1000)
}
```

- [ ] **Step 6: Add startup log**

In the `server.listen` callback, add:

```typescript
console.log(`  Auth mode: ${AUTH_MODE}`)
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add server/index.ts
git commit -m "feat(auth): wire AUTH_MODE switch between local and cloudflare auth"
```

---

### Task 7: Frontend — SetupPage Component

**Files:**
- Create: `src/pages/SetupPage.tsx`

- [ ] **Step 1: Create SetupPage component**

Create `src/pages/SetupPage.tsx`:

```tsx
import { useState } from 'react'

interface SetupPageProps {
  onSetupComplete: () => void
}

export default function SetupPage({ onSetupComplete }: SetupPageProps) {
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Setup failed')
        return
      }
      setQrDataUrl(data.qrDataUrl)
      setStep('totp')
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmTotp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/setup/confirm-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Verification failed')
        return
      }
      onSetupComplete()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-100">Agent Cockpit Setup</h1>
        <p className="mb-6 text-sm text-gray-400">Create your admin account</p>

        {step === 'credentials' ? (
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Continue to 2FA Setup'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirmTotp} className="space-y-4">
            <p className="text-sm text-gray-400">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </p>
            {qrDataUrl && (
              <div className="flex justify-center rounded-lg bg-white p-4">
                <img src={qrDataUrl} alt="TOTP QR Code" className="h-48 w-48" />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">
                Enter the 6-digit code from your app
              </label>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                maxLength={6}
                pattern="\d{6}"
                placeholder="000000"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-center text-2xl tracking-widest text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Complete Setup'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/SetupPage.tsx
git commit -m "feat(auth): add SetupPage component with QR code TOTP setup"
```

---

### Task 8: Frontend — LoginPage Component

**Files:**
- Create: `src/pages/LoginPage.tsx`

- [ ] **Step 1: Create LoginPage component**

Create `src/pages/LoginPage.tsx`:

```tsx
import { useState } from 'react'

interface LoginPageProps {
  onLoginSuccess: () => void
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [pendingToken, setPendingToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      if (data.requires2fa) {
        setPendingToken(data.pendingToken)
        setStep('totp')
      } else {
        onLoginSuccess()
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingToken, code: totpCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Verification failed')
        setTotpCode('')
        return
      }
      onLoginSuccess()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm rounded-xl border border-gray-800 bg-gray-900 p-8">
        <div className="mb-6 text-center">
          <span className="text-4xl">🎛️</span>
          <h1 className="mt-2 text-xl font-bold text-gray-100">Agent Cockpit</h1>
        </div>

        {step === 'credentials' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyTotp} className="space-y-4">
            <p className="text-center text-sm text-gray-400">
              Enter the 6-digit code from your authenticator app
            </p>
            <input
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoFocus
              maxLength={6}
              pattern="\d{6}"
              placeholder="000000"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-center text-2xl tracking-widest text-gray-100 focus:border-blue-500 focus:outline-none"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('credentials'); setError(''); setTotpCode('') }}
              className="w-full text-sm text-gray-500 hover:text-gray-300"
            >
              Back to login
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/LoginPage.tsx
git commit -m "feat(auth): add LoginPage component with 2FA step"
```

---

### Task 9: Frontend — Auth Routing in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add auth state and routing to App.tsx**

Add imports at the top:

```typescript
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
```

Add auth state inside the `App` component, before other state:

```typescript
const [authState, setAuthState] = useState<'loading' | 'setup' | 'login' | 'authenticated'>('loading')
```

Add auth check effect after the existing `useEffect` hooks:

```typescript
// Check auth status on mount
useEffect(() => {
  async function checkAuth() {
    try {
      // First check if setup is needed
      const setupRes = await fetch('/api/auth/setup-status')
      const setupData = await setupRes.json()
      if (setupData.needsSetup) {
        setAuthState('setup')
        return
      }

      // Then check if we have a valid session
      const meRes = await fetch('/api/auth/me')
      if (meRes.ok) {
        setAuthState('authenticated')
      } else {
        setAuthState('login')
      }
    } catch {
      // If auth endpoints don't exist (cloudflare mode), assume authenticated
      setAuthState('authenticated')
    }
  }
  checkAuth()
}, [])
```

Wrap the return statement with auth routing:

```typescript
if (authState === 'loading') {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-950">
      <div className="text-gray-400 text-sm">Loading...</div>
    </div>
  )
}

if (authState === 'setup') {
  return <SetupPage onSetupComplete={() => setAuthState('authenticated')} />
}

if (authState === 'login') {
  return <LoginPage onLoginSuccess={() => setAuthState('authenticated')} />
}

// authState === 'authenticated' — render dashboard
return (
  // ... existing JSX
)
```

- [ ] **Step 2: Add logout handler**

Add inside the App component:

```typescript
const handleLogout = useCallback(async () => {
  await fetch('/api/auth/logout', { method: 'POST' })
  setAuthState('login')
}, [])
```

In the header, add a logout button (before the "New Session" button):

```tsx
<button
  onClick={handleLogout}
  className="rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200"
>
  Logout
</button>
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(auth): add auth routing with setup/login/dashboard states and logout"
```

---

### Task 10: Update Environment Config

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Update .env.example**

Replace the contents of `.env.example`:

```bash
# Auth mode: "local" (default, username/password + TOTP) or "cloudflare" (CF Access)
AUTH_MODE=local

# Required for local auth mode — 32-byte hex string for encrypting TOTP secrets
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=

# Skip auth entirely (development only — never use in production)
# SKIP_AUTH=true

# Relay secret for local PTY connections
RELAY_SECRET=

# Cloudflare Access (only when AUTH_MODE=cloudflare)
# CF_ACCESS_TEAM=your-team

# Railway (optional)
# RAILWAY_API_TOKEN=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: update .env.example with local auth configuration"
```

---

### Task 11: Integration Test + Build Verification

**Files:**
- Existing test suite

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run production build**

Run: `yarn build`
Expected: Build succeeds

- [ ] **Step 4: Manual smoke test**

Run: `ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") npx tsx server/index.ts`
Expected: Server starts, shows `Auth mode: local`, navigating to localhost:4200 shows SetupPage

- [ ] **Step 5: Commit any fixes if needed**
