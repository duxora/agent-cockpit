// plugins/agent-cockpit-channel/client.ts
import { ChannelConfig } from './config.js'

export class AgentCockpitClient {
  constructor(private config: ChannelConfig) {}

  private getAuthHeader() {
    return 'Basic ' + Buffer.from(
      `${this.config.cockpit_user}:${this.config.cockpit_password}`
    ).toString('base64')
  }

  async getPendingTasks() {
    const response = await fetch(
      `${this.config.agent_cockpit_url}/api/channel/tasks/pending`,
      {
        headers: { 'Authorization': this.getAuthHeader() }
      }
    )
    if (!response.ok) {
      throw new Error(`Failed to get pending tasks: ${response.status} ${response.statusText}`)
    }
    return response.json()
  }

  async submitTaskResult(taskId: string, result: {
    status: 'completed' | 'failed'
    output_payload: Record<string, any>
    error_message?: string
    duration_ms?: number
  }) {
    const response = await fetch(
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
    return response.json()
  }

  async getSyncStatus() {
    const response = await fetch(
      `${this.config.agent_cockpit_url}/api/channel/sync/status`,
      {
        headers: { 'Authorization': this.getAuthHeader() }
      }
    )
    if (!response.ok) {
      throw new Error(`Failed to get sync status: ${response.status} ${response.statusText}`)
    }
    return response.json()
  }
}
