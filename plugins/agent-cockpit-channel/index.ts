// plugins/agent-cockpit-channel/index.ts
import { loadConfig } from './config.js'
import { AgentCockpitClient } from './client.js'
import { createChannelTools } from './tools.js'

const config = loadConfig()

const client = new AgentCockpitClient(config)
const tools = createChannelTools(client)

// Export tools for Claude Code MCP interface
export const claudeTools = tools

console.log('Agent Cockpit Channel Plugin ready with tools:', Object.keys(tools).join(', '))
