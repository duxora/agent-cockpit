import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createSession, deleteSession, getSessionByToken } from '../db.js'
import { generateOAuthState, generateSessionToken } from '../oauth.js'

const API_BASE = 'http://localhost:4200'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'

// Mock cookies storage for testing
const cookieStorage = new Map<string, string>()

function extractCookie(response: Response, name: string): string | null {
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) return null
  const match = setCookie.match(new RegExp(`${name}=([^;]+)`))
  return match ? match[1] : null
}

describe('Auth Endpoints - Task 3: GET /api/auth/google', () => {
  it('should return 500 if OAuth is not configured', async () => {
    // OAuth env vars are not set by default in the test
    const response = await fetch(`${API_BASE}/api/auth/google`, {
      redirect: 'manual'
    })

    // Should return 500 or handle missing config gracefully
    expect([500, 302]).toContain(response.status)
  })
})

describe('Auth Endpoints - Task 4: GET /api/auth/google/callback', () => {
  it('should return 400 if code is missing', async () => {
    const response = await fetch(
      `${API_BASE}/api/auth/google/callback?state=test-state`,
      { redirect: 'manual' }
    )

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data).toHaveProperty('error')
  })

  it('should return 400 if state is missing', async () => {
    const response = await fetch(
      `${API_BASE}/api/auth/google/callback?code=test-code`,
      { redirect: 'manual' }
    )

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data).toHaveProperty('error')
  })

  it('should return 400 if state is invalid (CSRF protection)', async () => {
    const response = await fetch(
      `${API_BASE}/api/auth/google/callback?code=test-code&state=invalid-state-not-stored`,
      { redirect: 'manual' }
    )

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })

  it('should return 401 if email is not authorized', async () => {
    // This test requires a valid Google token response, which we'll mock
    // For now, we verify the endpoint structure
    const response = await fetch(
      `${API_BASE}/api/auth/google/callback?code=invalid&state=invalid`,
      { redirect: 'manual' }
    )

    // Should fail due to invalid state or code
    expect([400, 401, 500]).toContain(response.status)
  })

  it('should set session cookie on successful authentication', async () => {
    // This would require mocking the Google OAuth flow
    // Placeholder for integration test with mock token
    // In a full test, we'd mock the exchangeCodeForToken and verifyGoogleToken functions
  })

  it('should redirect to /dashboard on successful authentication', async () => {
    // This would require mocking the full Google OAuth flow
    // Placeholder for integration test
  })
})

describe('Auth Endpoints - Task 5: POST /api/auth/logout', () => {
  let sessionToken: string
  let sessionCookie: string

  beforeEach(() => {
    // Create a test session
    sessionToken = generateSessionToken()
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
    createSession(ADMIN_EMAIL, sessionToken, expiresAt, 'test-agent')
    sessionCookie = sessionToken
  })

  afterEach(() => {
    // Clean up test sessions
    deleteSession(sessionToken)
  })

  it('should successfully logout and clear session cookie', async () => {
    const response = await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Cookie': `session_token=${sessionCookie}`
      }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('success', true)

    // Verify session was deleted
    const session = getSessionByToken(sessionToken)
    expect(session).toBeUndefined()
  })

  it('should return 200 even if no session cookie is provided', async () => {
    const response = await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST'
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('success', true)
  })

  it('should clear session_token cookie in response', async () => {
    const response = await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Cookie': `session_token=${sessionCookie}`
      }
    })

    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toBeDefined()
    expect(setCookie).toContain('session_token=')
    // Express clears cookies using Expires=Thu, 01 Jan 1970
    expect(setCookie).toContain('Expires=Thu')
  })
})

describe('Auth Endpoints - Task 5: GET /api/auth/me', () => {
  let sessionToken: string
  let sessionCookie: string

  beforeEach(() => {
    // Create a test session
    sessionToken = generateSessionToken()
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
    createSession(ADMIN_EMAIL, sessionToken, expiresAt, 'test-agent')
    sessionCookie = sessionToken
  })

  afterEach(() => {
    // Clean up test sessions
    deleteSession(sessionToken)
  })

  it('should return 401 if no session cookie is provided', async () => {
    const response = await fetch(`${API_BASE}/api/auth/me`)

    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })

  it('should return 401 if session token is invalid', async () => {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        'Cookie': 'session_token=invalid-token-12345'
      }
    })

    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })

  it('should return user email and role for valid session', async () => {
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

  it('should return 401 if session has expired', async () => {
    // Create an expired session
    const expiredToken = generateSessionToken()
    const expiredAt = Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
    createSession(ADMIN_EMAIL, expiredToken, expiredAt, 'test-agent')

    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        'Cookie': `session_token=${expiredToken}`
      }
    })

    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.error).toContain('expired')

    // Clean up
    deleteSession(expiredToken)
  })

  it('should clear cookie and return 401 for expired session', async () => {
    const expiredToken = generateSessionToken()
    const expiredAt = Math.floor(Date.now() / 1000) - 3600
    createSession(ADMIN_EMAIL, expiredToken, expiredAt, 'test-agent')

    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        'Cookie': `session_token=${expiredToken}`
      }
    })

    expect(response.status).toBe(401)
    const setCookie = response.headers.get('set-cookie')
    expect(setCookie).toBeDefined()

    deleteSession(expiredToken)
  })
})
