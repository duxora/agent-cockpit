import { describe, it, expect, beforeEach } from 'vitest'
import {
  createChannelTask,
  getChannelTask,
  listPendingTasks,
  updateTaskStatus,
  logSyncEvent
} from '../db.js'
import { randomUUID } from 'crypto'

describe('Channel Tasks', () => {
  const taskId = randomUUID()

  it('should create and retrieve a task', () => {
    const taskInput = {
      id: taskId,
      task_type: 'deployment',
      title: 'Deploy to production',
      input_payload: { branch: 'main' },
      triggered_by: 'user'
    }

    const result = createChannelTask(taskInput)
    expect(result.id).toBe(taskId)
    expect(result.status).toBe('pending')

    const retrieved = getChannelTask(taskId)
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
    const updated = getChannelTask(taskId)
    expect(updated.status).toBe('fetched')
  })

  it('should log sync events', () => {
    logSyncEvent(taskId, 'created', { data: 'test' })
    // Verify event was logged
  })
})
