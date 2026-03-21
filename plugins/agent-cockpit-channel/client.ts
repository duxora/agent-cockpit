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
}
