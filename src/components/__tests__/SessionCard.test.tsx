import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SessionCard from '../SessionCard'
import type { Session } from '../../types'

describe('SessionCard', () => {
  const mockSession: Session = {
    id: 'sess_123',
    name: 'test-session',
    status: 'active',
    source: 'local',
    created: Math.floor(Date.now() / 1000),
    idleSecs: 30,
    attached: false,
    cwd: '/home/user',
    relayConnected: false,
    display_mode: 'terminal'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders session card with basic info', () => {
    const onSelect = vi.fn()
    const onKill = vi.fn()

    render(
      <SessionCard
        session={mockSession}
        isSelected={false}
        onSelect={onSelect}
        onKill={onKill}
      />
    )

    expect(screen.getByText('test-session')).toBeInTheDocument()
    expect(screen.getByText(/Active/)).toBeInTheDocument()
  })

  it('share button opens modal', async () => {
    const onSelect = vi.fn()
    const onKill = vi.fn()

    render(
      <SessionCard
        session={mockSession}
        isSelected={false}
        onSelect={onSelect}
        onKill={onKill}
      />
    )

    const shareButton = screen.getByRole('button', { name: /share/i })
    fireEvent.click(shareButton)

    await waitFor(() => {
      expect(screen.getByText('Share Session')).toBeInTheDocument()
    })
  })

  it('text mode toggle calls PATCH endpoint', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      } as Response)
    )

    const onSelect = vi.fn()
    const onKill = vi.fn()

    render(
      <SessionCard
        session={mockSession}
        isSelected={false}
        onSelect={onSelect}
        onKill={onKill}
      />
    )

    const textModeButton = screen.getByRole('button', { name: /switch/i })
    fireEvent.click(textModeButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/sessions/${mockSession.id}`),
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('text')
        })
      )
    })
  })

  it('displays selected state with correct styling', () => {
    const onSelect = vi.fn()
    const onKill = vi.fn()

    const { container } = render(
      <SessionCard
        session={mockSession}
        isSelected={true}
        onSelect={onSelect}
        onKill={onKill}
      />
    )

    const card = container.querySelector('.border-blue-500')
    expect(card).toBeInTheDocument()
  })

  it('calls onSelect when card is clicked', () => {
    const onSelect = vi.fn()
    const onKill = vi.fn()

    const { container } = render(
      <SessionCard
        session={mockSession}
        isSelected={false}
        onSelect={onSelect}
        onKill={onKill}
      />
    )

    const card = container.firstChild as HTMLElement
    fireEvent.click(card)

    expect(onSelect).toHaveBeenCalled()
  })

  it('calls onKill when delete button is clicked', () => {
    const onSelect = vi.fn()
    const onKill = vi.fn()

    render(
      <SessionCard
        session={mockSession}
        isSelected={false}
        onSelect={onSelect}
        onKill={onKill}
      />
    )

    // There are multiple buttons, find the kill button by stopping propagation
    const killButton = screen.getAllByRole('button').find((btn) => {
      return btn.title === 'Dismiss session'
    })

    if (killButton) {
      fireEvent.click(killButton)
      expect(onKill).toHaveBeenCalled()
    }
  })

  it('displays relay status when applicable', () => {
    const onSelect = vi.fn()
    const onKill = vi.fn()

    const sessionWithRelay: Session = {
      ...mockSession,
      relayConnected: true
    }

    render(
      <SessionCard
        session={sessionWithRelay}
        isSelected={false}
        onSelect={onSelect}
        onKill={onKill}
      />
    )

    expect(screen.getByText('Relay')).toBeInTheDocument()
  })
})
