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
