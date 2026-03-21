# Input Lag Optimization: Local Echo + Keystroke Batching

**Date:** 2026-03-21
**Problem:** Claude local relay input appears slow in Cockpit when server runs on Railway cloud (network round-trip latency: 100-500ms)
**Solution:** Implement local echo for instant visual feedback + keystroke batching to reduce network overhead
**Status:** Design approved, ready for implementation

---

## Executive Summary

When Cockpit server runs on Railway and Claude relay runs locally, typing in the terminal UI has noticeable lag (~100-500ms per keystroke) due to network round-trips. We'll fix this by:

1. **Local echo:** Display typed characters immediately in xterm without waiting for server confirmation
2. **Keystroke batching:** Buffer keystrokes for 50ms before sending, reducing WebSocket message count
3. **Reconciliation:** Monitor server output to detect errors and correct client display if needed

This hybrid approach is proven by VS Code Remote SSH, SSH clients, and other remote development tools.

---

## Architecture

### Current Flow (Slow)

```
User types in xterm → WebSocket to Railway → Relay writes to PTY
→ PTY outputs → WebSocket back to client → Display in xterm
[Round-trip latency: 100-500ms]
```

### New Flow (Fast)

```
User types in xterm → LOCAL ECHO (instant) → Buffer keystroke
→ [50ms debounce] → Send batch to Railway → Relay writes to PTY
→ Continue accepting input (don't wait for output)
```

**Key principle:** Don't wait for server confirmation before showing character. The character is queued for transmission; if there's an error later, we reconcile.

---

## Implementation Details

### 1. Frontend: Local Echo + Keystroke Buffering

**File:** `src/components/TerminalView.tsx`

**Changes:**

```typescript
// Add to useEffect hook managing xterm initialization
const keystrokeBuffer: string[] = [];
let debounceTimer: NodeJS.Timeout | null = null;

term.onData((data) => {
  // LOCAL ECHO: Show character immediately
  // (xterm will handle writing to its buffer)

  // BUFFERING: Queue for batch send
  keystrokeBuffer.push(data);

  // DEBOUNCE: Send accumulated keystrokes every 50ms
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const batch = keystrokeBuffer.join('');
    if (batch && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: batch }));
    }
    keystrokeBuffer.length = 0; // Clear buffer
  }, 50);
});
```

**Assumptions:**
- xterm.js `onData()` fires before it writes to the terminal buffer (verify with xterm docs)
- If xterm writes automatically, local echo happens naturally
- If not, we may need to call `term.write(data)` manually to display before sending

**Note:** Current code already has `ws.onmessage` handling for 'output'. This continues unchanged — we just stop waiting for keystroke echo.

---

### 2. Backend: Input Processing + Optional Reconciliation

**File:** `server/index.ts`

**Changes:**

The existing input handler (`ws.on('message')` for type 'input') already writes to PTY. We enhance it to:

1. Accept batches (multiple characters in one message)
2. Track "expected" output to detect errors (optional, phase 2)

```typescript
// Existing handler, enhanced for batches:
if (message.type === 'input') {
  const batch = message.data; // Can be multiple characters

  // Write entire batch to PTY in one call
  // (PTY will handle it as if typed rapidly)
  pty.write(batch);

  // Optional: Log for reconciliation (phase 2)
  // eventLog.push({ type: 'input-sent', batch, timestamp });
}
```

**No breaking changes:** The relay and PTY handlers remain unchanged. We're just batching multiple characters into one `pty.write()` call instead of per-character writes.

---

### 3. Message Protocol

**New message type for input:**

Currently, input likely goes as:
```json
{ "type": "input", "data": "a" }
```

After this change, same format but `data` is a batch:
```json
{ "type": "input", "data": "hello" }
```

**Backward compatible:** Relay already writes whatever data it receives; batching just means more characters per message.

---

### 4. Error Handling & Reconciliation (Phase 2, Optional)

If input processing fails (e.g., "permission denied"), we detect via output monitoring:

