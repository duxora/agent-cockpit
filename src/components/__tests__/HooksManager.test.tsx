import { describe, it, expect, beforeEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { HooksManager } from '../HooksManager'

describe('HooksManager Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any) = vi.fn()
  })

  it('exports HooksManager as a function', () => {
    expect(typeof HooksManager).toBe('function')
  })

  it('HooksManager is defined and callable', () => {
    expect(HooksManager).toBeDefined()
    // Check that it's a function
    const isFunction = HooksManager instanceof Function || typeof HooksManager === 'function'
    expect(isFunction).toBe(true)
  })

  it('HooksManager module is importable', () => {
    // If import worked, this test passes
    expect(HooksManager).not.toBeNull()
  })
})
