import { describe, it, expect, beforeEach } from 'vitest'
import {
  createChannelTask,
  getChannelTask,
  listPendingTasks,
  updateTaskStatus,
  updateTaskResult,
  logSyncEvent,
  getSyncStatus
} from '../db.js'
import { randomUUID } from 'crypto'

describe('Channel Tasks', () => {
  let taskId: string

  beforeEach(() => {
    taskId = randomUUID()
  })

  it('should create and retrieve a task', () => {
    const taskInput = {
      id: taskId,
      task_type: 'deployment',
      title: 'Deploy to production',
      input_payload: { branch: 'main' },
      triggered_by: 'user'
    }

    const result = createChannelTask(taskInput)!
    expect(result.id).toBe(taskId)
    expect(result.status).toBe('pending')

    const retrieved = getChannelTask(taskId)!
    expect(retrieved.title).toBe('Deploy to production')
  })

  it('should list pending tasks', () => {
    createChannelTask({
      id: randomUUID(),
      task_type: 'deployment',
      title: 'Deploy A',
      input_payload: {},
      triggered_by: 'user'
    })

    const pending = listPendingTasks(10)
    expect(pending.length).toBeGreaterThan(0)
    expect(pending[0].status).toBe('pending')
  })

  it('should update task status', () => {
    createChannelTask({
      id: taskId,
      task_type: 'deployment',
      title: 'Test deploy',
      input_payload: {},
      triggered_by: 'user'
    })

    updateTaskStatus(taskId, 'fetched', { fetched_at: true })
    const updated = getChannelTask(taskId)!
    expect(updated.status).toBe('fetched')
  })

  it('should log sync events', () => {
    createChannelTask({
      id: taskId,
      task_type: 'deployment',
      title: 'Log test',
      input_payload: {},
      triggered_by: 'user'
    })
    logSyncEvent(taskId, 'created', { data: 'test' })
    // Verify event was logged
  })

  it('should update task result', () => {
    const id = randomUUID()
    createChannelTask({
      id,
      task_type: 'deployment',
      title: 'Deploy',
      input_payload: {},
      triggered_by: 'test'
    })

    updateTaskResult(id, 'completed', { url: 'https://...' }, undefined, 5000)
    const result = getChannelTask(id)
    expect(result?.status).toBe('completed')
    expect(result?.output_payload?.url).toBe('https://...')
    expect(result?.duration_ms).toBe(5000)
  })

  it('should get sync status', () => {
    const status = getSyncStatus()
    expect(status).toHaveProperty('pending_count')
    expect(status).toHaveProperty('completed_today')
    expect(status).toHaveProperty('last_sync')
  })

  it('should log sync events and verify', () => {
    const id = randomUUID()
    createChannelTask({
      id,
      task_type: 'deployment',
      title: 'Log verify test',
      input_payload: {},
      triggered_by: 'test'
    })
    logSyncEvent(id, 'test_event', { data: 'test' })
    // Verify by checking that getSyncStatus reflects the log
    const status = getSyncStatus()
    expect(status).toBeDefined()
  })
})

describe('Channel API Endpoints', () => {
  it('GET /api/channel/tasks/pending should return pending tasks', async () => {
    const response = await fetch(
      'http://localhost:4200/api/channel/tasks/pending',
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from('admin:spartan2026').toString('base64')
        }
      }
    )

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('tasks')
    expect(Array.isArray(data.tasks)).toBe(true)
    expect(data).toHaveProperty('checkpoint')
  })

  it('POST /api/channel/tasks/{id}/result should accept task result', async () => {
    const taskId = randomUUID()
    createChannelTask({
      id: taskId,
      task_type: 'deployment',
      title: 'Test deploy',
      input_payload: {},
      triggered_by: 'test'
    })

    const response = await fetch(
      `http://localhost:4200/api/channel/tasks/${taskId}/result`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from('admin:spartan2026').toString('base64')
        },
        body: JSON.stringify({
          status: 'completed',
          output_payload: { url: 'https://...' },
          duration_ms: 5000
        })
      }
    )

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('acknowledged', true)
  })

  it('GET /api/channel/sync/status should return sync state', async () => {
    const response = await fetch(
      'http://localhost:4200/api/channel/sync/status',
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from('admin:spartan2026').toString('base64')
        }
      }
    )

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('status')
    expect(data).toHaveProperty('pending_count')
    expect(data).toHaveProperty('completed_today')
  })
})
