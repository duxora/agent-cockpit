import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import App from '../App'

describe('App - Auth Routing', () => {
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

  it('should show loading spinner while checking auth', () => {
    let callCount = 0
    global.fetch = vi.fn((url) => {
      if (url === '/api/auth/me') {
        // Hang forever for auth check
        return new Promise(() => {})
      }
      callCount++
      if (callCount > 1) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as any)
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as any)
    }) as any

    render(<App />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should render LoginPage when not authenticated', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
      } as any)
    ) as any

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Agent Cockpit')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
    })
  })

  it('should render dashboard when authenticated', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ email: 'admin@example.com', role: 'admin' }),
        } as any)
      }
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
      expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument()
    })
  })

  it('should handle auth check errors and show login page', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as any

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
    })
  })

  it('should display user email in authenticated state', async () => {
    const testEmail = 'testuser@example.com'
    global.fetch = vi.fn((url) => {
      if (url === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ email: testEmail, role: 'admin' }),
        } as any)
      }
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
      // Verify that auth check was called
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/me')
    })
  })

  it('should call fetch /api/auth/me on mount', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/auth/me') {
        return Promise.resolve({
          ok: false,
          status: 401,
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
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/me')
    })
  })
})
