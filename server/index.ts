import express from 'express'
import { createServer } from 'http'
import { execSync } from 'child_process'
import os from 'os'
import { WebSocketServer, WebSocket } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import {
  listSessions,
  getSessionContent,
  createSession as createTmuxSession,
  killSession,
  sendKeys,
  sessionExists,
  detectSessionState,
  resizeSession,
} from './tmux.js'
import {
  logEvent, getSessionEvents, getAllRecentEvents,
  registerManagedSession, heartbeatManagedSession, endManagedSession,
  getManagedSessionById, listManagedSessions, cleanupManagedSessions,
  createTemplate, listTemplates, removeTemplate,
  upsertDeploymentRecord, listDeployments, logMetric, getMetrics,
  logSessionMetrics, getAggregatedMetrics, getSessionMetrics,
  saveGitHubConfig, getGitHubConfig,
  createHook, listHooks, updateHook, deleteHook,
  listPendingTasks, updateTaskStatus, updateTaskResult, getSyncStatus,
  createSession, getSessionByToken, deleteSession, cleanupExpiredSessions,
} from './db.js'
import { exchangeCodeForToken, verifyGoogleToken, generateSessionToken, generateOAuthState, getGoogleAuthUrl } from './oauth.js'
import { initRailway, fetchDeployments, fetchMetrics, fetchEnvironmentVariables } from './railway.js'
import { initGitHub, fetchPRs, fetchIssues, fetchBranches } from './github.js'
import { listAvailableSkills, getSkillMetadata } from './skills.js'
import { registerBacklogRoutes } from './backlog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const server = createServer(app)
const PORT = parseInt(process.env.PORT || '4200')

initRailway()
initGitHub()

app.use(express.json())

// --- OAuth State Store ---
const oauthStates = new Map<string, number>()

// Cleanup OAuth states every hour (remove states older than 1 hour)
setInterval(() => {
  const now = Date.now()
  const oneHourAgo = now - 60 * 60 * 1000
  for (const [state, timestamp] of oauthStates.entries()) {
    if (timestamp < oneHourAgo) {
      oauthStates.delete(state)
    }
  }
}, 60 * 60 * 1000) // Every hour

// --- Cookie Parser Middleware ---
app.use((req, res, next) => {
  const cookieHeader = req.headers.cookie || ''
  req.cookies = {}
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=')
    if (name && value) {
      req.cookies[name] = decodeURIComponent(value)
    }
  })
  next()
})

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      cookies: Record<string, string>
    }
  }
}

// --- Session-Based Auth Middleware ---
const publicRoutes = ['/health', '/api/system/capabilities', '/api/hooks', '/api/auth/google', '/api/auth/google/callback', '/api/auth/logout', '/api/share', '/api/channel']

app.use((req, res, next) => {
  // Skip auth for public routes
  if (publicRoutes.some(route => req.path === route || req.path.startsWith(route + '/'))) {
    return next()
  }

  // Get session token from cookie
  const sessionToken = req.cookies.session_token
  if (!sessionToken) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Validate session exists and not expired
  const session = getSessionByToken(sessionToken)
  if (!session || session.expiresAt < Math.floor(Date.now() / 1000)) {
    res.clearCookie('session_token')
    return res.status(401).json({ error: 'Session expired' })
  }

  // Valid session - attach user info to request
  (req as any).user = { email: session.userEmail, role: 'admin' }
  next()
})

registerBacklogRoutes(app)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/system/capabilities', (_req, res) => {
  res.json({
    platform: process.platform,
    features: {
      openInTerminal: process.platform === 'darwin',
      folderPicker: process.platform === 'darwin',
    }
  })
})

// Serve static files in production
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))

// --- Merged Sessions Helper ---

function getMergedSessions() {
  const tmuxSessions = listSessions()
  const enrichedTmux = tmuxSessions.map((s) => {
    const content = getSessionContent(s.name, 30)
    const detectedState = detectSessionState(content)
    return {
      ...s,
      status: detectedState === 'waiting' ? 'waiting' : s.status,
      source: 'tmux' as const,
    }
  })

  const managed = listManagedSessions()
  const now = Math.floor(Date.now() / 1000)
  const managedAsSessions = managed.map((m) => ({
    name: m.name,
    created: m.started_at,
    attached: false,
    lastActivity: m.last_heartbeat,
    idleSecs: now - m.last_heartbeat,
    status: m.status as 'active' | 'idle' | 'waiting' | 'dead',
    cwd: m.cwd,
    source: 'local' as const,
    sessionId: m.id,
  }))

  return [...enrichedTmux, ...managedAsSessions]
}

