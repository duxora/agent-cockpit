# Google OAuth Authentication Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace HTTP Basic auth with Google OAuth + session-based authentication, removing credentials from environment variables.

**Architecture:** Backend adds OAuth endpoints (`/api/auth/google`, `/api/auth/callback`, `/api/auth/logout`, `/api/auth/me`) with session token management. Auth middleware switches from Basic auth to session cookie validation. Frontend adds LoginPage component and protects routes based on authentication status.

**Tech Stack:** Express + better-sqlite3 (backend), React + TypeScript (frontend), google-auth-library for token validation, crypto for session tokens

---

## File Structure

**Backend (New/Modified):**
- Modify: `server/db.ts` - Add admin_sessions & admin_users tables + CRUD functions
- Modify: `server/index.ts` - Replace Basic auth middleware, add OAuth endpoints
- Create: `server/oauth.ts` - OAuth token exchange & validation logic
- Create: `server/__tests__/oauth.test.ts` - OAuth endpoint tests

**Frontend (New/Modified):**
- Create: `src/pages/LoginPage.tsx` - Login page with Google OAuth button
- Modify: `src/App.tsx` - Add auth routing, protect routes
- Modify: `src/components/AdminPanel.tsx` - Add logout button to header
- Create: `src/__tests__/LoginPage.test.tsx` - Login page tests
- Modify: `src/__tests__/App.test.tsx` - Router auth tests

**Configuration:**
- Create: `.env.example` - Document OAuth environment variables
- Create: `docs/SETUP_OAUTH.md` - Google OAuth setup instructions

---

## Task 1: Database Schema - Admin Sessions

**Files:**
- Modify: `server/db.ts` - Add table creation and functions

- [ ] **Step 1: Add admin_sessions table to db.exec()**

```sql
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  last_activity INTEGER DEFAULT (unixepoch()),
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_email ON admin_sessions(user_email);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
```

- [ ] **Step 2: Add admin_users table to db.exec()**

```sql
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at INTEGER DEFAULT (unixepoch()),
  last_login INTEGER
);
```

- [ ] **Step 3: Implement createSession function**

