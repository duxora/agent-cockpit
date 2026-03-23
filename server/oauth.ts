import { OAuth2Client } from 'google-auth-library'
import { v4 as uuidv4 } from 'uuid'

// Validate environment variables
export function validateEnv(): {
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REDIRECT_URI: string
} {
  const requiredVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'] as const

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`)
    }
  }

  return {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI!
  }
}

// Initialize OAuth client (will validate env vars on first use)
let googleClient: OAuth2Client | null = null

function getGoogleClient(): OAuth2Client {
  if (!googleClient) {
    const env = validateEnv()
    googleClient = new OAuth2Client(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI
    )
  }
  return googleClient
}

// Google token payload interface
export interface GoogleTokenPayload {
  email: string
  email_verified: boolean
  name?: string
  picture?: string
  aud?: string
  exp?: number
  iat?: number
  iss?: string
  sub?: string
}

/**
 * Exchange authorization code for Google ID token
 */
export async function exchangeCodeForToken(code: string): Promise<string> {
  const client = getGoogleClient()
  const { tokens } = await client.getToken(code)

  if (!tokens.id_token) {
    throw new Error('No ID token received from Google')
  }

  return tokens.id_token
}

/**
 * Verify Google ID token and extract payload
 */
export async function verifyGoogleToken(idToken: string): Promise<GoogleTokenPayload> {
  const client = getGoogleClient()
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID
  })

  const payload = ticket.getPayload()
  if (!payload) {
    throw new Error('Failed to extract payload from ID token')
  }

  // Ensure email is present and verified
  if (!payload.email || !payload.email_verified) {
    throw new Error('Token email not verified or missing')
  }

  return {
    email: payload.email,
    email_verified: payload.email_verified,
    name: payload.name,
    picture: payload.picture,
    aud: payload.aud,
    exp: payload.exp,
    iat: payload.iat,
    iss: payload.iss,
    sub: payload.sub
  }
}

/**
 * Generate a session token (UUID v4)
 */
export function generateSessionToken(): string {
  return uuidv4()
}

/**
 * Generate CSRF state for OAuth flow (UUID v4)
 */
export function generateOAuthState(): string {
  return uuidv4()
}

/**
 * Construct Google OAuth authorization URL
 */
export function getGoogleAuthUrl(state: string): string {
  const env = validateEnv()
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}
