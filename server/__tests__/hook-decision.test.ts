import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import {
  HOOK_EXIT_BLOCK,
  HOOK_EXIT_SUCCESS,
  buildAllowResponse,
  buildBlockResponse,
  emitBlock,
  emitPassthrough,
  validateHookResponse,
} from '../hook-decision'

describe('validateHookResponse', () => {
  it('accepts a PreToolUse deny payload', () => {
    const payload = buildBlockResponse('PreToolUse', 'session paused from cockpit')
    expect(validateHookResponse(payload)).toEqual({ valid: true, errors: [] })
  })

  it('accepts a Stop block payload', () => {
    const payload = buildBlockResponse('Stop', 'still draining queued panes')
    expect(payload).toEqual({ decision: 'block', reason: 'still draining queued panes' })
    expect(validateHookResponse(payload).valid).toBe(true)
  })

  it('accepts a PreToolUse allow payload', () => {
    expect(validateHookResponse(buildAllowResponse('PreToolUse', 'session active')).valid).toBe(true)
  })

  it.each([
    ['non-object', 'blocked'],
    ['array', ['blocked']],
    ['null', null],
    ['empty object', {}],
    ['unknown event name', {
      hookSpecificOutput: {
        hookEventName: 'PreToolUseV2',
        permissionDecision: 'deny',
        permissionDecisionReason: 'nope',
      },
    }],
    ['bad permissionDecision', {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'block',
        permissionDecisionReason: 'nope',
      },
    }],
    ['blank reason', {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: '   ',
      },
    }],
    ['decision without reason', { decision: 'block' }],
    ['decision with wrong verb', { decision: 'deny', reason: 'nope' }],
  ])('rejects %s', (_label, payload) => {
    const result = validateHookResponse(payload)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe('emitBlock', () => {
  it('emits schema-valid stdout alongside exit 2', () => {
    const emission = emitBlock('PreToolUse', 'session paused from cockpit')
    expect(emission.exitCode).toBe(HOOK_EXIT_BLOCK)
    expect(validateHookResponse(JSON.parse(emission.stdout)).valid).toBe(true)
    expect(emission.stderr).toBe('session paused from cockpit')
  })

  // The v2.1.214 fix means exit 2 blocks even when stdout is rejected, but the
  // cockpit still refuses to write a payload it knows is invalid.
  it('suppresses stdout and keeps exit 2 when the reason is empty', () => {
    const emission = emitBlock('Stop', '   ')
    expect(emission.stdout).toBe('')
    expect(emission.exitCode).toBe(HOOK_EXIT_BLOCK)
    expect(emission.stderr).toContain('Blocked by Agent Cockpit (Stop)')
  })

  it('never emits stdout that fails its own validator', () => {
    for (const event of ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop', 'SubagentStop'] as const) {
      for (const reason of ['paused', '', '  ', 'quote " and \\ backslash', '🚦 unicode']) {
        const emission = emitBlock(event, reason)
        expect(emission.exitCode).toBe(HOOK_EXIT_BLOCK)
        if (emission.stdout !== '') {
          expect(validateHookResponse(JSON.parse(emission.stdout)).valid).toBe(true)
        }
      }
    }
  })
})

describe('emitPassthrough', () => {
  it('observes without writing a decision', () => {
    expect(emitPassthrough()).toEqual({ stdout: '', stderr: '', exitCode: HOOK_EXIT_SUCCESS })
  })
})

// The shipped hook scripts are telemetry-only. If one ever leaks a non-JSON line
// on stdout, Claude Code tries to parse it as a decision payload.
describe('shipped hook scripts', () => {
  const hooksDir = path.join(__dirname, '../../hooks')
  const scripts = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.sh'))

  it('finds the hook scripts', () => {
    expect(scripts.length).toBeGreaterThan(0)
  })

  it.each(scripts)('%s writes no stdout and exits 0', (script) => {
    const input = JSON.stringify({
      session_id: 'test-session',
      cwd: '/tmp/agent-cockpit-test',
      source: 'fork',
    })
    const stdout = execFileSync('bash', [path.join(hooksDir, script)], {
      input,
      encoding: 'utf8',
      // Unroutable port: the backgrounded curl fails fast instead of reaching prod.
      env: { ...process.env, COCKPIT_URL: 'http://127.0.0.1:1' },
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    expect(stdout).toBe('')
  })

  it.each(scripts)('%s stays silent on malformed hook input', (script) => {
    const stdout = execFileSync('bash', [path.join(hooksDir, script)], {
      input: 'not json at all',
      encoding: 'utf8',
      env: { ...process.env, COCKPIT_URL: 'http://127.0.0.1:1' },
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    expect(stdout).toBe('')
  })
})
