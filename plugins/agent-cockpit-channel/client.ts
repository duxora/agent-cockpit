// plugins/agent-cockpit-channel/client.ts
import { ChannelConfig } from './config.js'

export class AgentCockpitClient {
  constructor(private config: ChannelConfig) {}

  private getAuthHeader() {
    return 'Basic ' + Buffer.from(
      `${this.config.cockpit_user}:${this.config.cockpit_password}`
    ).toString('base64')
  }

  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 10000) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeout)
      return response
    } catch (error) {
      clearTimeout(timeout)
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`)
      }
      throw error
    }
  }

  async getPendingTasks() {
    const response = await this.fetchWithTimeout(
      `${this.config.agent_cockpit_url}/api/channel/tasks/pending`,
      {
        headers: { 'Authorization': this.getAuthHeader() }
      }
    )
    if (!response.ok) {
      throw new Error(`Failed to get pending tasks: ${response.status} ${response.statusText}`)
    }
    try {
      return await response.json()
    } catch (error) {
      throw new Error(`Failed to parse pending tasks response: ${(error as Error).message}`)
    }
  }

  async submitTaskResult(taskId: string, result: {
    status: 'completed' | 'failed'
    output_payload: Record<string, any>
    error_message?: string
    duration_ms?: number
  }) {
    const response = await this.fetchWithTimeout(
      `${this.config.agent_cockpit_url}/api/channel/tasks/${taskId}/result`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.getAuthHeader()
        },
        body: JSON.stringify(result)
      }
    )
    if (!response.ok) {
      throw new Error(`Failed to submit task result: ${response.status} ${response.statusText}`)
    }
    try {
      return await response.json()
    } catch (error) {
      throw new Error(`Failed to parse submit result response: ${(error as Error).message}`)
    }
  }

  async getSyncStatus() {
    const response = await this.fetchWithTimeout(
      `${this.config.agent_cockpit_url}/api/channel/sync/status`,
      {
        headers: { 'Authorization': this.getAuthHeader() }
      }
    )
    if (!response.ok) {
      throw new Error(`Failed to get sync status: ${response.status} ${response.statusText}`)
    }
    try {
      return await response.json()
    } catch (error) {
      throw new Error(`Failed to parse sync status response: ${(error as Error).message}`)
    }
  }

  async registerSession(sessionId: string, name: string, cwd: string) {
    const response = await this.fetchWithTimeout(
      `${this.config.agent_cockpit_url}/api/hooks/session-start`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.getAuthHeader(),
        },
        body: JSON.stringify({ session_id: sessionId, name, cwd }),
      },
      5000
    )
    if (!response.ok) {
      throw new Error(`session-start failed: ${response.status}`)
    }
    return response.json()
  }

  async sendHeartbeat(sessionId: string, status: 'active' | 'waiting' = 'active') {
    const response = await this.fetchWithTimeout(
      `${this.config.agent_cockpit_url}/api/hooks/heartbeat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.getAuthHeader(),
        },
        body: JSON.stringify({ session_id: sessionId, status }),
      },
      5000
    )
    if (!response.ok) {
      throw new Error(`heartbeat failed: ${response.status}`)
    }
    return response.json()
  }

  async endSession(sessionId: string) {
    const response = await this.fetchWithTimeout(
      `${this.config.agent_cockpit_url}/api/hooks/session-end`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.getAuthHeader(),
        },
        body: JSON.stringify({ session_id: sessionId }),
      },
      3000
    )
    if (!response.ok) {
      throw new Error(`session-end failed: ${response.status}`)
    }
    return response.json()
  }
}
