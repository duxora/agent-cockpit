import type { Request, Response, NextFunction } from 'express'

const SKIP_AUTH = process.env.SKIP_AUTH === 'true'
const CF_ACCESS_TEAM = process.env.CF_ACCESS_TEAM || ''
const RELAY_SECRET = process.env.RELAY_SECRET || ''

interface CfJwtPayload {
  email: string
  sub: string
  aud: string[]
  exp: number
  iat: number
}

let cachedCerts: { keys: Array<{ kid: string; n: string; e: string }> } | null = null
let certsFetchedAt = 0
const CERTS_TTL_MS = 60 * 60 * 1000 // 1 hour

async function getCfPublicKeys(): Promise<typeof cachedCerts> {
  const now = Date.now()
  if (cachedCerts && now - certsFetchedAt < CERTS_TTL_MS) return cachedCerts
  const url = `https://${CF_ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch CF certs: ${res.status}`)
  cachedCerts = await res.json() as typeof cachedCerts
  certsFetchedAt = now
  return cachedCerts
}

function decodeJwtPayload(token: string): CfJwtPayload {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT')
  const payload = Buffer.from(parts[1], 'base64url').toString()
  return JSON.parse(payload) as CfJwtPayload
}

export function extractCfToken(req: Request): string | null {
  // Header takes priority (HTTP requests)
  const header = req.headers['cf-access-jwt-assertion'] as string | undefined
  if (header) return header
  // Cookie fallback (WebSocket upgrades)
  const cookies = req.headers.cookie || ''
  const match = cookies.match(/CF_Authorization=([^;]+)/)
  return match ? match[1] : null
}

export function extractRelaySecret(req: Request): string | null {
  const auth = req.headers.authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return null
}

export async function validateCfToken(token: string): Promise<CfJwtPayload> {
  const payload = decodeJwtPayload(token)
  if (payload.exp * 1000 < Date.now()) throw new Error('Token expired')
  await getCfPublicKeys()
  return payload
}

export function cfAccessMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (SKIP_AUTH) {
    next()
    return
  }

  // Allow relay connections with shared secret
  const relaySecret = extractRelaySecret(req)
  if (relaySecret && RELAY_SECRET && relaySecret === RELAY_SECRET) {
    next()
    return
  }

  const token = extractCfToken(req)
  if (!token) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  validateCfToken(token)
    .then((payload) => {
      ;(req as Request & { cfUser?: { email: string } }).cfUser = { email: payload.email }
      next()
    })
    .catch(() => {
      res.status(401).json({ error: 'Invalid authentication token' })
    })
}

export function cfAccessWsAuth(req: Request): Promise<{ email: string } | null> {
  if (SKIP_AUTH) return Promise.resolve({ email: 'dev@local' })

  // Check relay secret first
  const relaySecret = extractRelaySecret(req)
  if (relaySecret && RELAY_SECRET && relaySecret === RELAY_SECRET) {
    return Promise.resolve({ email: 'relay@local' })
  }

  const token = extractCfToken(req)
  if (!token) return Promise.resolve(null)

  return validateCfToken(token)
    .then((payload) => ({ email: payload.email }))
    .catch(() => null)
}
