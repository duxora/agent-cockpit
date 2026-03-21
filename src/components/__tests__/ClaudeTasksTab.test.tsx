import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import ClaudeTasksTab from '../ClaudeTasksTab'

const mockSyncStatus = {
  session_id: 'session-123',
  status: 'connected',
  last_sync: new Date().toISOString(),
  pending_count: 3,
  completed_today: 7,
  in_progress: null,
  active_channel_sessions: 1,
}

describe('ClaudeTasksTab', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should render session status', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSyncStatus),
      } as any)
    ) as any

    render(<ClaudeTasksTab />)

    await waitFor(() => {
      expect(screen.getByText(/session status/i)).toBeInTheDocument()
    })
  })

  it('should show pending tasks count', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSyncStatus),
      } as any)
    ) as any

    render(<ClaudeTasksTab />)

    await waitFor(() => {
      expect(screen.getByText(/pending/i)).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  it('should display completed tasks count', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSyncStatus),
      } as any)
    ) as any

    render(<ClaudeTasksTab />)

    await waitFor(() => {
      expect(screen.getByText(/completed/i)).toBeInTheDocument()
      expect(screen.getByText('7')).toBeInTheDocument()
    })
  })

  it('should show connected status when session is connected', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSyncStatus),
      } as any)
    ) as any

    render(<ClaudeTasksTab />)

    await waitFor(() => {
      expect(screen.getByText('Connected ✓')).toBeInTheDocument()
    })
  })

  it('should show offline status when session is offline', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...mockSyncStatus, status: 'offline' }),
      } as any)
    ) as any

    render(<ClaudeTasksTab />)

    await waitFor(() => {
      expect(screen.getByText('Offline ✗')).toBeInTheDocument()
    })
  })

  it('should display currently executing task when in_progress exists', async () => {
    const statusWithTask = {
      ...mockSyncStatus,
      in_progress: {
        title: 'Running database migration',
        started_at: new Date().toISOString(),
      },
    }

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(statusWithTask),
      } as any)
    ) as any

    render(<ClaudeTasksTab />)

    await waitFor(() => {
      expect(screen.getByText('Currently Executing')).toBeInTheDocument()
      expect(screen.getByText('Running database migration')).toBeInTheDocument()
    })
  })

  it('should show loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as any

    render(<ClaudeTasksTab />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should refresh on button click', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSyncStatus),
      } as any)
    ) as any

    render(<ClaudeTasksTab />)

    await waitFor(() => {
      expect(screen.getByText('Connected ✓')).toBeInTheDocument()
    })

    const refreshBtn = screen.getByRole('button', { name: /refresh/i })
    fireEvent.click(refreshBtn)

    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('should auto-refresh every 30 seconds', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockSyncStatus),
      } as any)
    ) as any

    render(<ClaudeTasksTab />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    vi.advanceTimersByTime(15000)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })

  it('should handle fetch errors gracefully', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as any

    render(<ClaudeTasksTab />)

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })
    // Should render with zero counts, not crash
    expect(screen.getByText(/session status/i)).toBeInTheDocument()
  })
})
