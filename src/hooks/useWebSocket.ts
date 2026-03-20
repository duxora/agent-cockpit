import { useEffect, useRef, useCallback, useState } from 'react'

export function useWebSocket<T>(url: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const [data, setData] = useState<T | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}${url}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      // Reconnect after 2s
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = null
        }
      }, 2000)
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        setData(msg)
      } catch {
        // ignore
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [url])

  const send = useCallback((msg: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { data, connected, send }
}