// --- REST API ---

app.get('/api/sessions', (_req, res) => {
  res.json(getMergedSessions())
})

app.post('/api/sessions', (req, res) => {
  const { name, command, cwd } = req.body
  if (!name || !command) {
    res.status(400).json({ error: 'name and command are required' })
    return
  }
  if (sessionExists(name)) {
    res.status(409).json({ error: `Session "${name}" already exists` })
    return
  }
  const ok = createTmuxSession(name, command, cwd)
  if (ok) {
    logEvent(name, 'created', JSON.stringify({ command, cwd }))
    res.json({ ok: true, name })
  } else {
    res.status(500).json({ error: 'Failed to create session' })
  }
})

app.delete('/api/sessions/:name', (req, res) => {
  const { name } = req.params
  // Try tmux first
  const ok = killSession(name)
  if (ok) {
    logEvent(name, 'killed')
    broadcastSessions()
    res.json({ ok: true })
    return
  }
  // Try managed session (name may be sessionId for local sessions)
  const managed = getManagedSessionById(name)
  if (managed) {
    endManagedSession(name)
    logEvent(managed.name, 'dismissed')
    broadcastSessions()
    res.json({ ok: true })
    return
  }
  res.status(404).json({ error: `Session "${name}" not found` })
})

app.get('/api/sessions/:name/logs', (req, res) => {
  const { name } = req.params
  const limit = parseInt(req.query.limit as string) || 50
  res.json(getSessionEvents(name, limit))
})

app.get('/api/sessions/:name/content', (req, res) => {
  const { name } = req.params
  const lines = parseInt(req.query.lines as string) || 200
  const content = getSessionContent(name, lines)
  res.json({ content })
})

app.post('/api/sessions/:name/send', (req, res) => {
  const { name } = req.params
  const { keys } = req.body
  if (!keys) {
    res.status(400).json({ error: 'keys is required' })
    return
  }
  const ok = sendKeys(name, keys)
  res.json({ ok })
})

app.get('/api/events', (_req, res) => {
  const limit = parseInt(_req.query.limit as string) || 100
  res.json(getAllRecentEvents(limit))
})

app.get('/api/pick-folder', (_req, res) => {
  if (process.platform !== 'darwin') {
    res.json({ path: null, error: 'Folder picker only available on macOS' })
    return
  }
  try {
    const script = `
      set chosenFolder to POSIX path of (choose folder with prompt "Select Working Directory")
      return chosenFolder
    `
    const result = execSync(`osascript -e '${script}'`, { timeout: 60000 }).toString().trim()
    const folder = result.endsWith('/') ? result.slice(0, -1) : result
    res.json({ path: folder })
  } catch {
    res.json({ path: null })
  }
})

// --- Templates API ---

app.get('/api/templates', (_req, res) => {
  res.json(listTemplates())
})

app.post('/api/templates', (req, res) => {
  const { name, command, cwd, icon, category } = req.body
  if (!name || !command) {
    res.status(400).json({ error: 'name and command are required' })
    return
  }
  const template = createTemplate(name, command, cwd || '~', icon, category)
  res.json(template)
})

app.delete('/api/templates/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const ok = removeTemplate(id)
  res.json({ ok })
})

// --- Settings API ---

app.post('/api/settings/claude-token', (req, res) => {
  const { token } = req.body
  if (!token || !token.startsWith('sk-ant-oat')) {
    res.status(400).json({ error: 'Invalid token format (must start with sk-ant-oat)' })
    return
  }
  // Update the env var for current process
  process.env.CLAUDE_CODE_AUTH_TOKEN = token
  // Try to persist via Railway CLI if available
  try {
    execSync(`railway variable set CLAUDE_CODE_AUTH_TOKEN="${token}" 2>/dev/null`, { timeout: 10000 })
    res.json({ ok: true, message: 'Token updated via Railway CLI' })
  } catch {
    // Railway CLI not available — just update process env
    res.json({ ok: true, message: 'Token updated for current process (Railway CLI not available)' })
  }
})

