// plugins/agent-cockpit-channel/config.ts
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface ChannelConfig {
  agent_cockpit_url: string
  agent_cockpit_token: string
  cockpit_user: string
  cockpit_password: string
  poll_interval_seconds: number
  max_tasks_per_poll: number
}

export function loadConfig(): ChannelConfig {
  const envPath = join(homedir(), '.claude', 'channels', 'agent-cockpit', '.env')

  try {
    const content = readFileSync(envPath, 'utf-8')
    const env: Record<string, string> = {}

    content.split('\n').forEach(line => {
      const [key, value] = line.split('=')
      if (key && value) {
        env[key.trim()] = value.trim()
      }
    })

    return {
      agent_cockpit_url: env.AGENT_COCKPIT_URL || 'http://localhost:4200',
      agent_cockpit_token: env.AGENT_COCKPIT_TOKEN || '',
      cockpit_user: env.COCKPIT_USER || 'admin',
      cockpit_password: env.COCKPIT_PASSWORD || 'changeme',
      poll_interval_seconds: parseInt(env.POLL_INTERVAL_SECONDS || '30'),
      max_tasks_per_poll: parseInt(env.MAX_TASKS_PER_POLL || '10')
    }
  } catch (error) {
    console.log('Using default config (no .env found)')
    return {
      agent_cockpit_url: 'http://localhost:4200',
      agent_cockpit_token: '',
      cockpit_user: 'admin',
      cockpit_password: 'changeme',
      poll_interval_seconds: 30,
      max_tasks_per_poll: 10
    }
  }
}
