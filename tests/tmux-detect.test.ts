import { describe, it, expect } from 'vitest'
import { detectSessionState } from '../server/tmux.js'

describe('detectSessionState', () => {
  it('detects active state for normal output', () => {
    const content = `
$ ls
file1.txt  file2.txt
$ echo hello
hello
$`
    expect(detectSessionState(content)).toBe('active')
  })

  it('detects waiting state for y/n prompt', () => {
    const content = `
Claude wants to run a command.
Allow this? (y/n)`
    expect(detectSessionState(content)).toBe('waiting')
  })

  it('detects waiting state for Y/n prompt', () => {
    const content = `
Some output here
Continue? [Y/n]`
    expect(detectSessionState(content)).toBe('waiting')
  })

  it('detects waiting state for y/N prompt', () => {
    const content = `
Delete all files?
Are you sure? [y/N]`
    expect(detectSessionState(content)).toBe('waiting')
  })

  it('detects waiting state for "Do you want to allow"', () => {
    const content = `
Do you want to allow this tool call?
Tool: Write to file.ts`
    expect(detectSessionState(content)).toBe('waiting')
  })

  it('detects waiting state for "Press Enter to continue"', () => {
    const content = `
Installation complete.
Press Enter to continue...`
    expect(detectSessionState(content)).toBe('waiting')
  })

  it('detects waiting state for "Approve?"', () => {
    const content = `
Changes staged for commit.
Approve?`
    expect(detectSessionState(content)).toBe('waiting')
  })

  it('returns active for empty content', () => {
    expect(detectSessionState('')).toBe('active')
  })

  it('only checks last 20 lines', () => {
    // Put prompt far above and normal output after
    const lines = ['Allow this? (y/n)']
    for (let i = 0; i < 25; i++) {
      lines.push(`normal output line ${i}`)
    }
    expect(detectSessionState(lines.join('\n'))).toBe('active')
  })

  it('detects prompt in last 20 lines', () => {
    const lines: string[] = []
    for (let i = 0; i < 15; i++) {
      lines.push(`normal output line ${i}`)
    }
    lines.push('Allow this action? (y/n)')
    expect(detectSessionState(lines.join('\n'))).toBe('waiting')
  })
})
