import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

describe('AdminPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
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

  it('should not render logout button', () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as any)
    ) as any

    render(<AdminPanel />)

    expect(screen.queryByRole('button', { name: /logout/i })).not.toBeInTheDocument()
  })
})
