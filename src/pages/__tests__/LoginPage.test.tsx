import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import LoginPage from '../LoginPage'

const renderLoginPage = () => render(<LoginPage />)

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should render Agent Cockpit header', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
      } as any)
    ) as any

    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByText('Agent Cockpit')).toBeInTheDocument()
    })
  })

  it('should render Sign in with Google button', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
      } as any)
    ) as any

    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
    })
  })

  it('should show authorization message', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
      } as any)
    ) as any

    renderLoginPage()

    await waitFor(() => {
      expect(
        screen.getByText(/Only your registered email address can access this application/i)
      ).toBeInTheDocument()
    })
  })

  it('should redirect to /api/auth/google when button is clicked', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
      } as any)
    ) as any

    delete (window as any).location
    window.location = { href: '' } as any

    renderLoginPage()

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /sign in with google/i })
      expect(button).toBeInTheDocument()
    })

    const button = screen.getByRole('button', { name: /sign in with google/i })
    fireEvent.click(button)

    expect(window.location.href).toBe('/api/auth/google')
  })


  it('should handle auth check errors gracefully', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as any

    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
    })
  })
})
