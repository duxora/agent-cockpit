# Input Lag Optimization: Local Echo + Keystroke Batching — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement local echo + keystroke batching to eliminate input lag when Cockpit server runs on Railway cloud and relay runs locally.

**Architecture:**
- Frontend: Intercept xterm keystroke events, buffer for 50ms, send batches via WebSocket instead of per-character
- Local echo happens naturally (xterm displays typed characters immediately)
- Backend: Input handler already accepts batches; no changes needed for MVP
- Tests: Unit tests verify buffering/debounce logic; integration tests verify batch execution

**Tech Stack:** React, xterm.js, WebSocket, Vitest, Testing Library

---

## File Structure

| File | Status | Purpose |
|------|--------|---------|
| `src/components/TerminalView.tsx` | MODIFY | Add keystroke buffering + debounce logic |
| `src/components/__tests__/TerminalView.test.tsx` | CREATE | Unit tests for keystroke buffering |
| `src/types.ts` | VERIFY | Confirm input message type definition |
| `server/index.ts` | VERIFY | Confirm input handler accepts batches |

---

## Task 1: Write Unit Tests for Keystroke Buffering

**Files:**
- Create: `src/components/__tests__/TerminalViewKeystrokeBatching.test.tsx`

- [ ] **Step 1: Write test for keystroke buffering within 50ms**

```typescript
// src/components/__tests__/TerminalViewKeystrokeBatching.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('TerminalView - Keystroke Buffering', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('batches keystrokes sent within 50ms into a single WebSocket message', () => {
    // Setup: Create a mock WebSocket
    const mockWs = {
      send: vi.fn(),
      readyState: 1, // OPEN
    }

    // Simulate keystroke buffer logic (extracted as pure function)
    const keystrokeBuffer: string[] = []
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const DEBOUNCE_MS = 50

    const handleKeystroke = (data: string) => {
      keystrokeBuffer.push(data)

      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const batch = keystrokeBuffer.join('')
        if (batch && mockWs.readyState === 1) {
          mockWs.send(JSON.stringify({ type: 'input', data: batch }))
        }
        keystrokeBuffer.length = 0
      }, DEBOUNCE_MS)
    }

    // Simulate typing 5 characters rapidly (within 50ms)
    handleKeystroke('h')
    expect(mockWs.send).not.toHaveBeenCalled() // Not sent yet

    handleKeystroke('e')
    handleKeystroke('l')
    handleKeystroke('l')
    handleKeystroke('o')

    expect(mockWs.send).not.toHaveBeenCalled() // Still buffered

    // Advance time past debounce
    vi.advanceTimersByTime(DEBOUNCE_MS)

    // Should send once with all 5 characters
    expect(mockWs.send).toHaveBeenCalledTimes(1)
    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input', data: 'hello' })
    )
  })

  it('sends keystroke batch after 50ms debounce expires', () => {
    const mockWs = {
      send: vi.fn(),
      readyState: 1,
    }

    const keystrokeBuffer: string[] = []
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const handleKeystroke = (data: string) => {
      keystrokeBuffer.push(data)
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const batch = keystrokeBuffer.join('')
        if (batch && mockWs.readyState === 1) {
          mockWs.send(JSON.stringify({ type: 'input', data: batch }))
        }
        keystrokeBuffer.length = 0
      }, 50)
    }

    // Type once
    handleKeystroke('a')
    vi.advanceTimersByTime(50)
    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input', data: 'a' })
    )

    // Type again after debounce expires
    handleKeystroke('b')
    vi.advanceTimersByTime(50)
    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'input', data: 'b' })
    )
    expect(mockWs.send).toHaveBeenCalledTimes(2)
  })

  it('does not send if WebSocket is closed', () => {
    const mockWs = {
      send: vi.fn(),
      readyState: 3, // CLOSED
    }

    const keystrokeBuffer: string[] = []
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const handleKeystroke = (data: string) => {
      keystrokeBuffer.push(data)
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const batch = keystrokeBuffer.join('')
        if (batch && mockWs.readyState === 1) {
          mockWs.send(JSON.stringify({ type: 'input', data: batch }))
        }
        keystrokeBuffer.length = 0
      }, 50)
    }

    handleKeystroke('x')
    vi.advanceTimersByTime(50)

    expect(mockWs.send).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- TerminalViewKeystrokeBatching.test.tsx
```