// --- Railway Admin Endpoints ---

const PROJECT_ID = '6ffdb913-43d2-49aa-b68e-0e5b617a148d'
const SERVICE_ID = '434d4687-cf40-4ba6-ad07-5918babd23cd'

app.get('/api/admin/railway/deployments', async (req, res) => {
  // Auth is handled by session-based middleware above
  // Fetch from Railway API and cache
  const deployments = await fetchDeployments(PROJECT_ID, SERVICE_ID)
  for (const d of deployments) {
    upsertDeploymentRecord(
      d.id, SERVICE_ID, d.status,
      undefined, d.meta?.commitSha, d.meta?.branch
    )
  }

  // Return from cache
  const cached = listDeployments(SERVICE_ID, 20)
  res.json(cached)
})

app.get('/api/admin/railway/metrics', async (req, res) => {
  // Auth is handled by session-based middleware above
  const metrics = await fetchMetrics(SERVICE_ID)
  if (Object.keys(metrics).length > 0) {
    logMetric(SERVICE_ID, metrics.cpuPercent, metrics.memoryMb, metrics.uptimeSeconds)
  }

  const history = getMetrics(SERVICE_ID, 24, 100)
  res.json(history)
})

app.get('/api/admin/railway/variables', async (req, res) => {
  // Auth is handled by session-based middleware above
  const vars = await fetchEnvironmentVariables(SERVICE_ID)
  res.json(vars)
})

// --- GitHub Admin Endpoints ---

app.get('/api/admin/github/config', (req, res) => {
  const config = getGitHubConfig()
  if (config) {
    res.json({ owner: config.owner, repo: config.repo })
  } else {
    res.json({ owner: '', repo: '' })
  }
})

app.post('/api/admin/github/config', (req, res) => {
  const { token, owner, repo } = req.body

  if (!token || !owner || !repo) {
    res.status(400).json({ error: 'Missing fields' })
    return
  }

  try {
    saveGitHubConfig(token, owner, repo)
    initGitHub()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to save config' })
  }
})

app.get('/api/admin/github/prs', async (req, res) => {
  const config = getGitHubConfig()
  if (!config) {
    res.status(400).json({ error: 'GitHub not configured' })
    return
  }

  try {
    const prs = await fetchPRs(config.owner, config.repo)
    res.json(prs)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch PRs' })
  }
})

app.get('/api/admin/github/issues', async (req, res) => {
  const config = getGitHubConfig()
  if (!config) {
    res.status(400).json({ error: 'GitHub not configured' })
    return
  }

  try {
    const issues = await fetchIssues(config.owner, config.repo)
    res.json(issues)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch issues' })
  }
})

app.get('/api/admin/github/branches', async (req, res) => {
  const config = getGitHubConfig()
  if (!config) {
    res.status(400).json({ error: 'GitHub not configured' })
    return
  }

  try {
    const branches = await fetchBranches(config.owner, config.repo)
    res.json(branches)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch branches' })
  }
})

// --- Analytics Endpoints ---

app.get('/api/admin/analytics/metrics', (req, res) => {
  // Auth is handled by session-based middleware above
  try {
    const days = parseInt(req.query.days as string) || 30
    const data = getAggregatedMetrics(days)
    res.json(data)
  } catch (error) {
    console.error('Failed to get analytics metrics:', error)
    res.status(500).json({ error: 'Failed to get metrics' })
  }
})

app.get('/api/admin/analytics/history', (req, res) => {
  // Auth is handled by session-based middleware above
  try {
    const sessionId = req.query.session_id as string
    if (!sessionId) {
      res.status(400).json({ error: 'session_id required' })
      return
    }
    const metric = getSessionMetrics(sessionId)
    if (!metric) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    res.json(metric)
  } catch (error) {
    console.error('Failed to get session history:', error)
    res.status(500).json({ error: 'Failed to get session history' })
  }
})

// --- Hooks Management Endpoints (no auth for frontend) ---

app.get('/api/hooks', (req, res) => {
  try {
    const hookType = req.query.type as string | undefined
    const hooks = listHooks(hookType)
    res.json(hooks)
  } catch (error) {
    console.error('Failed to list hooks:', error)
    res.status(500).json({ error: 'Failed to list hooks' })
  }
})

