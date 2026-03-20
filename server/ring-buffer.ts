/**
 * Circular buffer for terminal output replay.
 * Keeps last N bytes of output per session for instant replay on reconnect.
 */
export class RingBuffer {
  private buffer: Buffer
  private writePos: number = 0
  private filled: boolean = false

  constructor(private maxSize: number = 1024 * 1024) { // 1MB default
    this.buffer = Buffer.alloc(maxSize)
  }

  write(data: string | Buffer): void {
    const buf = typeof data === 'string' ? Buffer.from(data) : data

    if (buf.length >= this.maxSize) {
      // Data larger than buffer — keep only the last maxSize bytes
      buf.copy(this.buffer, 0, buf.length - this.maxSize)
      this.writePos = 0
      this.filled = true
      return
    }

    const remaining = this.maxSize - this.writePos
    if (buf.length <= remaining) {
      buf.copy(this.buffer, this.writePos)
      this.writePos += buf.length
    } else {
      // Wrap around
      buf.copy(this.buffer, this.writePos, 0, remaining)
      buf.copy(this.buffer, 0, remaining)
      this.writePos = buf.length - remaining
      this.filled = true
    }

    if (this.writePos >= this.maxSize) {
      this.writePos = 0
      this.filled = true
    }
  }

  read(): string {
    if (!this.filled && this.writePos === 0) return ''

    if (!this.filled) {
      return this.buffer.subarray(0, this.writePos).toString()
    }

    // Read from writePos to end, then start to writePos
    const end = this.buffer.subarray(this.writePos)
    const start = this.buffer.subarray(0, this.writePos)
    return Buffer.concat([end, start]).toString()
  }

  clear(): void {
    this.writePos = 0
    this.filled = false
  }
}

// Per-session ring buffers
const sessionBuffers = new Map<string, RingBuffer>()

export function getSessionBuffer(sessionName: string): RingBuffer {
  let buf = sessionBuffers.get(sessionName)
  if (!buf) {
    buf = new RingBuffer()
    sessionBuffers.set(sessionName, buf)
  }
  return buf
}

export function removeSessionBuffer(sessionName: string): void {
  sessionBuffers.delete(sessionName)
}
