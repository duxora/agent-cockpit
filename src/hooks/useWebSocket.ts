import { useEffect, useRef, useCallback, useState } from 'react'

export function useWebSocket<T>(url: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const [data, setData] = useState<T | null>(null)
  const [connected, setConnected] = useState(false)
  const retryRef = useRef(1000) // Start at 1s
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}${url}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      retryRef.current = 1000 // Reset backoff on success
    }

    ws.onclose = () => {
      setConnected(false)
      // Exponential backoff: 1s, 2s, 4s, 8s, ... max 30s
      const delay = retryRef.current
      retryRef.current = Math.min(delay * 2, 30000)
      timerRef.current = setTimeout(connect, delay)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        setData(msg)
      } catch {
        // ignore
      }
    }
  }, [url])

  useEffect(() => {
    connect()

    // Ping keepalive every 25s to prevent idle disconnect
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 25000)

    return () => {
      clearInterval(pingInterval)
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  const send = useCallback((msg: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { data, connected, send }
}
