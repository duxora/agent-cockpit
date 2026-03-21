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

const parsePositiveInt = (val: string | undefined, def: number): number => {
  if (!val) return def
  const num = parseInt(val, 10)
  if (isNaN(num) || num <= 0) throw new Error(`Invalid config: expected positive integer, got "${val}"`)
  return num
}

export function loadConfig(): ChannelConfig {
  const envPath = join(homedir(), '.claude', 'channels', 'agent-cockpit', '.env')

  try {
    const content = readFileSync(envPath, 'utf-8')
    const env: Record<string, string> = {}

    content.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const [key, rawValue] = trimmed.split('=', 2)
      if (!key || !rawValue) return
      let value = rawValue.trim()
      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      env[key.trim()] = value
    })

    return {
      agent_cockpit_url: env.AGENT_COCKPIT_URL || 'http://localhost:4200',
      agent_cockpit_token: env.AGENT_COCKPIT_TOKEN || '',
      cockpit_user: env.COCKPIT_USER || 'admin',
      cockpit_password: env.COCKPIT_PASSWORD || 'changeme',
      poll_interval_seconds: parsePositiveInt(env.POLL_INTERVAL_SECONDS, 30),
      max_tasks_per_poll: parsePositiveInt(env.MAX_TASKS_PER_POLL, 10)
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      console.log(`No config found at ${envPath}`)
      console.log(`To configure: mkdir -p ~/.claude/channels/agent-cockpit && cp .env.example ~/.claude/channels/agent-cockpit/.env`)
    } else {
      console.error(`Fatal: Cannot load .env from ${envPath}:`, err.message)
      throw error
    }

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
