import fs from 'fs'
import path from 'path'

let RAILWAY_TOKEN: string = ''

function initRailway() {
  // Try env var first
  if (process.env.RAILWAY_TOKEN) {
    RAILWAY_TOKEN = process.env.RAILWAY_TOKEN
    return
  }
  // Fall back to local config
  try {
    const configPath = path.join(process.env.HOME || '', '.railway', 'config.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    RAILWAY_TOKEN = config.user?.token
    if (!RAILWAY_TOKEN) throw new Error('No token found')
    console.log('[railway] Initialized with local credentials')
  } catch (e) {
    console.warn('[railway] Failed to initialize:', (e as Error).message)
    RAILWAY_TOKEN = ''
  }
}

export { initRailway, RAILWAY_TOKEN }

const RAILWAY_API = 'https://api.railway.app/graphql'

interface DeploymentData {
  id: string
  status: string
  createdAt: string
  updatedAt: string
  meta: { commitSha?: string; branch?: string }
}

async function fetchDeployments(projectId: string, serviceId: string, limit = 5): Promise<DeploymentData[]> {
  if (!RAILWAY_TOKEN) return []

  try {
    const query = `
      query {
        deployments(first: ${limit}, where: {serviceId: "${serviceId}"}) {
          edges {
            node {
              id
              status
              createdAt
              updatedAt
              meta
            }
          }
        }
      }
    `
    const res = await fetch(RAILWAY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RAILWAY_TOKEN}`,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    if (data.errors) {
      console.error('[railway] API error:', data.errors[0]?.message)
      return []
    }

    return data.data.deployments.edges.map((e: any) => e.node)
  } catch (e) {
    console.error('[railway] fetchDeployments failed:', (e as Error).message)
    return []
  }
}

export { fetchDeployments }

interface MetricsData {
  cpuPercent?: number
  memoryMb?: number
  uptimeSeconds?: number
}

async function fetchMetrics(serviceId: string): Promise<MetricsData> {
  if (!RAILWAY_TOKEN) return {}

  try {
    const query = `
      query {
        serviceMetrics(serviceId: "${serviceId}") {
          cpuPercent
          memoryMb
          uptimeSeconds
        }
      }
    `
    const res = await fetch(RAILWAY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RAILWAY_TOKEN}`,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) return {}
    const data = await res.json()
    return data.data?.serviceMetrics ?? {}
  } catch (e) {
    console.error('[railway] fetchMetrics failed:', (e as Error).message)
    return {}
  }
}

export { fetchMetrics }

interface EnvironmentVariable {
  name: string
  value: string
  isSecret: boolean
}

async function fetchEnvironmentVariables(serviceId: string): Promise<EnvironmentVariable[]> {
  if (!RAILWAY_TOKEN) return []

  try {
    const query = `
      query {
        service(id: "${serviceId}") {
          variables {
            name
            value
            isSecret
          }
        }
      }
    `
    const res = await fetch(RAILWAY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RAILWAY_TOKEN}`,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) return []
    const data = await res.json()
    return data.data?.service?.variables ?? []
  } catch (e) {
    console.error('[railway] fetchEnvironmentVariables failed:', (e as Error).message)
    return []
  }
}

export { fetchEnvironmentVariables }