```typescript
export function createSession(userEmail: string, sessionToken: string, expiresAt: number, userAgent?: string): AdminSession {
  const id = `session_${uuidv4()}`
  const createStmt = db.prepare(`
    INSERT INTO admin_sessions (id, user_email, session_token, expires_at, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `)
  createStmt.run(id, userEmail, sessionToken, expiresAt, userAgent || null)
  return {
    id,
    userEmail,
    sessionToken,
    expiresAt,
    createdAt: Math.floor(Date.now() / 1000),
    lastActivity: Math.floor(Date.now() / 1000),
    userAgent
  }
}
```

- [ ] **Step 4: Implement getSessionByToken function**

```typescript
export function getSessionByToken(sessionToken: string): AdminSession | undefined {
  const getStmt = db.prepare(`
    SELECT * FROM admin_sessions WHERE session_token = ?
  `)
  const session = getStmt.get(sessionToken) as any
  if (!session) return undefined
  return {
    id: session.id,
    userEmail: session.user_email,
    sessionToken: session.session_token,
    expiresAt: session.expires_at,
    createdAt: session.created_at,
    lastActivity: session.last_activity,
    userAgent: session.user_agent
  }
}
```

- [ ] **Step 5: Implement deleteSession & cleanupExpiredSessions functions**

```typescript
export function deleteSession(sessionToken: string): boolean {
  const deleteStmt = db.prepare(`DELETE FROM admin_sessions WHERE session_token = ?`)
  return deleteStmt.run(sessionToken).changes > 0
}

export function cleanupExpiredSessions(): number {
  const now = Math.floor(Date.now() / 1000)
  const cleanupStmt = db.prepare(`DELETE FROM admin_sessions WHERE expires_at < ?`)
  return cleanupStmt.run(now).changes
}
```

- [ ] **Step 6: Commit**

```bash
git add server/db.ts
git commit -m "feat: add admin_sessions and admin_users tables with CRUD functions"
```

---

## Task 2: OAuth Utility Module

**Files:**
- Create: `server/oauth.ts` - OAuth token exchange & validation

- [ ] **Step 1: Create oauth.ts with Google token verification**

```typescript
import { OAuth2Client } from 'google-auth-library'
import { v4 as uuidv4 } from 'uuid'

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

export interface GoogleTokenPayload {
  email: string
  email_verified: boolean
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const { tokens } = await googleClient.getToken(code)
  if (!tokens.id_token) {
    throw new Error('No ID token received from Google')
  }
  return tokens.id_token
}

export async function verifyGoogleToken(idToken: string): Promise<GoogleTokenPayload> {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID
  })
  const payload = ticket.getPayload()
  if (!payload || !payload.email) {
    throw new Error('Invalid token payload')
  }
  return {
    email: payload.email,
    email_verified: payload.email_verified || false
  }
}

export function generateSessionToken(): string {
  return uuidv4()
}

export function generateOAuthState(): string {
  return uuidv4()
}

export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
    response_type: 'code',
    scope: 'openid email',
    state
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}
```

- [ ] **Step 2: Install google-auth-library**

```bash
npm install google-auth-library uuid
```

- [ ] **Step 3: Commit**

```bash
git add server/oauth.ts package.json
git commit -m "feat: add OAuth utility module for Google token verification"
```

---

## Task 3: Backend Auth Endpoints - GET /api/auth/google

**Files:**
- Modify: `server/index.ts` - Add OAuth endpoints

- [ ] **Step 1: Import oauth module and crypto at top**

```typescript
import { exchangeCodeForToken, verifyGoogleToken, generateSessionToken, generateOAuthState, getGoogleAuthUrl } from './oauth.js'
import { createSession, getSessionByToken, deleteSession, cleanupExpiredSessions } from './db.js'
import crypto from 'crypto'
```

- [ ] **Step 2: Add OAuth state store (in-memory, simple)**

```typescript
const oauthStates = new Map<string, number>() // state -> timestamp

// Cleanup old states every hour
setInterval(() => {
  const now = Date.now()
  for (const [state, timestamp] of oauthStates) {
    if (now - timestamp > 3600000) { // 1 hour
      oauthStates.delete(state)
    }
  }
}, 3600000)
```

- [ ] **Step 3: Add GET /api/auth/google endpoint**

```typescript
app.get('/api/auth/google', (req, res) => {
  const state = generateOAuthState()
  oauthStates.set(state, Date.now())

  const authUrl = getGoogleAuthUrl(state)
  res.redirect(authUrl)
})
```

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: add GET /api/auth/google endpoint for OAuth flow initiation"
```

---

## Task 4: Backend Auth Endpoints - Callback Handler

**Files:**
- Modify: `server/index.ts` - Add callback endpoint

- [ ] **Step 1: Add GET /api/auth/google/callback endpoint**

```typescript
app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string }

  // Validate code and state
  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' })
  }

  // Validate CSRF state
  if (!oauthStates.has(state)) {
    return res.status(400).json({ error: 'Invalid state parameter' })
  }
  oauthStates.delete(state)

  try {
    // Exchange code for token
    const idToken = await exchangeCodeForToken(code as string)

    // Verify token and get email
    const payload = await verifyGoogleToken(idToken)

    // Validate email is authorized
    const adminEmail = process.env.ADMIN_EMAIL
    if (!adminEmail || payload.email.toLowerCase() !== adminEmail.toLowerCase()) {
      return res.status(401).json({ error: 'Email not authorized' })
    }

    // Create session
    const sessionToken = generateSessionToken()
    const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    createSession(payload.email, sessionToken, expiresAt, req.headers['user-agent'])

    // Set HTTP-only cookie
    res.cookie('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days in ms
    })

    res.redirect('/dashboard')
  } catch (error) {
    console.error('OAuth callback error:', error)
    res.status(500).json({ error: 'Authentication failed' })
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add server/index.ts
git commit -m "feat: add GET /api/auth/google/callback for OAuth token exchange"
```

---

## Task 5: Backend Auth Endpoints - Logout & Me

**Files:**
- Modify: `server/index.ts` - Add logout and /me endpoints

- [ ] **Step 1: Add POST /api/auth/logout endpoint**

```typescript
app.post('/api/auth/logout', (req, res) => {
  const sessionToken = req.cookies.session_token

  if (sessionToken) {
    deleteSession(sessionToken)
  }

  res.clearCookie('session_token')
  res.json({ success: true })
})
```

- [ ] **Step 2: Add GET /api/auth/me endpoint**

```typescript
app.get('/api/auth/me', (req, res) => {
  const sessionToken = req.cookies.session_token

  if (!sessionToken) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const session = getSessionByToken(sessionToken)
  if (!session || session.expiresAt < Math.floor(Date.now() / 1000)) {
    res.clearCookie('session_token')
    return res.status(401).json({ error: 'Session expired' })
  }

  res.json({ email: session.userEmail, role: 'admin' })
})
```

- [ ] **Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat: add POST /api/auth/logout and GET /api/auth/me endpoints"
```

---

## Task 6: Auth Middleware - Replace Basic Auth

**Files:**
- Modify: `server/index.ts` - Replace auth middleware

- [ ] **Step 1: Remove old Basic auth middleware**

Find and remove:
```typescript
if (COCKPIT_PASSWORD) {
  app.use((req, res, next) => {
    // ... basic auth code
  })
}
```

- [ ] **Step 2: Add new session-based auth middleware**

```typescript
const publicRoutes = ['/health', '/api/hooks', '/api/auth/google', '/api/auth/google/callback', '/api/share']

app.use((req, res, next) => {
  // Skip auth for public routes
  if (publicRoutes.some(route => req.path === route || req.path.startsWith(route))) {
    return next()
  }

  const sessionToken = req.cookies.session_token
  if (!sessionToken) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const session = getSessionByToken(sessionToken)
  if (!session || session.expiresAt < Math.floor(Date.now() / 1000)) {
    res.clearCookie('session_token')
    return res.status(401).json({ error: 'Session expired' })
  }

  // Valid session - attach to request
  (req as any).user = { email: session.userEmail }
  next()
})
```

- [ ] **Step 3: Add cookie parser middleware (if not already present)**

```bash
npm install cookie-parser
```

```typescript
import cookieParser from 'cookie-parser'
app.use(cookieParser())
```

- [ ] **Step 4: Add session cleanup on startup**

```typescript
// Cleanup expired sessions on startup
cleanupExpiredSessions()
console.log('Cleaned up expired sessions')

// Cleanup every hour
setInterval(() => {
  const deleted = cleanupExpiredSessions()
  if (deleted > 0) console.log(`Cleaned up ${deleted} expired sessions`)
}, 3600000)
```

- [ ] **Step 5: Commit**

```bash
git add server/index.ts package.json
git commit -m "feat: replace Basic auth with session-based OAuth authentication"
```

---

## Task 7: Backend Tests - OAuth Endpoints

**Files:**
- Create: `server/__tests__/oauth.test.ts` - OAuth tests

- [ ] **Step 1: Write OAuth endpoint tests**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getSessionByToken, deleteSession, createSession } from '../db.js'
import { generateSessionToken } from '../oauth.js'

