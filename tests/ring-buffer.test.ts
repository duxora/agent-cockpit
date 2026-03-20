import { describe, it, expect, afterEach } from 'vitest'
import { RingBuffer, getSessionBuffer, removeSessionBuffer } from '../server/ring-buffer.js'

describe('RingBuffer', () => {
  it('returns empty string when nothing written', () => {
    const buf = new RingBuffer(64)
    expect(buf.read()).toBe('')
  })

  it('stores and reads small data', () => {
    const buf = new RingBuffer(64)
    buf.write('hello')
    expect(buf.read()).toBe('hello')
  })

  it('appends multiple writes', () => {
    const buf = new RingBuffer(64)
    buf.write('hello ')
    buf.write('world')
    expect(buf.read()).toBe('hello world')
  })

  it('wraps around when buffer is full', () => {
    const buf = new RingBuffer(10)
    buf.write('abcdefghij') // exactly fills buffer
    buf.write('XY')         // overwrites first 2 bytes
    const result = buf.read()
    expect(result).toBe('cdefghijXY')
  })

  it('handles data larger than buffer', () => {
    const buf = new RingBuffer(5)
    buf.write('abcdefghij') // 10 bytes > 5 byte buffer
    const result = buf.read()
    expect(result).toBe('fghij') // keeps last 5 bytes
  })

  it('handles exact buffer size write', () => {
    const buf = new RingBuffer(5)
    buf.write('abcde')
    expect(buf.read()).toBe('abcde')
  })

  it('handles multiple wraparounds', () => {
    const buf = new RingBuffer(8)
    buf.write('abcd')    // [a,b,c,d,_,_,_,_]
    buf.write('efgh')    // [a,b,c,d,e,f,g,h]
    buf.write('ij')      // [i,j,c,d,e,f,g,h] -> reads as "cdefghij"
    const result = buf.read()
    expect(result).toBe('cdefghij')
  })

  it('clears the buffer', () => {
    const buf = new RingBuffer(64)
    buf.write('hello')
    buf.clear()
    expect(buf.read()).toBe('')
  })

  it('works after clear and rewrite', () => {
    const buf = new RingBuffer(64)
    buf.write('first')
    buf.clear()
    buf.write('second')
    expect(buf.read()).toBe('second')
  })

  it('handles Buffer input', () => {
    const buf = new RingBuffer(64)
    buf.write(Buffer.from('binary data'))
    expect(buf.read()).toBe('binary data')
  })

  it('handles empty string write', () => {
    const buf = new RingBuffer(64)
    buf.write('')
    expect(buf.read()).toBe('')
  })

  it('preserves content across many small writes', () => {
    const buf = new RingBuffer(20)
    for (let i = 0; i < 10; i++) {
      buf.write(`${i}`)
    }
    // Buffer holds "0123456789" which is 10 chars, fits in 20
    expect(buf.read()).toBe('0123456789')
  })
})

describe('Session Buffer Management', () => {
  // Clean up between tests to avoid cross-test pollution
  afterEach(() => {
    removeSessionBuffer('test-session-1')
    removeSessionBuffer('test-session-2')
    removeSessionBuffer('session-a')
    removeSessionBuffer('session-b')
    removeSessionBuffer('removable')
  })

  it('creates buffer on first access', () => {
    const buf = getSessionBuffer('test-session-1')
    expect(buf).toBeInstanceOf(RingBuffer)
  })

  it('returns same buffer for same session', () => {
    const buf1 = getSessionBuffer('test-session-2')
    const buf2 = getSessionBuffer('test-session-2')
    expect(buf1).toBe(buf2)
  })

  it('returns different buffers for different sessions', () => {
    const buf1 = getSessionBuffer('session-a')
    const buf2 = getSessionBuffer('session-b')
    expect(buf1).not.toBe(buf2)
  })

  it('removes buffer', () => {
    const buf1 = getSessionBuffer('removable')
    buf1.write('data')
    removeSessionBuffer('removable')
    const buf2 = getSessionBuffer('removable')
    expect(buf2.read()).toBe('') // new empty buffer
    expect(buf1).not.toBe(buf2)
  })
})
