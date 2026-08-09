#!/usr/bin/env -S npx tsx
/**
 * Cockpit Relay - wraps any command in a PTY and streams I/O to the cockpit server.
 *
 * Usage:
 *   npx agent-cockpit relay claude --dangerously-skip-permissions
 *   npx agent-cockpit relay claude --model opus -p "fix the bug"
 *
 * All arguments after "relay" are passed through to the command unchanged.
 *
 * Environment:
 *   COCKPIT_URL   - Server URL (default: https://agent-cockpit-production.up.railway.app)
 *   RELAY_SECRET  - Shared secret for the WS upgrade; must match the server's RELAY_SECRET
 *   COCKPIT_SESSION_ID - Override session ID (default: auto-generated)
 */
import * as pty from 'node-pty'
import { WebSocket } from 'ws'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

// --- Config ---
const COCKPIT_URL = process.env.COCKPIT_URL || 'https://agent-cockpit-production.up.railway.app'
const RELAY_SECRET = process.env.RELAY_SECRET || ''
const SESSION_ID = process.env.COCKPIT_SESSION_ID || `relay-${crypto.randomUUID().slice(0, 8)}`
const CWD = process.cwd()
const PROJECT_NAME = path.basename(CWD)

// --- Parse args ---
const rawArgs = process.argv.slice(2)

// Shortcut: --auto adds --dangerously-skip-permissions
const hasAuto = rawArgs.includes('--auto')
const args = rawArgs.filter((a) => a !== '--auto')

if (args.length === 0) {
  console.error(`Usage: cockpit-relay <command> [args...]

Options:
  --auto    Shortcut for --dangerously-skip-permissions

Examples:
  cockpit-relay claude                  Interactive session
  cockpit-relay claude --auto           Auto-approve all permissions
  cockpit-relay claude -r --auto        Resume last session with auto permissions
  cockpit-relay claude -p "fix it"      One-shot prompt
  cockpit-relay claude -r <session-id>  Resume specific session

Environment:
  COCKPIT_URL          Server URL (default: ${COCKPIT_URL})
  RELAY_SECRET         Shared secret; must match the server's RELAY_SECRET
  COCKPIT_SESSION_ID   Override session ID (default: auto-generated)`)
  process.exit(1)
}

const command = args[0]
const commandArgs = hasAuto ? [...args.slice(1), '--dangerously-skip-permissions'] : args.slice(1)

// --- Register session with cockpit ---
async function registerSession(): Promise<void> {
  try {
    const url = `${COCKPIT_URL}/api/hooks/session-start`
    const res = await fetch(url, {
      method: 'POST',
      // /api/hooks/* is public - the Basic header this used to send matched no scheme the
      // server accepts and was inert either way.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: SESSION_ID,
        name: PROJECT_NAME,
        cwd: CWD,
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.error(`[relay] Warning: failed to register session (HTTP ${res.status})`)
    }
  } catch (e) {
    console.error(`[relay] Warning: could not reach cockpit server: ${(e as Error).message}`)
  }
}

async function endSession(): Promise<void> {
  try {
    await fetch(`${COCKPIT_URL}/api/hooks/session-end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: SESSION_ID }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // best effort
  }
}

// --- Mutable WS reference for relay ---
let activeWs: WebSocket | null = null

function connectRelay(ptyProcess: pty.IPty): void {
  const wsProto = COCKPIT_URL.startsWith('https') ? 'wss' : 'ws'
  const wsHost = COCKPIT_URL.replace(/^https?:\/\//, '')
  const wsUrl = `${wsProto}://${wsHost}/ws/relay/${encodeURIComponent(SESSION_ID)}`

  // Bearer, not Basic: localAuthWsAuth accepts only `Bearer <RELAY_SECRET>`, a session cookie,
  // or SKIP_AUTH. A Basic header matched none, so the relay 401'd against any deployed cockpit
  // (SKIP_AUTH is refused under NODE_ENV=production) and only ever worked locally.
  if (!RELAY_SECRET) {
    // Say it up front. The 401 arrives as a bare close event, which is how a scheme mismatch
    // went unnoticed until an audit - the relay looks like it started fine either way.
    console.error(
      '[relay] Warning: RELAY_SECRET is unset. The cockpit will reject this connection unless it runs with SKIP_AUTH=true.'
    )
  }
  const ws = new WebSocket(wsUrl, {
    headers: { Authorization: `Bearer ${RELAY_SECRET}` },
  })

  ws.on('open', () => {
    activeWs = ws
    console.error(`[relay] Connected to cockpit (session: ${SESSION_ID})`)
    ws.send(JSON.stringify({
      type: 'resize',
      cols: ptyProcess.cols,
      rows: ptyProcess.rows,
    }))
  })

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'input') {
        ptyProcess.write(msg.data)
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        ptyProcess.resize(msg.cols, msg.rows)
      }
    } catch {
      // ignore malformed messages
    }
  })

  ws.on('close', () => {
    activeWs = null
    console.error('[relay] Disconnected from cockpit, reconnecting in 3s...')
    setTimeout(() => connectRelay(ptyProcess), 3000)
  })

  ws.on('error', (err) => {
    console.error(`[relay] WebSocket error: ${err.message}`)
  })
}

// --- Main ---
async function main() {
  await registerSession()

  // Spawn command in PTY
  const cols = process.stdout.columns || 80
  const rows = process.stdout.rows || 24

  const ptyProcess = pty.spawn(command, commandArgs, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: CWD,
    env: { ...process.env } as Record<string, string>,
  })

  console.error(`[relay] Started: ${command} ${commandArgs.join(' ')}`)
  console.error(`[relay] Session ID: ${SESSION_ID}`)
  console.error(`[relay] Cockpit: ${COCKPIT_URL}`)
  console.error('')

  // Connect relay WS
  connectRelay(ptyProcess)

  // PTY output → local stdout + relay WS
  ptyProcess.onData((data) => {
    process.stdout.write(data)
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(JSON.stringify({ type: 'output', data }))
    }
  })

  // Local stdin → PTY
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
  process.stdin.resume()
  process.stdin.on('data', (data) => {
    ptyProcess.write(data.toString())
  })

  // Handle terminal resize
  process.stdout.on('resize', () => {
    const newCols = process.stdout.columns || 80
    const newRows = process.stdout.rows || 24
    ptyProcess.resize(newCols, newRows)
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(JSON.stringify({ type: 'resize', cols: newCols, rows: newRows }))
    }
  })

  // PTY exit → cleanup
  ptyProcess.onExit(async ({ exitCode }) => {
    console.error(`\n[relay] Process exited with code ${exitCode}`)
    await endSession()
    activeWs?.close()
    process.exit(exitCode)
  })

  // Graceful shutdown
  const cleanup = async () => {
    ptyProcess.kill()
    await endSession()
    activeWs?.close()
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

main().catch((err) => {
  console.error(`[relay] Fatal: ${err.message}`)
  process.exit(1)
})