describe('OAuth Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET /api/auth/google redirects to Google OAuth', async () => {
    // Test OAuth redirect URL generation
    // Verify client_id, redirect_uri, scope in URL
  })

  it('GET /api/auth/google/callback validates email and creates session', async () => {
    // Mock Google token verification
    // Verify session created in database
    // Verify session_token cookie set
  })

  it('POST /api/auth/logout deletes session', async () => {
    // Create session, logout, verify session deleted
  })

  it('GET /api/auth/me returns authenticated user email', async () => {
    // With valid session -> returns email
    // Without session -> returns 401
    // With expired session -> returns 401
  })

  it('Denies unauthorized emails', async () => {
    // Mock Google token for wrong email
    // Verify 401 response
  })

  it('CSRF state validation works', async () => {
    // Submit callback with invalid state
    // Verify 400 response
  })
})
```

- [ ] **Step 2: Implement tests**

Write complete test suite with mocked Google API responses and session validation.

- [ ] **Step 3: Run tests**

```bash
npm test -- oauth.test.ts
```

Expected: All tests passing

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/oauth.test.ts
git commit -m "test: add OAuth endpoint tests"
```

---

## Task 8: Frontend - Login Page Component

**Files:**
- Create: `src/pages/LoginPage.tsx` - Login page

