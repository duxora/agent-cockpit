import { randomUUID } from 'crypto'
import { cwd } from 'process'
import { loadConfig } from './config.js'
import { AgentCockpitClient } from './client.js'
import { createChannelTools } from './tools.js'

const config = loadConfig()
const client = new AgentCockpitClient(config)
const tools = createChannelTools(client)

// Export tools for Claude Code MCP interface
export const claudeTools = tools

// --- Session lifecycle ---

const SESSION_ID = randomUUID()
const SESSION_NAME = 'claude-code-channel'
const SESSION_CWD = cwd()

let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let sessionEnded = false

async function startSession() {
  try {
    await client.registerSession(SESSION_ID, SESSION_NAME, SESSION_CWD)
    console.log(`[agent-cockpit-channel] Session registered: ${SESSION_ID}`)
  } catch (err) {
    // Non-fatal: cockpit may be offline; plugin still works for tool calls
    console.warn(
      `[agent-cockpit-channel] Could not register session:`,
      (err as Error).message
    )
  }

  heartbeatTimer = setInterval(async () => {
    try {
      await client.sendHeartbeat(SESSION_ID, 'active')
    } catch (err) {
      console.warn(
        `[agent-cockpit-channel] Heartbeat failed:`,
        (err as Error).message
      )
    }
  }, 60_000)
}

async function stopSession() {
  if (sessionEnded) return
  sessionEnded = true

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  try {
    await client.endSession(SESSION_ID)
    console.log(`[agent-cockpit-channel] Session ended: ${SESSION_ID}`)
  } catch (err) {
    console.warn(
      `[agent-cockpit-channel] Could not end session:`,
      (err as Error).message
    )
  }
}

// Shutdown handlers — cover all realistic exit paths
process.on('SIGINT', async () => {
  await stopSession()
  process.exit(0)
})
process.on('SIGTERM', async () => {
  await stopSession()
  process.exit(0)
})
process.on('uncaughtException', async (err) => {
  console.error('[agent-cockpit-channel] Uncaught exception:', err)
  await stopSession()
  process.exit(1)
})
process.on('unhandledRejection', async (reason) => {
  console.error('[agent-cockpit-channel] Unhandled rejection:', reason)
  await stopSession()
  process.exit(1)
})

// Start immediately (top-level await is fine in ESM with Bun)
await startSession()

console.log(
  'Agent Cockpit Channel Plugin ready with tools:',
  Object.keys(tools).join(', ')
)
