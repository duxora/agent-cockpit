import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import RailwayStatus from '../RailwayStatus'

describe('RailwayStatus', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('should render deployments list', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: '1',
              railway_deployment_id: 'deploy-1',
              status: 'success',
              created_at: Math.floor(Date.now() / 1000),
              branch: 'main',
            },
          ]),
      } as any)
    ) as any

    render(<RailwayStatus />)

    await waitFor(() => {
      expect(screen.getByText('main')).toBeInTheDocument()
    })
    expect(screen.getByText('success')).toBeInTheDocument()
  })

  it('should display loading state', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as any // Never resolves

    render(<RailwayStatus />)

    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('should handle fetch errors', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as any

    render(<RailwayStatus />)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('should display "No deployments found" when list is empty', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as any)
    ) as any

    render(<RailwayStatus />)

    await waitFor(() => {
      expect(screen.getByText('No deployments found')).toBeInTheDocument()
    })
  })

  it('should display heading', () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      } as any)
    ) as any

    render(<RailwayStatus />)

    expect(screen.getByText('Deployments')).toBeInTheDocument()
  })

  it('should handle HTTP errors', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      } as any)
    ) as any

    render(<RailwayStatus />)

    await waitFor(() => {
      expect(screen.getByText('HTTP 500')).toBeInTheDocument()
    })
  })
})
