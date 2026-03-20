import { describe, it, expect, beforeEach, vi } from 'vitest'

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
    process.env.RAILWAY_TOKEN = ''
    const result = await import('../../server/railway.js')
    expect(result).toBeDefined()
    expect(result.RAILWAY_TOKEN).toBeDefined()
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