app.post('/api/hooks', (req, res) => {
  try {
    const { hook_type, trigger, name, command, enabled } = req.body

    if (!hook_type || !trigger || !name || !command) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }

    const hook = createHook({
      hook_type,
      trigger,
      name,
      command,
      enabled: enabled !== false
    })
    res.status(201).json(hook)
  } catch (error) {
    console.error('Failed to create hook:', error)
    res.status(500).json({ error: 'Failed to create hook' })
  }
})

app.put('/api/hooks/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id)
    const { enabled, command, name } = req.body

    const updated = updateHook(id, { enabled, command, name })
    if (!updated) {
      res.status(404).json({ error: 'Hook not found' })
      return
    }

    res.json(updated)
  } catch (error) {
    console.error('Failed to update hook:', error)
    res.status(500).json({ error: 'Failed to update hook' })
  }
})

app.delete('/api/hooks/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id)

    const success = deleteHook(id)
    if (!success) {
      res.status(404).json({ error: 'Hook not found' })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Failed to delete hook:', error)
    res.status(500).json({ error: 'Failed to delete hook' })
  }
})

// --- Skills Endpoints ---

app.get('/api/skills', async (req, res) => {
  try {
    const skills = await listAvailableSkills()
    res.json(skills)
  } catch (error) {
    console.error('Failed to list skills:', error)
    res.status(500).json({ error: 'Failed to list skills' })
  }
})

app.get('/api/skills/:name', async (req, res) => {
  const { name } = req.params

  try {
    const skill = getSkillMetadata(name)
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' })
      return
    }
    res.json(skill)
  } catch (error) {
    console.error('Failed to get skill metadata:', error)
    res.status(500).json({ error: 'Failed to get skill metadata' })
  }
})

// --- Open in Terminal (local only) ---

app.post('/api/sessions/:id/open-terminal', (req, res) => {
  const { id } = req.params
  const managed = getManagedSessionById(id)
  if (!managed) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  if (process.platform !== 'darwin') {
    res.status(400).json({ error: 'Open in terminal only supported on macOS' })
    return
  }
  try {
    const cmd = `claude --resume ${managed.id}`
    const script = `
      tell application "com.mitchellh.ghostty"
        activate
        tell application "System Events" to keystroke "t" using command down
        delay 0.3
        tell application "System Events" to keystroke "cd ${managed.cwd} && ${cmd}"
        tell application "System Events" to key code 36
      end tell
    `
    execSync(`osascript -e '${script}'`, { timeout: 5000 })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: `Failed to open terminal: ${(e as Error).message}` })
  }
})

// --- Hook API (no auth required) ---

app.post('/api/hooks/session-start', (req, res) => {
  const { session_id, name, cwd, metadata } = req.body
  if (!session_id || !name) {
    res.status(400).json({ error: 'session_id and name are required' })
    return
  }
  registerManagedSession(session_id, name, cwd || '~', metadata ? JSON.stringify(metadata) : undefined)
  logEvent(name, 'started', JSON.stringify({ session_id, cwd: cwd || '~' }))
  broadcastSessions()
  res.json({ ok: true })
})

app.post('/api/hooks/heartbeat', (req, res) => {
  const { session_id, status, message } = req.body
  if (!session_id) {
    res.status(400).json({ error: 'session_id is required' })
    return
  }
  heartbeatManagedSession(session_id, status || 'active')
  // Log status transitions (waiting = needs attention)
  const effectiveStatus = status || 'active'
  if (effectiveStatus === 'waiting') {
    const managed = getManagedSessionById(session_id)
    const eventName = managed?.name || session_id
    logEvent(eventName, 'waiting', message ? JSON.stringify({ message }) : undefined)
  }
  broadcastSessions()
  res.json({ ok: true })
})

app.post('/api/hooks/session-end', (req, res) => {
  const { session_id } = req.body
  if (!session_id) {
    res.status(400).json({ error: 'session_id is required' })
    return
  }
  const managed = getManagedSessionById(session_id)
  const eventName = managed?.name || session_id

  // Log session metrics when session ends
  if (managed) {
    const durationMs = (Math.floor(Date.now() / 1000) - managed.started_at) * 1000
    logSessionMetrics({
      sessionId: session_id,
      sessionName: managed.name,
      model: 'sonnet',
      durationMs,
      tokensUsed: 0,
      costUsd: undefined,
      endedAt: Math.floor(Date.now() / 1000),
    })
  }

  endManagedSession(session_id)
  logEvent(eventName, 'ended')
  broadcastSessions()
  res.json({ ok: true })
})

