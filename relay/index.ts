#!/usr/bin/env tsx
/**
 * Cockpit Relay — wraps any command in a PTY and streams I/O to the cockpit server.
 *
 * Usage:
 *   npx agent-cockpit relay claude --dangerously-skip-permissions
 *   npx agent-cockpit relay claude --model opus -p "fix the bug"
 *
 * All arguments after "relay" are passed through to the command unchanged.
 *
 * Environment:
 *   COCKPIT_URL   — Server URL (default: https://agent-cockpit-production.up.railway.app)
 *   COCKPIT_AUTH  — Basic auth user:pass (default: admin:spartan2026)
 *   COCKPIT_SESSION_ID — Override session ID (default: auto-generated)
 */
import * as pty from 'node-pty'
import { WebSocket } from 'ws'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

// --- Config ---
const COCKPIT_URL = process.env.COCKPIT_URL || 'https://agent-cockpit-production.up.railway.app'
const COCKPIT_AUTH = process.env.COCKPIT_AUTH || 'admin:spartan2026'
const SESSION_ID = process.env.COCKPIT_SESSION_ID || `relay-${crypto.randomUUID().slice(0, 8)}`
const CWD = process.cwd()
const PROJECT_NAME = path.basename(CWD)

// --- Parse args ---
const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: cockpit-relay <command> [args...]')
  console.error('Example: cockpit-relay claude --dangerously-skip-permissions')
  process.exit(1)
}

const command = args[0]
const commandArgs = args.slice(1)

// --- Register session with cockpit ---
async function registerSession(): Promise<void> {
  try {
    const url = `${COCKPIT_URL}/api/hooks/session-start`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(COCKPIT_AUTH).toString('base64')}`,
      },
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(COCKPIT_AUTH).toString('base64')}`,
      },
      body: JSON.stringify({ session_id: SESSION_ID }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // best effort
  }
}

// --- Connect relay WebSocket ---
function connectRelay(ptyProcess: pty.IPty): WebSocket {
  const wsProto = COCKPIT_URL.startsWith('https') ? 'wss' : 'ws'
  const wsHost = COCKPIT_URL.replace(/^https?:\/\//, '')
  const wsUrl = `${wsProto}://${wsHost}/ws/relay/${encodeURIComponent(SESSION_ID)}`

  const authHeader = `Basic ${Buffer.from(COCKPIT_AUTH).toString('base64')}`
  const ws = new WebSocket(wsUrl, { headers: { Authorization: authHeader } })

  ws.on('open', () => {
    console.error(`[relay] Connected to cockpit (session: ${SESSION_ID})`)
    // Send initial terminal size
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
    console.error('[relay] Disconnected from cockpit, reconnecting in 3s...')
    setTimeout(() => {
      const newWs = connectRelay(ptyProcess)
      // Re-pipe PTY output to new WS
      ptyProcess.onData((data) => {
        if (newWs.readyState === WebSocket.OPEN) {
          newWs.send(JSON.stringify({ type: 'output', data }))
        }
      })
    }, 3000)
  })

  ws.on('error', (err) => {
    console.error(`[relay] WebSocket error: ${err.message}`)
  })

  return ws
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
  const ws = connectRelay(ptyProcess)

  // PTY output → local stdout + relay WS
  ptyProcess.onData((data) => {
    process.stdout.write(data)
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data }))
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
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: newCols, rows: newRows }))
    }
  })

  // PTY exit → cleanup
  ptyProcess.onExit(async ({ exitCode }) => {
    console.error(`\n[relay] Process exited with code ${exitCode}`)
    await endSession()
    ws.close()
    process.exit(exitCode)
  })

  // Graceful shutdown
  const cleanup = async () => {
    ptyProcess.kill()
    await endSession()
    ws.close()
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

main().catch((err) => {
  console.error(`[relay] Fatal: ${err.message}`)
  process.exit(1)
})
