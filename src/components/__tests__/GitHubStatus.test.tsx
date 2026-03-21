import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { GitHubStatus } from '../GitHubStatus'

// Mock fetch globally
global.fetch = vi.fn()

describe('GitHubStatus Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any).mockClear()
  })

  it('renders loading state initially', () => {
    ;(global.fetch as any).mockImplementationOnce(() =>
      new Promise(() => {}) // Never resolves to keep loading
    )
    render(<GitHubStatus />)
    expect(screen.getByText(/Loading GitHub config/i)).toBeInTheDocument()
  })

  it('loads and displays config', async () => {
    ;(global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ owner: 'test-owner', repo: 'test-repo' })
      })
    )

    render(<GitHubStatus />)
    await waitFor(() => {
      expect(screen.getByText('GitHub Integration')).toBeInTheDocument()
    })
  })

  it('displays configure button', async () => {
    ;(global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ owner: '', repo: '' })
      })
    )

    render(<GitHubStatus />)
    await waitFor(() => {
      expect(screen.getByText('Configure')).toBeInTheDocument()
    })
  })

  it('toggles edit mode when configure is clicked', async () => {
    ;(global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ owner: '', repo: '' })
      })
    )

    render(<GitHubStatus />)
    const configureBtn = await screen.findByText('Configure')
    fireEvent.click(configureBtn)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('GitHub Token')).toBeInTheDocument()
    })
  })

  it('renders PR, issue, and branch sections when configured', async () => {
    ;(global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ owner: 'test-owner', repo: 'test-repo' })
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      )

    render(<GitHubStatus />)
    await waitFor(() => {
      expect(screen.getByText(/Open PRs/i)).toBeInTheDocument()
      expect(screen.getByText(/Open Issues/i)).toBeInTheDocument()
      expect(screen.getByText(/Recent Branches/i)).toBeInTheDocument()
    })
  })

  it('handles form submission', async () => {
    ;(global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ owner: '', repo: '' })
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        })
      )

    render(<GitHubStatus />)
    const configureBtn = await screen.findByText('Configure')
    fireEvent.click(configureBtn)

    const tokenInput = await screen.findByPlaceholderText('GitHub Token')
    const ownerInput = screen.getByPlaceholderText('Owner')
    const repoInput = screen.getByPlaceholderText('Repository')

    fireEvent.change(tokenInput, { target: { value: 'gho_test_token' } })
    fireEvent.change(ownerInput, { target: { value: 'testowner' } })
    fireEvent.change(repoInput, { target: { value: 'testrepo' } })

    const saveBtn = screen.getByText('Save')
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/github/config',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: 'gho_test_token',
            owner: 'testowner',
            repo: 'testrepo'
          })
        })
      )
    })
  })

  it('displays PRs when fetched', async () => {
    ;(global.fetch as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ owner: 'test-owner', repo: 'test-repo' })
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                number: 123,
                title: 'Test PR',
                author: 'testuser',
                state: 'open',
                url: 'https://github.com/test-owner/test-repo/pull/123'
              }
            ])
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        })
      )

    render(<GitHubStatus />)
    await waitFor(() => {
      expect(screen.getByText('#123')).toBeInTheDocument()
      expect(screen.getByText('Test PR')).toBeInTheDocument()
      expect(screen.getByText('by testuser')).toBeInTheDocument()
    })
  })
})