// --- Channel API Endpoints ---

app.get('/api/channel/tasks/pending', (req, res) => {
  try {
    const tasks = listPendingTasks(10)
    const checkpoint = tasks.length > 0 ? tasks[tasks.length - 1].id : null

    // Update status to 'fetched' for each task
    tasks.forEach(task => {
      updateTaskStatus(task.id, 'fetched', { fetched_at: true })
    })

    res.json({
      tasks: tasks.map(t => ({
        id: t.id,
        task_type: t.task_type,
        title: t.title,
        input_payload: t.input_payload,
        created_at: t.created_at
      })),
      checkpoint
    })
  } catch (error) {
    console.error('Failed to fetch pending tasks:', error)
    res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

app.post('/api/channel/tasks/:id/result', (req, res) => {
  try {
    const { id } = req.params
    const { status, output_payload, error_message, duration_ms } = req.body

    if (!['completed', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    updateTaskResult(id, status as 'completed' | 'failed', output_payload || {}, error_message, duration_ms)

    res.json({
      acknowledged: true,
      task_id: id
    })
  } catch (error) {
    console.error('Failed to update task result:', error)
    res.status(500).json({ error: 'Failed to update task' })
  }
})

app.get('/api/channel/sync/status', (req, res) => {
  try {
    const status = getSyncStatus()

    // Find the most recently active channel session
    const channelSessions = listManagedSessions().filter(
      (s) => s.name === 'claude-code-channel'
    )
    const activeSession = channelSessions[0] ?? null
    const sessionIdle = activeSession && activeSession.status === 'idle'

    res.json({
      session_id: activeSession?.id ?? null,
      status: activeSession
        ? (sessionIdle ? 'idle' : 'connected')
        : 'offline',
      last_sync: status.last_sync,
      pending_count: status.pending_count,
      completed_today: status.completed_today,
      in_progress: status.in_progress,
      active_channel_sessions: channelSessions.length,
    })
  } catch (error) {
    console.error('Failed to get sync status:', error)
    res.status(500).json({ error: 'Failed to get status' })
  }
})

// --- Auth Endpoints ---

// Task 3: GET /api/auth/google - OAuth flow initiation
app.get('/api/auth/google', (req, res) => {
  try {
    // Validate required env vars are set
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
      res.status(500).json({ error: 'OAuth not configured' })
      return
    }

    // Generate CSRF state token
    const state = generateOAuthState()
    // Store state with timestamp for validation (expires after 1 hour)
    oauthStates.set(state, Date.now())
    // Get Google OAuth URL
    const authUrl = getGoogleAuthUrl(state)
    // Redirect to Google
    res.redirect(authUrl)
  } catch (error) {
    console.error('Failed to initiate OAuth flow:', error)
    res.status(500).json({ error: 'Failed to initiate OAuth flow' })
  }
})

// Task 4: GET /api/auth/google/callback - OAuth callback handler
app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query

    // Validate code and state are present
    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state parameter' })
      return
    }

    // Validate state (CSRF protection)
    if (!oauthStates.has(state as string)) {
      res.status(400).json({ error: 'Invalid or expired state parameter' })
      return
    }

    // Delete state from map (cleanup)
    oauthStates.delete(state as string)

    // Exchange code for token
    const idToken = await exchangeCodeForToken(code as string)
    // Verify token and extract payload
    const payload = await verifyGoogleToken(idToken)

    // Check if email is authorized
    const adminEmail = process.env.ADMIN_EMAIL || ''
    if (payload.email.toLowerCase() !== adminEmail.toLowerCase()) {
      res.status(401).json({ error: 'Email not authorized' })
      return
    }

    // Generate session token
    const sessionToken = generateSessionToken()
    // Calculate expiration (30 days in seconds)
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60

    // Create session in DB
    createSession(payload.email, sessionToken, expiresAt, req.headers['user-agent'])

    // Set HTTP-only cookie
    const isProduction = process.env.NODE_ENV === 'production'
    res.cookie('session_token', sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days in milliseconds
    })

    // Redirect to dashboard
    res.redirect('/dashboard')
  } catch (error) {
    console.error('OAuth callback error:', error)
    res.status(500).json({ error: 'Authentication failed' })
  }
})

