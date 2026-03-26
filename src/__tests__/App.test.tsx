import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import App from '../App'

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    // Mock WebSocket as a class
    class MockWebSocket {
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
      send = vi.fn()
      close = vi.fn()
    }
    global.WebSocket = MockWebSocket as any
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should render dashboard directly (no auth check needed)', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/sessions') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
        } as any)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as any)
    }) as any

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Agent Cockpit')).toBeInTheDocument()
    })
  })

  it('should fetch sessions on mount', async () => {
    global.fetch = vi.fn((url) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      } as any)
    }) as any

    render(<App />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/sessions')
    })
  })
})
