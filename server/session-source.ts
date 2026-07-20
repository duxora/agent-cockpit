// SessionStart hook `source` values reported by Claude Code.
// `fork` was added in v2.1.214: sessions started via /fork previously reported
// `resume`, so anything keying off `resume` alone silently drops forked sessions.
export const SESSION_START_SOURCES = ['startup', 'resume', 'clear', 'compact', 'fork'] as const

export type SessionStartSource = (typeof SESSION_START_SOURCES)[number] | 'unknown'

// Sources where the session carries prior conversation state rather than
// starting cold. `fork` gets the same treatment as `resume`.
const CONTINUATION_SOURCES: readonly SessionStartSource[] = ['resume', 'fork', 'clear', 'compact']

// Missing source → `startup` (hooks predating the field). Unrecognized values are
// kept as `unknown` instead of being coerced, so a future upstream addition shows
// up in the event log rather than masquerading as a cold start.
export function normalizeSessionSource(raw: unknown): SessionStartSource {
  if (raw == null || raw === '') return 'startup'
  const value = String(raw).trim().toLowerCase()
  return (SESSION_START_SOURCES as readonly string[]).includes(value)
    ? (value as SessionStartSource)
    : 'unknown'
}

export function isContinuationSource(source: SessionStartSource): boolean {
  return CONTINUATION_SOURCES.includes(source)
}