// Task 5: POST /api/auth/logout - Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  try {
    const sessionToken = req.cookies.session_token
    if (sessionToken) {
      deleteSession(sessionToken)
    }
    res.clearCookie('session_token')
    res.json({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ error: 'Logout failed' })
  }
})

// Task 5: GET /api/auth/me - Get current user info
app.get('/api/auth/me', (req, res) => {
  try {
    const sessionToken = req.cookies.session_token
    if (!sessionToken) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const session = getSessionByToken(sessionToken)
    if (!session) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Check if session has expired
    const currentTime = Math.floor(Date.now() / 1000)
    if (session.expiresAt < currentTime) {
      res.clearCookie('session_token')
      res.status(401).json({ error: 'Session expired' })
      return
    }

    res.json({
      email: session.userEmail,
      role: 'admin'
    })
  } catch (error) {
    console.error('Get user info error:', error)
    res.status(500).json({ error: 'Failed to get user info' })
  }
})

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// --- WebSocket ---

const wss = new WebSocketServer({ noServer: true })

// --- Relay connections (local PTY → server → browser) ---
// Key: sessionId, Value: { relay WebSocket, connected browser WebSockets }
const relayConnections = new Map<string, {
  relay: WebSocket
  browsers: Set<WebSocket>
  outputBuffer: string[]  // last N chunks for replay on browser connect
}>()

const RELAY_BUFFER_MAX = 500 // keep last 500 output chunks for replay

// Broadcast session updates to all connected clients
function broadcastSessions() {
  const all = getMergedSessions()
  // Annotate sessions with relay status
  const annotated = all.map((s) => ({
    ...s,
    relayConnected: 'sessionId' in s && s.sessionId ? relayConnections.has(s.sessionId) : false,
  }))
  const msg = JSON.stringify({ type: 'sessions', data: annotated })
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg)
    }
  })
}

// Poll sessions every 3 seconds
setInterval(broadcastSessions, 3000)

// Cleanup stale managed sessions every 60 seconds
setInterval(cleanupManagedSessions, 60000)

// Cleanup expired admin sessions every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000)

wss.on('connection', (ws) => {
  // Send initial session list on connect
  ws.send(JSON.stringify({ type: 'sessions', data: getMergedSessions().map((s) => ({
    ...s,
    relayConnected: 'sessionId' in s && s.sessionId ? relayConnections.has(s.sessionId) : false,
  })) }))
})

// --- Terminal + Relay WebSocket ---

const termWss = new WebSocketServer({ noServer: true })
const relayWss = new WebSocketServer({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  // Check session-based auth on WebSocket upgrade
  const cookieHeader = request.headers.cookie || ''
  const cookies: Record<string, string> = {}
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=')
    if (name && value) {
      cookies[name] = decodeURIComponent(value)
    }
  })

  const sessionToken = cookies.session_token
  if (!sessionToken) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  const session = getSessionByToken(sessionToken)
  if (!session || session.expiresAt < Math.floor(Date.now() / 1000)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  const url = new URL(request.url || '', `http://localhost:${PORT}`)

  if (url.pathname === '/ws/events') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  } else if (url.pathname.startsWith('/ws/relay/')) {
    relayWss.handleUpgrade(request, socket, head, (ws) => {
      relayWss.emit('connection', ws, request)
    })
  } else if (url.pathname.startsWith('/ws/terminal/')) {
    termWss.handleUpgrade(request, socket, head, (ws) => {
      termWss.emit('connection', ws, request)
    })
  } else {
    socket.destroy()
  }
})

// --- Relay WebSocket (local PTY connects here) ---

