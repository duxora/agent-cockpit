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

    // Verify the Total Sessions card shows the correct calculated sum (5 + 3 = 8)
    await waitFor(() => {
      const totalSessionsCard = screen.getByText('Total Sessions')
      expect(totalSessionsCard).toBeInTheDocument()
    })

    // Find the total sessions value (8) in the summary cards
    const sessionCount = screen.getByText('8')
    expect(sessionCount).toBeInTheDocument()

    // Also verify the table shows correct per-model sessions
    expect(screen.getByText('sonnet')).toBeInTheDocument()
    expect(screen.getByText('opus')).toBeInTheDocument()
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

  it('refetches data when time range button clicked', async () => {
    const mockData = { metrics: [], daily: [] }
    ;(global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => mockData })
      .mockResolvedValueOnce({ ok: true, json: async () => mockData })

    render(<AnalyticsDashboard />)

    // Initial fetch should use 30d (default)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('days=30'))
    })

    // Click 7d button to trigger refetch
    const button7d = screen.getByText('7d')
    button7d.click()

    // Should refetch with days=7
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(global.fetch).toHaveBeenLastCalledWith(expect.stringContaining('days=7'))
    })
  })

  it('handles invalid daily field structure', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ metrics: [] }) // Missing 'daily' field
    })

    render(<AnalyticsDashboard />)

    // Component should still load since daily is optional
    await waitFor(() => {
      expect(screen.getByText('Session Analytics')).toBeInTheDocument()
    })

    // Should display the no sessions message since metrics is empty
    expect(screen.getByText(/no sessions in this period/i)).toBeInTheDocument()
  })

  it('throws error when daily field is not an array', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ metrics: [], daily: 'not-an-array' })
    })

    render(<AnalyticsDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/invalid metrics response structure: daily is not an array/i)).toBeInTheDocument()
  })
})