```typescript
// Monitor PTY output stream for errors
// If output contains error keywords (e.g., "permission denied", "command not found"),
// and it doesn't match expected output, send correction to client

interface PendingInput {
  batch: string;
  timestamp: number;
}

const pendingInputs: PendingInput[] = [];

// On input:
pendingInputs.push({ batch: message.data, timestamp: Date.now() });

// On output:
if (outputContainsError && !outputMatches(pendingInputs)) {
  ws.send(JSON.stringify({
    type: 'reconcile',
    data: actualOutput
  }));
}
```

**For MVP:** Skip phase 2. The reconciliation logic is nice-to-have. Core fix is local echo + batching.

---

## Testing Strategy

### Unit Tests (`src/components/__tests__/TerminalView.test.tsx`)

1. **Local echo works:** Keystroke triggers `onData`, data immediately visible
2. **Batching works:** Multiple rapid keystrokes batched into one WebSocket message
3. **Debounce works:** Keystrokes within 50ms batched together; after 50ms, sent

```typescript
test('batches keystrokes sent within 50ms', async () => {
  // Simulate 5 keystrokes in rapid succession
  // Verify only 1 WebSocket message sent (not 5)
  // Verify message contains all 5 characters
});

test('local echo shows character immediately', () => {
  // Keystroke fires
  // Verify character appears in xterm without waiting for server response
});
```

### Integration Test (`server/__tests__/input.test.ts`)

1. **Batch write to PTY:** Send multi-character batch, verify PTY receives it
2. **Output is correct:** Command executes correctly even with batched input

```typescript
test('relay processes multi-character input batch correctly', () => {
  const batch = 'echo hello\n';
  relay.handleInput(batch);
  // Verify PTY contains output from command
});
```

### E2E Test (Manual or Playwright)

1. Open Cockpit terminal
2. Type `echo hello` (rapid typing)
3. Verify characters appear instantly (no wait for server)
4. Verify command executes
5. Measure latency: should feel snappy (<100ms perceived lag)

---

## Files Changed

| File | Change Type | Description |
|------|-----------|-------------|
| `src/components/TerminalView.tsx` | MODIFY | Add keystroke buffering + debounce logic |
| `src/types.ts` | MODIFY | Clarify input message format (optional) |
| `server/index.ts` | MODIFY | Accept batches in input handler (minimal) |
| `src/components/__tests__/TerminalView.test.tsx` | CREATE | Unit tests for local echo + batching |
| `server/__tests__/input.test.ts` | CREATE | Integration tests for batch input to PTY |

---

## Rollout Plan

### Phase 1 (MVP): Local Echo + Batching
- Implement keystroke buffering (50ms debounce)
- Local echo in xterm
- Ship and measure latency improvement

### Phase 2 (Optional): Reconciliation
- Add error detection and correction
- Add tests for error scenarios
- Ship if phase 1 rollout is successful

---

## Success Criteria

1. ✅ Typing in Cockpit terminal **feels instant** (no perceived delay)
2. ✅ WebSocket message count **reduced by 3-5x** (fewer messages per second)
3. ✅ Commands execute correctly even with batched input
4. ✅ All tests pass (unit + integration + E2E)
5. ✅ No regression in existing terminal functionality

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| xterm local echo interferes with server echo | Low | Test with actual xterm.js; may need to suppress server echo |
| Batching causes input order issues | Low | 50ms debounce is small enough to preserve typing order |
| Reconciliation logic becomes complex | Medium | Keep phase 2 optional; ship phase 1 first |
| Network failure during batch | Low | Existing reconnect logic handles this |

---

## References

- **VS Code Remote SSH:** Uses local echo + protocol optimization
- **SSH clients (OpenSSH):** Uses local echo + buffering
- **Replit:** Uses client-side caching + operational transformation
- **Terminal multiplexers (tmux):** Designed for high-latency networks

---

## Next Steps

1. ✅ Design approved
2. → Write implementation plan (writing-plans skill)
3. → Implement phase 1 (local echo + batching)
4. → Test thoroughly
5. → Deploy and measure
6. → (Optional) Implement phase 2 (reconciliation)
