import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SessionShareModal from '../SessionShareModal'

describe('SessionShareModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders when isOpen is true', () => {
    global.fetch = vi.fn((url: string) => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ shares: [] })
      } as Response)
    })

    render(
      <SessionShareModal
        sessionId="test-123"
        isOpen={true}
        onClose={() => {}}
      />
    )
    expect(screen.getByText('Share Session')).toBeInTheDocument()
  })

  it('closes modal when close button clicked', () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/shares') && url.includes('api/sessions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ shares: [] })
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ shares: [] })
      } as Response)
    })

    const onClose = vi.fn()
    const { container } = render(
      <SessionShareModal
        sessionId="test-123"
        isOpen={true}
        onClose={onClose}
      />
    )
    const closeBtn = container.querySelector('button[class*="text-gray-400"]')
    if (closeBtn) {
      fireEvent.click(closeBtn as HTMLElement)
      expect(onClose).toHaveBeenCalled()
    }
  })

  it('accepts password input', () => {
    global.fetch = vi.fn((url: string) => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ shares: [] })
      } as Response)
    })

    render(
      <SessionShareModal
        sessionId="test-123"
        isOpen={true}
        onClose={() => {}}
      />
    )
    const input = screen.getByPlaceholderText('Enter password') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'secret123' } })
    expect(input.value).toBe('secret123')
  })

  it('toggles access level radio buttons', () => {
    global.fetch = vi.fn((url: string) => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ shares: [] })
      } as Response)
    })

    render(
      <SessionShareModal
        sessionId="test-123"
        isOpen={true}
        onClose={() => {}}
      />
    )
    const viewOnlyRadio = screen.getByDisplayValue('read') as HTMLInputElement
    const canPromptRadio = screen.getByDisplayValue('interactive') as HTMLInputElement

    expect(viewOnlyRadio.checked).toBe(true)
    fireEvent.click(canPromptRadio)
    expect(canPromptRadio.checked).toBe(true)
  })

  it('posts to create share endpoint', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/shares') && url.includes('api/sessions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            shareId: 'share_abc123',
            token: 'token_xyz789',
            url: '/share/share_abc123?token=token_xyz789'
          })
        } as Response)
      }
      // For loadShares calls
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ shares: [] })
      } as Response)
    })

    render(
      <SessionShareModal
        sessionId="test-123"
        isOpen={true}
        onClose={() => {}}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('Enter password'), {
      target: { value: 'secret123' }
    })

    fireEvent.click(screen.getByText('Create Share'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions/test-123/shares'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('secret123')
        })
      )
    })
  })

  it('displays share URL on success', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/shares') && url.includes('api/sessions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            shareId: 'share_abc123',
            token: 'token_xyz789',
            url: '/share/share_abc123?token=token_xyz789'
          })
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ shares: [] })
      } as Response)
    })

    render(
      <SessionShareModal
        sessionId="test-123"
        isOpen={true}
        onClose={() => {}}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('Enter password'), {
      target: { value: 'secret123' }
    })
    fireEvent.click(screen.getByText('Create Share'))

    await waitFor(() => {
      expect(screen.getByDisplayValue('/share/share_abc123?token=token_xyz789')).toBeInTheDocument()
    })
  })

  it('shows error on failed share creation', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/shares') && url.includes('api/sessions')) {
        return Promise.resolve({
          ok: false
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ shares: [] })
      } as Response)
    })

    render(
      <SessionShareModal
        sessionId="test-123"
        isOpen={true}
        onClose={() => {}}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('Enter password'), {
      target: { value: 'secret123' }
    })
    fireEvent.click(screen.getByText('Create Share'))

    await waitFor(() => {
      expect(screen.getByText(/Failed to create share/)).toBeInTheDocument()
    })
  })

  it('copies share URL to clipboard', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/shares') && url.includes('api/sessions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            shareId: 'share_abc123',
            token: 'token_xyz789',
            url: '/share/share_abc123?token=token_xyz789'
          })
        } as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ shares: [] })
      } as Response)
    })

    global.navigator.clipboard = {
      writeText: vi.fn(() => Promise.resolve())
    } as any

    render(
      <SessionShareModal
        sessionId="test-123"
        isOpen={true}
        onClose={() => {}}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('Enter password'), {
      target: { value: 'secret123' }
    })
    fireEvent.click(screen.getByText('Create Share'))

    await waitFor(() => {
      const copyBtn = screen.getByRole('button', { name: /copy/i })
      fireEvent.click(copyBtn)
      expect(global.navigator.clipboard.writeText).toHaveBeenCalledWith('/share/share_abc123?token=token_xyz789')
    })
  })
})
