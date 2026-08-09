import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

describe('Railway API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.RAILWAY_TOKEN
  })

  it('should initialize from env var', () => {
    process.env.RAILWAY_TOKEN = 'test_token'
    expect(process.env.RAILWAY_TOKEN).toBe('test_token')
  })

  it('should handle missing credentials gracefully', async () => {
    // Asserted toBeDefined() on a binding the module never initializes at import time, so it
    // failed on any clean checkout regardless of environment. The real contract is narrower:
    // importing without credentials must not throw, and must not surface a usable token before
    // initRailway() has run.
    process.env.RAILWAY_TOKEN = ''
    const result = await import('../../server/railway.js')
    expect(result).toBeDefined()
    expect(result.initRailway).toBeInstanceOf(Function)
    expect(result.RAILWAY_TOKEN).toBeFalsy()
  })

  it('should leave the token empty when init finds no env var and no config file', async () => {
    // HOME is redirected at a directory with no .railway/config.json. Without that, the fallback
    // reads the DEVELOPER's real Railway credentials: the assertion below would flip based on who
    // ran the suite, and the token-missing tests further down would start hitting the live API.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'railway-no-config-'))
    const realHome = process.env.HOME
    process.env.HOME = home
    process.env.RAILWAY_TOKEN = ''
    try {
      const mod = await import('../../server/railway.js')
      expect(() => mod.initRailway()).not.toThrow()
      expect(mod.RAILWAY_TOKEN).toBe('')
    } finally {
      process.env.HOME = realHome
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it('should export required functions', async () => {
    const result = await import('../../server/railway.js')
    expect(result.initRailway).toBeDefined()
    expect(result.fetchDeployments).toBeDefined()
    expect(result.fetchMetrics).toBeDefined()
    expect(result.fetchEnvironmentVariables).toBeDefined()
  })

  it('should return empty array when token is missing for deployments', async () => {
    process.env.RAILWAY_TOKEN = ''
    const { fetchDeployments } = await import('../../server/railway.js')
    const result = await fetchDeployments('test-project', 'test-service')
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)
  })

  it('should return empty object when token is missing for metrics', async () => {
    process.env.RAILWAY_TOKEN = ''
    const { fetchMetrics } = await import('../../server/railway.js')
    const result = await fetchMetrics('test-service')
    expect(typeof result).toBe('object')
    expect(Object.keys(result).length).toBe(0)
  })

  it('should return empty array when token is missing for variables', async () => {
    process.env.RAILWAY_TOKEN = ''
    const { fetchEnvironmentVariables } = await import('../../server/railway.js')
    const result = await fetchEnvironmentVariables('test-service')
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)
  })
})