- [ ] **Step 1: Create LoginPage component**

```typescript
import { useEffect } from 'react'

export default function LoginPage() {
  useEffect(() => {
    // Check if already authenticated
    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) {
          window.location.href = '/dashboard'
        }
      })
      .catch(() => {
        // Not authenticated, show login
      })
  }, [])

  const handleGoogleSignIn = () => {
    window.location.href = '/api/auth/google'
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg max-w-md w-full text-center">
        <h1 className="text-3xl font-bold text-white mb-8">Agent Cockpit</h1>

        <p className="text-gray-400 mb-6">Sign in to continue</p>

        <button
          onClick={handleGoogleSignIn}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <text>G</text>
          </svg>
          Sign in with Google
        </button>

        <p className="text-gray-500 text-sm mt-4">
          Only your registered email address can access this application.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/LoginPage.tsx
git commit -m "feat: add LoginPage component with Google OAuth button"
```

---

## Task 9: Frontend - App Routing & Auth Guards

**Files:**
- Modify: `src/App.tsx` - Add auth routing

- [ ] **Step 1: Add auth state and effect to check session**

```typescript
import { useEffect, useState } from 'react'
import LoginPage from './pages/LoginPage'

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [user, setUser] = useState<{ email: string } | null>(null)

  useEffect(() => {
    // Check authentication on mount
    fetch('/api/auth/me')
      .then(res => {
        if (res.ok) {
          return res.json().then(data => {
            setUser(data)
            setIsAuthenticated(true)
          })
        } else {
          setIsAuthenticated(false)
        }
      })
      .catch(() => {
        setIsAuthenticated(false)
      })
  }, [])

  // Show loading while checking auth
  if (isAuthenticated === null) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return <LoginPage />
  }

  // Authenticated - show dashboard
  return (
    // ... existing app layout
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add auth routing with session validation"
```

---

## Task 10: Frontend - Add Logout Button

**Files:**
- Modify: `src/components/AdminPanel.tsx` - Add logout button

- [ ] **Step 1: Add logout function and button to header**

```typescript
const handleLogout = async () => {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.href = '/login'
}

// In JSX header:
<button
  onClick={handleLogout}
  className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded"
>
  Logout
</button>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AdminPanel.tsx
git commit -m "feat: add logout button to dashboard header"
```

---

## Task 11: Configuration - Environment Variables

**Files:**
- Create: `.env.example` - Document OAuth env vars
- Create: `docs/SETUP_OAUTH.md` - OAuth setup guide

- [ ] **Step 1: Create .env.example**

```bash
# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REDIRECT_URI=http://localhost:4200/api/auth/google/callback
ADMIN_EMAIL=your.email@gmail.com

# No longer needed:
# COCKPIT_PASSWORD=xxx (deprecated)
# COCKPIT_USER=xxx (deprecated)
```

- [ ] **Step 2: Create SETUP_OAUTH.md**

