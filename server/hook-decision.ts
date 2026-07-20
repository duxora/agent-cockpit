// Hook decision payloads returned to Claude Code on stdout.
//
// Claude Code decides whether a hook blocks from two independent channels: the
// process exit code and the JSON written to stdout. Before v2.1.214 a hook that
// exited 2 but wrote stdout JSON failing schema validation was NOT treated as a
// block — the malformed payload swallowed the exit code. That is fixed upstream,
// but the reason text still only reaches the model when the payload validates
// (or, for exit 2, via stderr), so the cockpit emits nothing it cannot verify.
//
// Rule enforced here: a payload is either schema-valid or it is not written at
// all. Exit code 2 always stands on its own.

export const HOOK_EXIT_SUCCESS = 0
// Documented "blocking error": stderr is fed back to the model.
export const HOOK_EXIT_BLOCK = 2

// Events that carry a permission decision under `hookSpecificOutput`.
const PERMISSION_EVENTS = ['PreToolUse'] as const

// Events that block via the top-level `decision`/`reason` pair.
const DECISION_EVENTS = ['PostToolUse', 'UserPromptSubmit', 'Stop', 'SubagentStop'] as const

export type PermissionHookEvent = (typeof PERMISSION_EVENTS)[number]
export type DecisionHookEvent = (typeof DECISION_EVENTS)[number]
export type HookEvent = PermissionHookEvent | DecisionHookEvent

export type PermissionDecision = 'allow' | 'deny' | 'ask'

export interface PermissionHookResponse {
  hookSpecificOutput: {
    hookEventName: PermissionHookEvent
    permissionDecision: PermissionDecision
    permissionDecisionReason: string
  }
}

export interface DecisionHookResponse {
  decision: 'block'
  reason: string
}

export type HookResponse = PermissionHookResponse | DecisionHookResponse

export function isPermissionEvent(event: string): event is PermissionHookEvent {
  return (PERMISSION_EVENTS as readonly string[]).includes(event)
}

export function isDecisionEvent(event: string): event is DecisionHookEvent {
  return (DECISION_EVENTS as readonly string[]).includes(event)
}

// Builds the stdout payload for a block. `reason` is required by the schema for
// both shapes — an empty reason is a validation failure, not a silent default,
// so callers cannot accidentally ship a block the model can't explain.
export function buildBlockResponse(event: HookEvent, reason: string): HookResponse {
  if (isPermissionEvent(event)) {
    return {
      hookSpecificOutput: {
        hookEventName: event,
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }
  }
  return { decision: 'block', reason }
}

export function buildAllowResponse(event: PermissionHookEvent, reason: string): PermissionHookResponse {
  return {
    hookSpecificOutput: {
      hookEventName: event,
      permissionDecision: 'allow',
      permissionDecisionReason: reason,
    },
  }
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Mirrors Claude Code's stdout schema check. Anything this rejects must never be
// written to stdout.
export function validateHookResponse(payload: unknown): ValidationResult {
  const errors: string[] = []
  if (!isPlainObject(payload)) {
    return { valid: false, errors: ['payload must be a JSON object'] }
  }

  const hasSpecific = 'hookSpecificOutput' in payload
  const hasDecision = 'decision' in payload

  if (!hasSpecific && !hasDecision) {
    errors.push('payload must contain hookSpecificOutput or decision')
  }

  if (hasSpecific) {
    const specific = payload.hookSpecificOutput
    if (!isPlainObject(specific)) {
      errors.push('hookSpecificOutput must be an object')
    } else {
      const { hookEventName, permissionDecision, permissionDecisionReason } = specific
      if (typeof hookEventName !== 'string' || !isPermissionEvent(hookEventName)) {
        errors.push(`hookSpecificOutput.hookEventName must be one of ${PERMISSION_EVENTS.join(', ')}`)
      }
      if (permissionDecision !== 'allow' && permissionDecision !== 'deny' && permissionDecision !== 'ask') {
        errors.push('hookSpecificOutput.permissionDecision must be allow, deny, or ask')
      }
      if (typeof permissionDecisionReason !== 'string' || permissionDecisionReason.trim() === '') {
        errors.push('hookSpecificOutput.permissionDecisionReason must be a non-empty string')
      }
    }
  }

  if (hasDecision) {
    if (payload.decision !== 'block') {
      errors.push('decision must be "block"')
    }
    if (typeof payload.reason !== 'string' || payload.reason.trim() === '') {
      errors.push('reason must be a non-empty string when decision is set')
    }
  }

  return { valid: errors.length === 0, errors }
}

export interface HookEmission {
  stdout: string
  stderr: string
  exitCode: number
}

// Single exit point for a blocking hook decision. The exit code carries the
// block; stdout carries the payload only when it validates. When it doesn't, the
// reason is routed to stderr — which Claude Code surfaces for exit 2 — so the
// block still lands with an explanation instead of a rejected payload.
export function emitBlock(event: HookEvent, reason: string): HookEmission {
  const trimmed = reason.trim()
  const payload = buildBlockResponse(event, trimmed)
  const { valid, errors } = validateHookResponse(payload)

  if (!valid) {
    return {
      stdout: '',
      stderr: trimmed || `Blocked by Agent Cockpit (${event}); payload rejected: ${errors.join('; ')}`,
      exitCode: HOOK_EXIT_BLOCK,
    }
  }

  let serialized: string
  try {
    serialized = JSON.stringify(payload)
  } catch {
    return { stdout: '', stderr: trimmed, exitCode: HOOK_EXIT_BLOCK }
  }

  return { stdout: serialized, stderr: trimmed, exitCode: HOOK_EXIT_BLOCK }
}

// Telemetry hooks (register/heartbeat/session-end) observe only: empty stdout,
// exit 0. Writing anything else risks a stray non-JSON line being parsed as a
// decision.
export function emitPassthrough(): HookEmission {
  return { stdout: '', stderr: '', exitCode: HOOK_EXIT_SUCCESS }
}
