// plugins/agent-cockpit-channel/index.ts
import { loadConfig } from './config.js'

const config = loadConfig()

console.log('Agent Cockpit Channel Plugin starting...')
console.log(`Connecting to: ${config.agent_cockpit_url}`)
console.log(`Poll interval: ${config.poll_interval_seconds}s`)

// Channel protocol: Claude Code will invoke this as an MCP server
// For now, just start polling loop

let sessionActive = true

async function pollTasks() {
  while (sessionActive) {
    try {
      const response = await fetch(`${config.agent_cockpit_url}/api/channel/tasks/pending`, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(
            `${config.cockpit_user}:${config.cockpit_password}`
          ).toString('base64')
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.tasks && data.tasks.length > 0) {
          console.log(`Received ${data.tasks.length} pending tasks`)
          // Tasks will be processed through channel protocol
          // Claude Code will receive them as <channel> events
        }
      }
    } catch (error) {
      console.error('Failed to poll tasks:', error)
    }

    await new Promise(resolve => setTimeout(resolve, config.poll_interval_seconds * 1000))
  }
}

// Start polling
pollTasks()

// Handle shutdown
process.on('SIGINT', () => {
  sessionActive = false
  process.exit(0)
})
