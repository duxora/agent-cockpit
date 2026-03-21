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
