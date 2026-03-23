import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  generateSessionToken,
  generateOAuthState,
  getGoogleAuthUrl,
  validateEnv
} from '../oauth'

describe('OAuth Utilities', () => {
  beforeEach(() => {
    // Set up required env vars for tests
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/callback'
  })

  describe('generateSessionToken', () => {
    it('generates a valid UUID v4 token', () => {
      const token = generateSessionToken()
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(20)
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    it('generates unique tokens', () => {
      const token1 = generateSessionToken()
      const token2 = generateSessionToken()
      expect(token1).not.toBe(token2)
    })
  })

  describe('generateOAuthState', () => {
    it('generates a valid UUID v4 state', () => {
      const state = generateOAuthState()
      expect(state).toBeDefined()
      expect(typeof state).toBe('string')
      expect(state.length).toBeGreaterThan(20)
      // UUID v4 format check
      expect(state).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    it('generates unique states', () => {
      const state1 = generateOAuthState()
      const state2 = generateOAuthState()
      expect(state1).not.toBe(state2)
    })
  })

  describe('getGoogleAuthUrl', () => {
    it('constructs valid Google OAuth URL', () => {
      const state = 'test-state-123'
      const url = getGoogleAuthUrl(state)

      expect(url).toBeDefined()
      expect(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth')).toBe(true)
      expect(url).toContain('client_id=test-client-id')
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback')
      expect(url).toContain('response_type=code')
      expect(url).toContain('scope=openid+email+profile')
      expect(url).toContain(`state=${state}`)
    })

    it('URL encodes the redirect URI properly', () => {
      const state = 'test-state'
      const url = getGoogleAuthUrl(state)
      // Redirect URI should be percent-encoded
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback')
    })

    it('includes all required OAuth parameters', () => {
      const state = 'test-state'
      const url = getGoogleAuthUrl(state)

      const requiredParams = [
        'client_id',
        'redirect_uri',
        'response_type=code',
        'scope',
        'state'
      ]

      requiredParams.forEach(param => {
        expect(url).toContain(param)
      })
    })
  })

  describe('validateEnv', () => {
    it('validates required environment variables', () => {
      process.env.GOOGLE_CLIENT_ID = 'test-id'
      process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
      process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/callback'

      expect(() => validateEnv()).not.toThrow()
    })

    it('throws error if GOOGLE_CLIENT_ID is missing', () => {
      delete process.env.GOOGLE_CLIENT_ID
      process.env.GOOGLE_CLIENT_SECRET = 'secret'
      process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/callback'

      expect(() => validateEnv()).toThrow('GOOGLE_CLIENT_ID')
    })

    it('throws error if GOOGLE_CLIENT_SECRET is missing', () => {
      process.env.GOOGLE_CLIENT_ID = 'id'
      delete process.env.GOOGLE_CLIENT_SECRET
      process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/callback'

      expect(() => validateEnv()).toThrow('GOOGLE_CLIENT_SECRET')
    })

    it('throws error if GOOGLE_REDIRECT_URI is missing', () => {
      process.env.GOOGLE_CLIENT_ID = 'id'
      process.env.GOOGLE_CLIENT_SECRET = 'secret'
      delete process.env.GOOGLE_REDIRECT_URI

      expect(() => validateEnv()).toThrow('GOOGLE_REDIRECT_URI')
    })

    it('returns object with all credentials', () => {
      process.env.GOOGLE_CLIENT_ID = 'test-id'
      process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
      process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/callback'

      const result = validateEnv()
      expect(result).toEqual({
        GOOGLE_CLIENT_ID: 'test-id',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        GOOGLE_REDIRECT_URI: 'http://localhost:3000/callback'
      })
    })
  })
})
