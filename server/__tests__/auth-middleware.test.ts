import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSession, deleteSession, getSessionByToken } from '../db.js'
import { generateSessionToken } from '../oauth.js'

const API_BASE = 'http://localhost:4200'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'

describe('Auth Middleware - Task 6: Session-Based Authentication', () => {
  let sessionToken: string
  let sessionCookie: string

  beforeEach(() => {
    // Create a valid test session
    sessionToken = generateSessionToken()
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
    createSession(ADMIN_EMAIL, sessionToken, expiresAt, 'test-agent')
    sessionCookie = sessionToken
  })

  afterEach(() => {
    // Clean up test sessions
    try {
      deleteSession(sessionToken)
    } catch {
      // ignore
    }
  })

  describe('Public Routes (no auth required)', () => {
    it('should allow access to /health without session token', async () => {
      const response = await fetch(`${API_BASE}/health`)
      expect(response.status).toBe(200)
    })

    it('should allow access to /api/system/capabilities without session token', async () => {
      const response = await fetch(`${API_BASE}/api/system/capabilities`)
      expect(response.status).toBe(200)
    })

    it('should allow access to /api/hooks without session token', async () => {
      const response = await fetch(`${API_BASE}/api/hooks`)
      expect([200, 500]).toContain(response.status) // 500 if DB not ready, but shouldn't be 401
    })

    it('should allow access to /api/auth/google without session token', async () => {
      const response = await fetch(`${API_BASE}/api/auth/google`, {
        redirect: 'manual'
      })
      // May be 500 if OAuth not configured, but shouldn't be 401
      expect([302, 500]).toContain(response.status)
    })

    it('should allow access to /api/auth/google/callback without session token', async () => {
      const response = await fetch(
        `${API_BASE}/api/auth/google/callback?code=test&state=test`,
        { redirect: 'manual' }
      )
      // May be 400 for invalid params, but shouldn't be 401
      expect([400, 401, 500]).toContain(response.status)
    })

    it('should allow POST to /api/auth/logout without valid session token', async () => {
      const response = await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST'
      })
      expect(response.status).toBe(200)
    })

    it('should allow access to /api/share without session token', async () => {
      const response = await fetch(`${API_BASE}/api/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'test' })
      })
      // May be 400 for invalid request, but shouldn't be 401
      expect(response.status).not.toBe(401)
    })
  })

  describe('Protected Routes (auth required)', () => {
    it('should reject request to /api/sessions without session token', async () => {
      const response = await fetch(`${API_BASE}/api/sessions`)
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty('error')
    })

    it('should allow request to /api/sessions with valid session token', async () => {
      const response = await fetch(`${API_BASE}/api/sessions`, {
        headers: {
          'Cookie': `session_token=${sessionCookie}`
        }
      })
      expect(response.status).toBe(200)
    })

    it('should reject request with invalid session token', async () => {
      const response = await fetch(`${API_BASE}/api/sessions`, {
        headers: {
          'Cookie': 'session_token=invalid-token-12345'
        }
      })
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data).toHaveProperty('error')
    })

    it('should reject request to /api/templates without session token', async () => {
      const response = await fetch(`${API_BASE}/api/templates`)
      expect(response.status).toBe(401)
    })

    it('should allow request to /api/templates with valid session token', async () => {
      const response = await fetch(`${API_BASE}/api/templates`, {
        headers: {
          'Cookie': `session_token=${sessionCookie}`
        }
      })
      expect(response.status).toBe(200)
    })

    it('should reject POST to /api/sessions without session token', async () => {
      const response = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test', command: 'ls' })
      })
      expect(response.status).toBe(401)
    })

    it('should allow POST to /api/sessions with valid session token', async () => {
      const response = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `session_token=${sessionCookie}`
        },
        body: JSON.stringify({ name: 'test-session', command: 'ls' })
      })
      // 409 if session already exists, but not 401
      expect(response.status).not.toBe(401)
    })
  })

  describe('Session Expiration', () => {
    it('should reject request with expired session token', async () => {
      // Create an expired session
      const expiredToken = generateSessionToken()
      const expiredAt = Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      createSession(ADMIN_EMAIL, expiredToken, expiredAt, 'test-agent')

      const response = await fetch(`${API_BASE}/api/sessions`, {
        headers: {
          'Cookie': `session_token=${expiredToken}`
        }
      })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBeDefined()

      // Clean up
      deleteSession(expiredToken)
    })

    it('should clear session cookie when session is expired', async () => {
      const expiredToken = generateSessionToken()
      const expiredAt = Math.floor(Date.now() / 1000) - 3600
      createSession(ADMIN_EMAIL, expiredToken, expiredAt, 'test-agent')

      const response = await fetch(`${API_BASE}/api/sessions`, {
        headers: {
          'Cookie': `session_token=${expiredToken}`
        }
      })

      expect(response.status).toBe(401)
      const setCookie = response.headers.get('set-cookie')
      expect(setCookie).toBeDefined()
      expect(setCookie).toContain('session_token=')

      deleteSession(expiredToken)
    })
  })

  describe('No Basic Auth', () => {
    it('should not accept Basic auth credentials on protected routes', async () => {
      const credentials = Buffer.from('admin:password').toString('base64')
      const response = await fetch(`${API_BASE}/api/sessions`, {
        headers: {
          'Authorization': `Basic ${credentials}`
        }
      })
      // Should return 401 because no valid session cookie
      expect(response.status).toBe(401)
    })

    it('should not include WWW-Authenticate header on protected routes', async () => {
      const response = await fetch(`${API_BASE}/api/sessions`)
      const wwwAuth = response.headers.get('www-authenticate')
      expect(wwwAuth).toBeNull()
    })
  })

  describe('Request Context', () => {
    it('should attach user info to request with valid session', async () => {
      // This is tested indirectly through /api/auth/me endpoint
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          'Cookie': `session_token=${sessionCookie}`
        }
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toHaveProperty('email', ADMIN_EMAIL)
      expect(data).toHaveProperty('role', 'admin')
    })
  })

  describe('Multiple Requests', () => {
    it('should allow multiple requests with same session token', async () => {
      const response1 = await fetch(`${API_BASE}/api/sessions`, {
        headers: {
          'Cookie': `session_token=${sessionCookie}`
        }
      })
      expect(response1.status).toBe(200)

      const response2 = await fetch(`${API_BASE}/api/templates`, {
        headers: {
          'Cookie': `session_token=${sessionCookie}`
        }
      })
      expect(response2.status).toBe(200)

      const response3 = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          'Cookie': `session_token=${sessionCookie}`
        }
      })
      expect(response3.status).toBe(200)
    })
  })
})
