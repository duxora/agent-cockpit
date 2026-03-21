// plugins/agent-cockpit-channel/tools.ts
import { AgentCockpitClient } from './client.js'

export interface ToolDefinition {
  description: string
  inputSchema: {
    type: string
    properties: Record<string, any>
    required: string[]
  }
  handler: (params: any) => Promise<any>
}

export interface ChannelTools {
  query_task: ToolDefinition
  suggest_action: ToolDefinition
  trigger_task: ToolDefinition
}

export function createChannelTools(client: AgentCockpitClient): ChannelTools {
  return {
    query_task: {
      description: 'Query the result and status of a task',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'UUID of the task'
          }
        },
        required: ['task_id']
      },
      handler: async (params: { task_id: string }) => {
        try {
          // In real implementation, would query task status from database
          return {
            task_id: params.task_id,
            message: 'Query task tool available - use for status checks'
          }
        } catch (error) {
          throw new Error(`Failed to query task: ${(error as Error).message}`)
        }
      }
    },

    suggest_action: {
      description: 'Suggest next steps for a task and await user approval',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'UUID of the task'
          },
          suggestion: {
            type: 'string',
            description: 'The suggested action or next step'
          }
        },
        required: ['task_id', 'suggestion']
      },
      handler: async (params: { task_id: string; suggestion: string }) => {
        try {
          return {
            task_id: params.task_id,
            acknowledged: true,
            message: `Suggestion recorded: ${params.suggestion}`
          }
        } catch (error) {
          throw new Error(`Failed to log suggestion: ${(error as Error).message}`)
        }
      }
    },

    trigger_task: {
      description: 'Trigger a new task (requires automation rule)',
      inputSchema: {
        type: 'object',
        properties: {
          task_type: {
            type: 'string',
            description: 'Type of task to trigger'
          },
          title: {
            type: 'string',
            description: 'Task title'
          },
          input_payload: {
            type: 'object',
            description: 'Input data for the task (optional)'
          }
        },
        required: ['task_type', 'title']
      },
      handler: async (params: {
        task_type: string
        title: string
        input_payload?: Record<string, unknown>
      }) => {
        try {
          return {
            message: 'Task trigger requires automation rule approval',
            task_type: params.task_type,
            title: params.title
          }
        } catch (error) {
          throw new Error(`Failed to trigger task: ${(error as Error).message}`)
        }
      }
    }
  }
}
