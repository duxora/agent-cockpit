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
  listManagedSessions, cleanupManagedSessions
} from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const server = createServer(app)
const PORT = parseInt(process.env.PORT || '4200')

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
  const ok = killSession(name)
  if (ok) {
    logEvent(name, 'killed')
    res.json({ ok: true })
  } else {
    res.status(404).json({ error: `Session "${name}" not found` })
  }
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

// --- Hook API (no auth required) ---

app.post('/api/hooks/session-start', (req, res) => {
  const { session_id, name, cwd, metadata } = req.body
  if (!session_id || !name) {
    res.status(400).json({ error: 'session_id and name are required' })
    return
  }
  registerManagedSession(session_id, name, cwd || '~', metadata ? JSON.stringify(metadata) : undefined)
  broadcastSessions()
  res.json({ ok: true })
})

app.post('/api/hooks/heartbeat', (req, res) => {
  const { session_id, status } = req.body
  if (!session_id) {
    res.status(400).json({ error: 'session_id is required' })
    return
  }
  heartbeatManagedSession(session_id, status || 'active')
  broadcastSessions()
  res.json({ ok: true })
})

app.post('/api/hooks/session-end', (req, res) => {
  const { session_id } = req.body
  if (!session_id) {
    res.status(400).json({ error: 'session_id is required' })
    return
  }
  endManagedSession(session_id)
  broadcastSessions()
  res.json({ ok: true })
})

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// --- WebSocket ---

const wss = new WebSocketServer({ noServer: true })

// Broadcast session updates to all connected clients
function broadcastSessions() {
  const all = getMergedSessions()
  const msg = JSON.stringify({ type: 'sessions', data: all })
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
  const sessions = listSessions()
  ws.send(JSON.stringify({ type: 'sessions', data: sessions }))
})

// --- Terminal WebSocket ---

const termWss = new WebSocketServer({ noServer: true })

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
  } else if (url.pathname.startsWith('/ws/terminal/')) {
    termWss.handleUpgrade(request, socket, head, (ws) => {
      termWss.emit('connection', ws, request)
    })
  } else {
    socket.destroy()
  }
})

termWss.on('connection', (ws, request) => {
  const url = new URL(request.url || '', `http://localhost:${PORT}`)
  const sessionName = decodeURIComponent(url.pathname.replace('/ws/terminal/', ''))

  if (!sessionExists(sessionName)) {
    ws.send(JSON.stringify({ type: 'error', message: `Session "${sessionName}" not found` }))
    ws.close()
    return
  }

  // Send initial content
  const content = getSessionContent(sessionName, 500)
  ws.send(JSON.stringify({ type: 'content', data: content }))

  // Poll for new content and send diffs
  let lastContent = content
  const pollInterval = setInterval(() => {
    if (!sessionExists(sessionName)) {
      ws.send(JSON.stringify({ type: 'closed', message: 'Session ended' }))
      ws.close()
      return
    }
    const newContent = getSessionContent(sessionName, 500)
    if (newContent !== lastContent) {
      lastContent = newContent
      ws.send(JSON.stringify({ type: 'content', data: newContent }))
    }
  }, 500)

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'input') {
        sendKeys(sessionName, msg.data)
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        resizeSession(sessionName, msg.cols, msg.rows)
      }
    } catch {
      // Send raw input as keys
      sendKeys(sessionName, data.toString())
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
