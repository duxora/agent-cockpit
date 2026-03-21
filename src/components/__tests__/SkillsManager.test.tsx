import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SkillsManager } from '../SkillsManager'

describe('SkillsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('renders loading state initially', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as any

    render(<SkillsManager />)
    expect(screen.getByText(/loading skills/i)).toBeInTheDocument()
  })

  it('displays skills list', async () => {
    const mockSkills = [
      {
        name: 'test-skill',
        description: 'A test skill',
        version: '1.0.0',
        category: 'testing',
        enabled: true,
        path: '/path/to/skill'
      }
    ]

    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: async () => mockSkills
      })
    ) as any

    render(<SkillsManager />)

    await waitFor(() => {
      expect(screen.getByText('test-skill')).toBeInTheDocument()
      expect(screen.getByText('A test skill')).toBeInTheDocument()
    })
  })

  it('renders search input field', async () => {
    const mockSkills = [
      {
        name: 'test-skill',
        description: 'A test skill',
        version: '1.0.0',
        category: 'testing',
        enabled: true,
        path: '/path/to/skill'
      }
    ]

    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: async () => mockSkills
      })
    ) as any

    render(<SkillsManager />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search skills...')).toBeInTheDocument()
    })
  })

  it('displays enabled/disabled status correctly', async () => {
    const mockSkills = [
      {
        name: 'enabled-skill',
        description: 'An enabled skill',
        version: '1.0.0',
        category: 'testing',
        enabled: true,
        path: '/path/to/skill'
      },
      {
        name: 'disabled-skill',
        description: 'A disabled skill',
        version: '1.0.0',
        category: 'testing',
        enabled: false,
        path: '/path/to/other'
      }
    ]

    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: async () => mockSkills
      })
    ) as any

    render(<SkillsManager />)

    await waitFor(() => {
      const statusBadges = screen.getAllByText(/enabled|disabled/i)
      expect(statusBadges.some(el => el.textContent === 'Enabled')).toBe(true)
      expect(statusBadges.some(el => el.textContent === 'Disabled')).toBe(true)
    })
  })

  it('handles empty skills list', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: async () => []
      })
    ) as any

    render(<SkillsManager />)

    await waitFor(() => {
      expect(screen.getByText(/no skills found/i)).toBeInTheDocument()
    })
  })

  it('displays skill count', async () => {
    const mockSkills = [
      {
        name: 'skill1',
        description: 'Skill 1',
        version: '1.0.0',
        category: 'testing',
        enabled: true,
        path: '/path/to/skill1'
      },
      {
        name: 'skill2',
        description: 'Skill 2',
        version: '1.0.0',
        category: 'testing',
        enabled: true,
        path: '/path/to/skill2'
      }
    ]

    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: async () => mockSkills
      })
    ) as any

    render(<SkillsManager />)

    await waitFor(() => {
      expect(screen.getByText('Showing 2 of 2 skills')).toBeInTheDocument()
    })
  })
})
