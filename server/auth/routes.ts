import { Router } from 'express'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import QRCode from 'qrcode'
import {
  getAdmin, getAdminByUsername, createAdminUser, enableTotp,
  createAuthSession, deleteSessionByToken, getSessionByToken,
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
    } catch {
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
    createAuthSession(token, newAdmin.id, expiresAt, req.headers['user-agent'])
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
      // No 2FA — issue session directly
      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
      createAuthSession(token, admin.id, expiresAt, req.headers['user-agent'])
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
    createAuthSession(token, admin.id, expiresAt, req.headers['user-agent'])
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
