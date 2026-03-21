import express from 'express'
import { createServer } from 'http'
import { execSync } from 'child_process'
import os from 'os'
import { WebSocketServer, WebSocket } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  listSessions,
  getSessionContent,
  createSession,
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
} from './db.js'
import { initRailway, fetchDeployments, fetchMetrics, fetchEnvironmentVariables } from './railway.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const server = createServer(app)
const PORT = parseInt(process.env.PORT || '4200')

initRailway()

app.use(express.json())

// Basic auth (enabled when COCKPIT_PASSWORD is set)
const COCKPIT_USER = process.env.COCKPIT_USER || 'admin'
const COCKPIT_PASSWORD = process.env.COCKPIT_PASSWORD

if (COCKPIT_PASSWORD) {
  app.use((req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/api/hooks/')) return next()

    const auth = req.headers.authorization
    if (!auth || !auth.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Agent Cockpit"')
      res.status(401).send('Authentication required')
      return
    }
    const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':')
    if (user === COCKPIT_USER && pass === COCKPIT_PASSWORD) {
      return next()
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Agent Cockpit"')
    res.status(401).send('Invalid credentials')
  })

  console.log('  Auth: Basic auth enabled')
}

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
  const ok = createSession(name, command, cwd)
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
  // Check auth
  const auth = req.headers.authorization?.split(' ')[1]
  const credentials = Buffer.from(auth || '', 'base64').toString()
  const [user, pass] = credentials.split(':')

  if (user !== COCKPIT_USER || pass !== COCKPIT_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

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
  const auth = req.headers.authorization?.split(' ')[1]
  const credentials = Buffer.from(auth || '', 'base64').toString()
  const [user, pass] = credentials.split(':')

  if (user !== COCKPIT_USER || pass !== COCKPIT_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const metrics = await fetchMetrics(SERVICE_ID)
  if (Object.keys(metrics).length > 0) {
    logMetric(SERVICE_ID, metrics.cpuPercent, metrics.memoryMb, metrics.uptimeSeconds)
  }

  const history = getMetrics(SERVICE_ID, 24, 100)
  res.json(history)
})

app.get('/api/admin/railway/variables', async (req, res) => {
  const auth = req.headers.authorization?.split(' ')[1]
  const credentials = Buffer.from(auth || '', 'base64').toString()
  const [user, pass] = credentials.split(':')

  if (user !== COCKPIT_USER || pass !== COCKPIT_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const vars = await fetchEnvironmentVariables(SERVICE_ID)
  res.json(vars)
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
  endManagedSession(session_id)
  logEvent(eventName, 'ended')
  broadcastSessions()
  res.json({ ok: true })
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
  // Check basic auth on WebSocket upgrade if enabled
  if (COCKPIT_PASSWORD) {
    const auth = request.headers.authorization
    if (!auth || !auth.startsWith('Basic ')) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':')
    if (user !== COCKPIT_USER || pass !== COCKPIT_PASSWORD) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
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
