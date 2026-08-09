import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Request } from 'express'

/**
 * The relay sent `Authorization: Basic base64(COCKPIT_AUTH)` on its WS upgrade, but
 * localAuthWsAuth accepts only `Bearer <RELAY_SECRET>`, a session cookie, or SKIP_AUTH. A Basic
 * header matched none, so the relay 401'd against any deployed cockpit (SKIP_AUTH is refused
 * under NODE_ENV=production) - the feature was dead outside local dev and nothing failed loudly,
 * because a rejected upgrade surfaces as a bare close event.
 *
 * These pin the scheme from the server side, which is the half that decides. RELAY_SECRET is read
 * into a module-level const at import time, so each case needs a fresh module registry.
 */
describe('relay WS auth', () => {
  const env = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    delete process.env.SKIP_AUTH
    delete process.env.RELAY_SECRET
  })

  afterEach(() => {
    process.env = { ...env }
  })

  function req(authorization?: string): Request {
    return { headers: authorization ? { authorization } : {} } as unknown as Request
  }

  async function wsAuth() {
    const mod = await import('../middleware/local-auth.js')
    return mod.localAuthWsAuth
  }

  it('accepts the Bearer scheme the relay now sends', async () => {
    process.env.RELAY_SECRET = 's3cret'
    const auth = await wsAuth()
    expect(auth(req('Bearer s3cret'))).toEqual({ email: 'relay@local' })
  })

  it('rejects the Basic scheme the relay used to send', async () => {
    // The exact shape of the old header, so a revert cannot pass this.
    process.env.RELAY_SECRET = 's3cret'
    const basic = `Basic ${Buffer.from('s3cret').toString('base64')}`
    const auth = await wsAuth()
    expect(auth(req(basic))).toBeNull()
  })

  it('rejects a wrong Bearer secret', async () => {
    process.env.RELAY_SECRET = 's3cret'
    const auth = await wsAuth()
    expect(auth(req('Bearer wrong'))).toBeNull()
  })

  it('rejects any Bearer token when the server has no RELAY_SECRET configured', async () => {
    // Guards the empty-string trap: an unset secret on both sides must not make
    // `Bearer ` match, which would authenticate every caller.
    const auth = await wsAuth()
    expect(auth(req('Bearer '))).toBeNull()
    expect(auth(req('Bearer anything'))).toBeNull()
  })

  it('rejects a missing Authorization header', async () => {
    process.env.RELAY_SECRET = 's3cret'
    const auth = await wsAuth()
    expect(auth(req())).toBeNull()
  })

  it('allows anything under SKIP_AUTH, which is why this only ever worked locally', async () => {
    process.env.SKIP_AUTH = 'true'
    const auth = await wsAuth()
    expect(auth(req(`Basic ${Buffer.from('anything').toString('base64')}`))).toEqual({
      email: 'dev@local',
    })
  })
})