relayWss.on('connection', (ws, request) => {
  const url = new URL(request.url || '', `http://localhost:${PORT}`)
  const sessionId = decodeURIComponent(url.pathname.replace('/ws/relay/', ''))

  console.log(`[relay] Connected: ${sessionId}`)

  const conn = { relay: ws, browsers: new Set<WebSocket>(), outputBuffer: [] as string[] }
  relayConnections.set(sessionId, conn)
  broadcastSessions()

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'output') {
        // Store in buffer for replay
        conn.outputBuffer.push(msg.data)
        if (conn.outputBuffer.length > RELAY_BUFFER_MAX) {
          conn.outputBuffer.shift()
        }
        // Forward to all connected browsers
        const fwd = JSON.stringify({ type: 'output', data: msg.data })
        conn.browsers.forEach((browser) => {
          if (browser.readyState === WebSocket.OPEN) {
            browser.send(fwd)
          }
        })
      } else if (msg.type === 'resize') {
        // Forward resize to browsers
        const fwd = JSON.stringify(msg)
        conn.browsers.forEach((browser) => {
          if (browser.readyState === WebSocket.OPEN) {
            browser.send(fwd)
          }
        })
      }
    } catch {
      // ignore
    }
  })

  ws.on('close', () => {
    console.log(`[relay] Disconnected: ${sessionId}`)
    // Notify browsers
    conn.browsers.forEach((browser) => {
      if (browser.readyState === WebSocket.OPEN) {
        browser.send(JSON.stringify({ type: 'relay-disconnected' }))
      }
    })
    relayConnections.delete(sessionId)
    broadcastSessions()
  })
})

// --- Terminal WebSocket (browser connects here) ---

termWss.on('connection', (ws, request) => {
  const url = new URL(request.url || '', `http://localhost:${PORT}`)
  const sessionKey = decodeURIComponent(url.pathname.replace('/ws/terminal/', ''))

  // Check if this is a relay session
  const relayConn = relayConnections.get(sessionKey)
  if (relayConn) {
    // --- Relay mode: bridge browser ↔ relay ---
    relayConn.browsers.add(ws)
    console.log(`[relay] Browser attached to relay: ${sessionKey}`)

    // Replay buffered output so browser sees recent history
    if (relayConn.outputBuffer.length > 0) {
      const replay = relayConn.outputBuffer.join('')
      ws.send(JSON.stringify({ type: 'output', data: replay }))
    }

    // Browser input → relay → PTY
    ws.on('message', (data) => {
      if (relayConn.relay.readyState === WebSocket.OPEN) {
        relayConn.relay.send(data.toString())
      }
    })

    ws.on('close', () => {
      relayConn.browsers.delete(ws)
      console.log(`[relay] Browser detached from relay: ${sessionKey}`)
    })
    return
  }

  // --- Tmux mode (existing behavior) ---
  if (!sessionExists(sessionKey)) {
    ws.send(JSON.stringify({ type: 'error', message: `Session "${sessionKey}" not found` }))
    ws.close()
    return
  }

  // Send initial content
  const content = getSessionContent(sessionKey, 500)
  ws.send(JSON.stringify({ type: 'content', data: content }))

  // Poll for new content and send diffs
  let lastContent = content
  const pollInterval = setInterval(() => {
    if (!sessionExists(sessionKey)) {
      ws.send(JSON.stringify({ type: 'closed', message: 'Session ended' }))
      ws.close()
      return
    }
    const newContent = getSessionContent(sessionKey, 500)
    if (newContent !== lastContent) {
      lastContent = newContent
      ws.send(JSON.stringify({ type: 'content', data: newContent }))
    }
  }, 500)

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'input') {
        sendKeys(sessionKey, msg.data)
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        resizeSession(sessionKey, msg.cols, msg.rows)
      }
    } catch {
      // Send raw input as keys
      sendKeys(sessionKey, data.toString())
    }
  })

  ws.on('close', () => {
    clearInterval(pollInterval)
  })
})

// --- Session Cleanup on Startup ---
const cleanupCount = cleanupExpiredSessions()
console.log('Cleaned up', cleanupCount, 'expired sessions on startup')

// Cleanup every hour
setInterval(() => {
  const deleted = cleanupExpiredSessions()
  if (deleted > 0) {
    console.log('Cleaned up', deleted, 'expired sessions')
  }
}, 3600000) // Every hour

server.listen(PORT, '0.0.0.0', () => {
  const interfaces = Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)

  console.log(`\n  Agent Cockpit running at:`)
  console.log(`    Local:   http://localhost:${PORT}`)
  interfaces.forEach((i) => {
    console.log(`    Network: http://${i.address}:${PORT}`)
  })
  console.log()
})