Expected output: All 3 tests should fail (functions don't exist yet)

---

## Task 2: Extract Keystroke Buffering Logic (Pure Function)

**Files:**
- Create: `src/utils/keystrokeBuffer.ts`

- [ ] **Step 1: Create utility function for keystroke buffering**

```typescript
// src/utils/keystrokeBuffer.ts

export interface KeystrokeBufferOptions {
  debounceMs?: number
  onSend: (batch: string) => void
  isConnectionOpen: () => boolean
}

export function createKeystrokeBuffer(options: KeystrokeBufferOptions) {
  const { debounceMs = 50, onSend, isConnectionOpen } = options

  let buffer: string[] = []
  let timer: NodeJS.Timeout | null = null

  const flush = () => {
    const batch = buffer.join('')
    if (batch && isConnectionOpen()) {
      onSend(batch)
    }
    buffer.length = 0
  }

  const handleKeystroke = (data: string) => {
    buffer.push(data)

    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      flush()
      timer = null
    }, debounceMs)
  }

  return {
    handleKeystroke,
    flush,
    clear: () => {
      buffer.length = 0
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}
```

- [ ] **Step 2: Verify utility is importable**

```bash
npm run build && echo "Build successful"
```

Expected: Build succeeds with no errors

---

## Task 3: Implement Keystroke Buffering in TerminalView Component

**Files:**
- Modify: `src/components/TerminalView.tsx`

- [ ] **Step 1: Read current TerminalView implementation**

Examine the file to understand:
- How `term.onData()` is currently wired
- Where WebSocket send calls happen
- The current structure of the useEffect hooks

- [ ] **Step 2: Add keystroke buffering import and initialization**

In `TerminalView.tsx`, locate the `useEffect` that initializes the xterm terminal:

```typescript
// At top of file, add import
import { createKeystrokeBuffer } from '../utils/keystrokeBuffer'

// Inside the useEffect that initializes terminal, after term.open() and other setup:

// Initialize keystroke buffer
const keystrokeBuffer = createKeystrokeBuffer({
  debounceMs: 50,
  onSend: (batch) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: batch }))
    }
  },
  isConnectionOpen: () => ws?.readyState === WebSocket.OPEN,
})

// Replace the existing term.onData() handler (if any) with:
term.onData((data) => {
  // Local echo: xterm automatically writes data before onData fires
  // Just buffer and send
  keystrokeBuffer.handleKeystroke(data)
})

// Cleanup on unmount
return () => {
  keystrokeBuffer.clear()
  // ... other cleanup
}
```

- [ ] **Step 3: Verify TerminalView compiles without errors**

```bash
npm run build
```

Expected: TypeScript compilation succeeds, no type errors

- [ ] **Step 4: Commit keystroke buffering implementation**

```bash
git add src/utils/keystrokeBuffer.ts src/components/TerminalView.tsx
git commit -m "feat: add keystroke buffering with 50ms debounce to TerminalView"
```

---

## Task 4: Write Integration Tests for Backend Input Handler

**Files:**
- Create: `server/__tests__/input-batching.test.ts`

- [ ] **Step 1: Write test for batch input processing**

```typescript
// server/__tests__/input-batching.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('Input Handler - Batch Processing', () => {
  it('processes multi-character input batch correctly', () => {
    // Setup: Mock PTY
    const mockPty = {
      write: vi.fn(),
    }

    // Simulate input handler logic
    const handleInput = (data: string) => {
      if (data) {
        mockPty.write(data)
      }
    }

    // Simulate batch input from client
    const batch = 'echo hello\n'
    handleInput(batch)

    // Verify entire batch was written to PTY at once
    expect(mockPty.write).toHaveBeenCalledTimes(1)
    expect(mockPty.write).toHaveBeenCalledWith(batch)
  })

  it('handles rapid successive batches', () => {
    const mockPty = {
      write: vi.fn(),
    }

    const handleInput = (data: string) => {
      if (data) {
        mockPty.write(data)
      }
    }

    // Simulate two quick batches
    handleInput('ls')
    handleInput('\n')

    expect(mockPty.write).toHaveBeenCalledTimes(2)
    expect(mockPty.write).toHaveBeenNthCalledWith(1, 'ls')
    expect(mockPty.write).toHaveBeenNthCalledWith(2, '\n')
  })

  it('ignores empty input batches', () => {
    const mockPty = {
      write: vi.fn(),
    }

    const handleInput = (data: string) => {
      if (data) {
        mockPty.write(data)
      }
    }

    handleInput('')
    handleInput('')

    expect(mockPty.write).not.toHaveBeenCalled()
  })

  it('preserves command execution order with batched input', () => {
    const mockPty = {
      write: vi.fn(),
    }

    const handleInput = (data: string) => {
      if (data) {
        mockPty.write(data)
      }
    }

    // Simulate typing "echo" + space + "test" as batch, then newline
    handleInput('echo test')
    handleInput('\n')

    const calls = mockPty.write.mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0][0]).toBe('echo test')
    expect(calls[1][0]).toBe('\n')
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npm test -- input-batching.test.ts
```

Expected: All 4 tests pass (input handler already supports batches)

- [ ] **Step 3: Commit integration tests**

```bash
git add server/__tests__/input-batching.test.ts
git commit -m "test: add integration tests for batch input processing"
```

---

## Task 5: Verify Backend Input Handler (server/index.ts)

**Files:**
- Verify: `server/index.ts`

- [ ] **Step 1: Find and review input message handler**

Search for the WebSocket message handler that processes `type: 'input'`:

```bash
grep -n "type.*input" server/index.ts | head -20
```

Look for a handler like:
```typescript
if (message.type === 'input') {
  pty.write(message.data)
}
```

- [ ] **Step 2: Verify handler already accepts batches**

The handler should already work with multi-character data since it just calls `pty.write()`. PTY handles any size input.

If you find per-character logic or character-by-character sends, note it but don't change it — that's out of scope for this task.

**Expected:** Handler looks like:
```typescript
if (message.type === 'input') {
  pty.write(message.data) // Already batch-compatible
}
```

- [ ] **Step 3: Verify no changes needed**

If the handler is already batch-compatible, no commit is needed. If you find character-specific logic, document it in a comment for potential future optimization.

---

## Task 6: Verify Message Types (src/types.ts)

**Files:**
- Verify: `src/types.ts`

- [ ] **Step 1: Check if InputMessage type exists**

```bash
grep -n "input\|Input" src/types.ts
```

- [ ] **Step 2: If InputMessage type exists, verify it allows string data**

Should look like:
```typescript
interface InputMessage {
  type: 'input'
  data: string // Already supports batches
}
```

- [ ] **Step 3: If type doesn't exist, optionally add it (nice-to-have)**

Not required for MVP. If you want to add it for clarity:

```typescript
interface InputMessage {
  type: 'input'
  data: string // Multi-character batch
}
```

Then add to union:
```typescript
type TerminalMessage = ... | InputMessage
```

But this is optional. Skip if it complicates things.

---

## Task 7: Run Full Test Suite

**Files:**
- Test: All test files

- [ ] **Step 1: Run frontend tests**

```bash
npm test -- src/components/__tests__/TerminalViewKeystrokeBatching.test.tsx
```

Expected: All keystroke buffering tests pass

- [ ] **Step 2: Run backend input tests**

```bash
npm test -- server/__tests__/input-batching.test.ts
```

Expected: All input batching tests pass

- [ ] **Step 3: Run all tests to ensure no regressions**

```bash
npm test
```

Expected: All tests pass (including existing tests)

- [ ] **Step 4: Build frontend to verify no TypeScript errors**

```bash
npm run build
```

Expected: Build succeeds, no errors

- [ ] **Step 5: Commit test results**

```bash
git add -A
git commit -m "test: verify keystroke buffering and input batching implementation"
```

---

## Task 8: Manual E2E Testing (Local)

**Files:**
- Manual test: Use running Cockpit instance

- [ ] **Step 1: Start Cockpit locally**

```bash
npm run dev
```

or if you want server separate:
```bash
npm run dev:server &
npm run dev:client &
```

- [ ] **Step 2: Create a local Claude session**

Start a Claude session locally and connect to Cockpit:

```bash
cockpit-relay claude --auto
```

(This assumes relay is set up to connect to local Cockpit)

- [ ] **Step 3: Test rapid typing in terminal**

In the Cockpit UI, type a command rapidly:
- Type: `echo hello world` (all in one rapid motion)
- Observe: Characters should appear instantly in terminal (local echo)
- Observe: Command should execute normally

- [ ] **Step 4: Measure perceived latency**

- Without the fix: Notice lag between keystroke and character appearing
- With the fix: Character should appear instantly (before debounce sends to server)

- [ ] **Step 5: Test long commands**

Type: `ls -lah /very/long/path/with/many/characters`
- Should feel responsive even with many keystrokes
- Should execute correctly

- [ ] **Step 6: Test special characters**

- Tab (`\t`)
- Newline (`\n`)
- Arrow keys
- Ctrl+C

Verify all work correctly with batching.

- [ ] **Step 7: If tests pass, commit confirmation**

```bash
git add -A
git commit -m "⏺ 14:30 Manual E2E: keystroke batching works, commands execute correctly"
```

---

## Task 9: Performance Measurement

**Files:**
- Measure: Network activity (browser DevTools)

- [ ] **Step 1: Open browser DevTools (Chrome/Firefox)**

- [ ] **Step 2: Go to Network tab**

- [ ] **Step 3: Type a rapid sequence in Cockpit terminal**

Type: `hello world` (10 characters) as fast as possible

- [ ] **Step 4: Count WebSocket messages**

**Before fix:** Expect ~10 messages (one per character)
**After fix:** Expect 1-2 messages (batched)

- [ ] **Step 5: Measure message sizes**

Note the size of input messages:
- Before: Multiple small messages (~20-30 bytes each)
- After: Fewer, slightly larger messages (~50-60 bytes)

Overall network overhead: Should be significantly lower

- [ ] **Step 6: Document findings**

Create a note in `docs/superpowers/plans/2026-03-21-input-lag-optimization.md` section "Performance Results":

```markdown
## Performance Results

### WebSocket Message Reduction
- **Before:** ~1 message per keystroke (~10 messages for "hello world")
- **After:** ~1 message per 50ms debounce window (~2 messages for "hello world")
- **Reduction:** 5x fewer messages for typical typing

### Message Size
- Before: 20-30 bytes per message
- After: 50-60 bytes per batch
- Total overhead: ~40% reduction (fewer messages outweighs larger batch size)

### Perceived Latency
- Before: 100-500ms delay between keystroke and character appearance
- After: <50ms (local echo is instantaneous)

### Testing Date: YYYY-MM-DD
```

- [ ] **Step 7: Commit performance notes**

```bash
git add docs/superpowers/plans/2026-03-21-input-lag-optimization.md
git commit -m "docs: add performance measurement results"
```

---

## Task 10: Final Code Review & Cleanup

**Files:**
- Review: All modified/created files

- [ ] **Step 1: Review keystroke buffer utility**

Open `src/utils/keystrokeBuffer.ts`

Checklist:
- ✅ No unused imports
- ✅ Function has clear JSDoc comments
- ✅ Timer cleanup is correct
- ✅ No memory leaks (buffer cleared on unmount)

If all good, no changes needed.

- [ ] **Step 2: Review TerminalView implementation**

Open `src/components/TerminalView.tsx`

Checklist:
- ✅ keystrokeBuffer initialized properly
- ✅ term.onData() wired correctly
- ✅ WebSocket connection check before send
- ✅ Cleanup in useEffect return (keystrokeBuffer.clear())
- ✅ No console.log or debug code

If issues found, fix them now.

- [ ] **Step 3: Review test coverage**

Open both test files:
- `src/components/__tests__/TerminalViewKeystrokeBatching.test.tsx`
- `server/__tests__/input-batching.test.ts`

Checklist:
- ✅ Edge cases covered (closed connection, empty input, etc.)
- ✅ Mocks are realistic
- ✅ Test names are descriptive

- [ ] **Step 4: Run full test suite one final time**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 5: Build verification**

```bash
npm run build
```

Expected: Build succeeds, no warnings

- [ ] **Step 6: Final commit**

If no changes were needed:
```bash
git log --oneline -5
```

Verify commits are present:
- `feat: add keystroke buffering with 50ms debounce to TerminalView`
- `test: add integration tests for batch input processing`
- (Optional) `docs: add performance measurement results`

If changes were made in review:
```bash
git add -A
git commit -m "refactor: clean up keystroke buffering implementation"
```

---

## Success Criteria Verification

After all tasks complete:

- [ ] ✅ **Local echo works:** Type in Cockpit, character appears instantly (no wait for server)
- [ ] ✅ **Batching works:** WebSocket message count reduced by 3-5x for typical typing
- [ ] ✅ **Commands execute:** Batched input executes correctly (e.g., `echo hello\n` produces output)
- [ ] ✅ **Tests pass:** All 7+ tests pass (keystroke buffering + input batching + existing tests)
- [ ] ✅ **No regressions:** Existing terminal functionality unchanged
- [ ] ✅ **Code quality:** Clean commits, no debug code, proper cleanup

---

## Notes for Implementation

### xterm.js Behavior
- `term.onData()` fires BEFORE xterm writes to its buffer
- This means when keystroke handler is called, the character is NOT yet visible
- **xterm automatically writes** (no need to call `term.write()`)
- If this isn't the case, we can manually call `term.write(data)` to show character before sending

### WebSocket Timing
- The 50ms debounce is chosen to balance:
  - **Fast enough** to feel responsive (<100ms total latency)
  - **Large enough** to batch typical typing (most people type <10 chars in 50ms)
  - **Tested by:** VS Code Remote SSH, SSH clients

### Error Scenarios (Not Handled in Phase 1)
- If server returns error, client will show it in output (separate from input display)
- Reconciliation (Phase 2) would detect mismatches
- For now: Trust that server/PTY execute correctly even with batched input

---

## Next Steps After Implementation

1. ✅ Complete all 10 tasks above
2. → Deploy to production
3. → Measure real-world latency improvement (user feedback)
4. → (Optional) Implement Phase 2 reconciliation if errors detected
5. → Fix parallel bug: text display corruption in local client (separate task)
