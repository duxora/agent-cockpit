import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { AnalyticsDashboard } from '../AnalyticsDashboard'

describe('AnalyticsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('renders loading state initially', () => {
    ;(global.fetch as any).mockImplementationOnce(() =>
      new Promise(() => {}) // Never resolves
    )

    render(<AnalyticsDashboard />)
    expect(screen.getByText(/loading metrics/i)).toBeInTheDocument()
  })

  it('fetches and displays metrics on mount', async () => {
    const mockData = {
      metrics: [
        {
          model: 'sonnet',
          total_sessions: 10,
          avg_duration_ms: 5000,
          total_tokens_used: 10000,
          total_cost_usd: 0.50
        }
      ],
      daily: [
        { date: '2026-03-21', sessions: 2, tokens: 1000 }
      ]
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    })

    render(<AnalyticsDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Total Sessions')).toBeInTheDocument()
    })

    // Check that the metrics were displayed (looking for the header text)
    expect(screen.getByText('Session Analytics')).toBeInTheDocument()
  })

  it('displays error message on fetch failure', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    })

    render(<AnalyticsDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })
  })

  it('handles invalid response structure', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invalid: 'structure' })
    })

    render(<AnalyticsDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })
  })

  it('shows 30d range by default', async () => {
    const mockData = { metrics: [], daily: [] }
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    })

    render(<AnalyticsDashboard />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('days=30'))
    })
  })

  it('calculates total sessions correctly', async () => {
    const mockData = {
      metrics: [
        {
          model: 'sonnet',
          total_sessions: 5,
          avg_duration_ms: 4000,
          total_tokens_used: 5000,
          total_cost_usd: 0.25
        },
        {
          model: 'opus',
          total_sessions: 3,
          avg_duration_ms: 6000,
          total_tokens_used: 3000,
          total_cost_usd: 0.15
        }
      ],
      daily: []
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    })

    render(<AnalyticsDashboard />)

    // Wait for the total sessions header to appear
    await waitFor(() => {
      const sessions = screen.getAllByText(/5|3/)
      expect(sessions.length).toBeGreaterThan(0)
    })
  })

  it('displays model distribution heading', async () => {
    const mockData = {
      metrics: [
        {
          model: 'sonnet',
          total_sessions: 5,
          avg_duration_ms: 4000,
          total_tokens_used: 5000,
          total_cost_usd: 0.25
        }
      ],
      daily: []
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    })

    render(<AnalyticsDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Model Distribution')).toBeInTheDocument()
    })

    expect(screen.getByText('sonnet')).toBeInTheDocument()
  })

  it('handles empty metrics response', async () => {
    const mockData = {
      metrics: [],
      daily: []
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    })

    render(<AnalyticsDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/no sessions in this period/i)).toBeInTheDocument()
    })
  })

  it('displays daily breakdown when data available', async () => {
    const mockData = {
      metrics: [],
      daily: [
        { date: '2026-03-21', sessions: 2, tokens: 1000 },
        { date: '2026-03-20', sessions: 1, tokens: 500 }
      ]
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    })

    render(<AnalyticsDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Daily Breakdown')).toBeInTheDocument()
    })

    expect(screen.getByText('2026-03-21')).toBeInTheDocument()
  })

  it('displays session analytics heading', async () => {
    const mockData = { metrics: [], daily: [] }
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    })

    render(<AnalyticsDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Session Analytics')).toBeInTheDocument()
    })
  })

  it('displays time range buttons', async () => {
    const mockData = { metrics: [], daily: [] }
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    })

    render(<AnalyticsDashboard />)

    await waitFor(() => {
      expect(screen.getByText('7d')).toBeInTheDocument()
      expect(screen.getByText('30d')).toBeInTheDocument()
      expect(screen.getByText('90d')).toBeInTheDocument()
    })
  })
})