Document:
1. Create Google OAuth app in Google Cloud Console
2. Get Client ID and Client Secret
3. Configure redirect URI
4. Set environment variables
5. Deploy to Railway

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/SETUP_OAUTH.md
git commit -m "docs: add OAuth environment setup guide"
```

---

## Task 12: Frontend Tests - Login Page

**Files:**
- Create: `src/__tests__/LoginPage.test.tsx` - Login tests

- [ ] **Step 1: Write LoginPage tests**

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LoginPage from '../pages/LoginPage'

describe('LoginPage', () => {
  it('renders Sign in with Google button', () => {
    render(<LoginPage />)
    expect(screen.getByText(/Sign in with Google/)).toBeInTheDocument()
  })

  it('redirects to OAuth endpoint on button click', () => {
    window.location.href = ''
    render(<LoginPage />)
    fireEvent.click(screen.getByText(/Sign in with Google/))
    expect(window.location.href).toContain('/api/auth/google')
  })

  it('redirects to dashboard if already authenticated', () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ email: 'test@example.com' })))
    )
    render(<LoginPage />)
    // Verify redirect to /dashboard
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add src/__tests__/LoginPage.test.tsx
git commit -m "test: add LoginPage component tests"
```

---

## Task 13: Frontend Tests - Auth Routing

**Files:**
- Modify: `src/__tests__/App.test.tsx` - Add auth routing tests

- [ ] **Step 1: Add routing tests**

```typescript
it('shows LoginPage when not authenticated', () => {
  // Mock /api/auth/me to return 401
  // Verify LoginPage renders
})

it('shows dashboard when authenticated', () => {
  // Mock /api/auth/me to return user
  // Verify dashboard renders
})

it('logout button clears session', () => {
  // Test logout API call
  // Verify redirect to login
})
```

- [ ] **Step 2: Commit**

```bash
git add src/__tests__/App.test.tsx
git commit -m "test: add auth routing tests"
```

---

## Task 14: Verify & Cleanup

**Files:**
- No new files

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests passing (200+ tests)

- [ ] **Step 2: Build production bundle**

```bash
npm run build
```

Expected: No errors, bundle size ~800kb gzip

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: No critical errors

- [ ] **Step 4: Remove Basic auth console log**

Find and remove from server/index.ts:
```typescript
console.log('  Auth: Basic auth enabled')
```

- [ ] **Step 5: Verify all auth routes work**

- POST /api/auth/logout ✓
- GET /api/auth/me ✓
- GET /api/auth/google ✓
- GET /api/auth/google/callback ✓

- [ ] **Step 6: Final commit**

```bash
git commit -m "refactor: cleanup after OAuth implementation"
```

---

## Task 15: Merge Text Mode + OAuth

**Files:**
- No new files

- [ ] **Step 1: Verify both features working**

- Text mode toggle in TerminalView ✓
- Session sharing with passwords ✓
- Google OAuth login ✓
- Session-based auth ✓

- [ ] **Step 2: Full test suite**

```bash
npm test
```

Expected: 200+ tests passing

- [ ] **Step 3: Build & verify**

```bash
npm run build
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 4: Create final commit message**

```
feat: implement Google OAuth and session-based authentication

- Replace HTTP Basic auth with Google OAuth
- Add session management with 30-day expiration
- Email-based access control
- HTTP-only, secure session cookies
- /api/auth/google, /api/auth/google/callback, /api/auth/logout, /api/auth/me endpoints
- LoginPage component
- Session cleanup jobs

Addresses backlog item #58: Remove admin credentials from Railway env vars

Also includes completed features:
- Text Mode for terminal/text display toggling
- Session Sharing with password-protected links
```

---

## Success Criteria

✅ Google OAuth login works end-to-end
✅ Only admin email can access dashboard
✅ Sessions persist across page reloads
✅ Logout clears session
✅ Text mode feature still works
✅ Session sharing still works
✅ No credentials in environment variables
✅ All tests passing (200+ tests)
✅ Build succeeds with no errors
✅ Ready for Railway deployment
