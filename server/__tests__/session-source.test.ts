import { describe, it, expect } from 'vitest'
import { normalizeSessionSource, isContinuationSource, SESSION_START_SOURCES } from '../session-source.js'

describe('normalizeSessionSource', () => {
  it('passes through every known source', () => {
    for (const source of SESSION_START_SOURCES) {
      expect(normalizeSessionSource(source)).toBe(source)
    }
  })

  it('recognizes fork (v2.1.214+) instead of dropping it', () => {
    expect(normalizeSessionSource('fork')).toBe('fork')
    expect(normalizeSessionSource('FORK')).toBe('fork')
    expect(normalizeSessionSource(' fork ')).toBe('fork')
  })

  it('defaults to startup when the field is absent', () => {
    expect(normalizeSessionSource(undefined)).toBe('startup')
    expect(normalizeSessionSource(null)).toBe('startup')
    expect(normalizeSessionSource('')).toBe('startup')
  })

  it('marks unrecognized values unknown rather than coercing them', () => {
    expect(normalizeSessionSource('teleport')).toBe('unknown')
    expect(normalizeSessionSource(42)).toBe('unknown')
  })
})

describe('isContinuationSource', () => {
  it('treats fork the same as resume', () => {
    expect(isContinuationSource('fork')).toBe(true)
    expect(isContinuationSource('resume')).toBe(true)
  })

  it('treats clear and compact as continuations of an existing session', () => {
    expect(isContinuationSource('clear')).toBe(true)
    expect(isContinuationSource('compact')).toBe(true)
  })

  it('does not treat cold or unknown starts as continuations', () => {
    expect(isContinuationSource('startup')).toBe(false)
    expect(isContinuationSource('unknown')).toBe(false)
  })
})
