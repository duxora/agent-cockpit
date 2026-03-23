import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Global fetch mock that returns empty shares by default
if (!global.fetch) {
  global.fetch = vi.fn((url: string) => {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ shares: [] })
    } as Response)
  })
}
