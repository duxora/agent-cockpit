import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import AdminPanel from '../AdminPanel'

// Mock child components to avoid test setup issues
vi.mock('../RailwayStatus', () => ({
  default: () => <div>Mocked RailwayStatus</div>,
}))
vi.mock('../MetricsCard', () => ({
  default: () => <div>Mocked MetricsCard</div>,
}))
vi.mock('../VariablesManager', () => ({
  default: () => <div>Mocked VariablesManager</div>,
}))
vi.mock('../AnalyticsDashboard', () => ({
  AnalyticsDashboard: () => <div>Mocked AnalyticsDashboard</div>,
}))
vi.mock('../HooksManager', () => ({
  HooksManager: () => <div>Mocked HooksManager</div>,
}))

vi.mock('../GitHubStatus', () => ({
  GitHubStatus: () => <div>Mocked GitHubStatus</div>,
}))
vi.mock('../ClaudeTasksTab', () => ({
  default: () => <div>Mocked ClaudeTasksTab</div>,
}))

describe('AdminPanel - Logout Button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
    delete (window as any).location
    window.location = { href: '' } as any
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should render logout button in header', () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as any)
    ) as any

    render(<AdminPanel />)

    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument()
  })

  it('should call logout endpoint when logout button is clicked', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as any)
    ) as any

    render(<AdminPanel />)

    const logoutButton = screen.getByRole('button', { name: /logout/i })
    fireEvent.click(logoutButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    })
  })

  it('should redirect to /login after logout', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as any)
    ) as any

    render(<AdminPanel />)

    const logoutButton = screen.getByRole('button', { name: /logout/i })
    fireEvent.click(logoutButton)

    await waitFor(() => {
      expect(window.location.href).toBe('/login')
    })
  })

  it('should redirect even if logout endpoint fails', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as any

    render(<AdminPanel />)

    const logoutButton = screen.getByRole('button', { name: /logout/i })
    fireEvent.click(logoutButton)

    await waitFor(() => {
      expect(window.location.href).toBe('/login')
    })
  })

  it('should have red styling for logout button', () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as any)
    ) as any

    render(<AdminPanel />)

    const logoutButton = screen.getByRole('button', { name: /logout/i })
    expect(logoutButton).toHaveClass('bg-red-600')
    expect(logoutButton).toHaveClass('hover:bg-red-700')
  })

  it('should render Administration heading', () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as any)
    ) as any

    render(<AdminPanel />)

    expect(screen.getByText('Administration')).toBeInTheDocument()
  })
})
