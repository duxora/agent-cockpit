import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionName: string
}

export default function TerminalView({ sessionName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    // Create terminal
    const term = new Terminal({
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        cursor: '#3b82f6',
        selectionBackground: '#3b82f680',
        black: '#1e1e1e',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e5e5e5',
      },
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      cursorBlink: true,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal/${encodeURIComponent(sessionName)}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      // Send initial size to sync tmux pane dimensions
      const dims = fitAddon.proposeDimensions()
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
      }
    }
    ws.onclose = () => setConnected(false)

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'content') {
          term.clear()
          term.write(msg.data)
        } else if (msg.type === 'error') {
          term.writeln(`\r\n\x1b[31mError: ${msg.message}\x1b[0m`)
        } else if (msg.type === 'closed') {
          term.writeln(`\r\n\x1b[33mSession ended\x1b[0m`)
        }
      } catch {
        // ignore
      }
    }

    // Send keyboard input to server
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    // Handle resize — sync xterm and tmux pane dimensions
    const handleResize = () => {
      fitAddon.fit()
      if (ws.readyState === WebSocket.OPEN) {
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
        }
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      ws.close()
      term.dispose()
      termRef.current = null
      wsRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionName])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="font-mono text-sm text-gray-300">{sessionName}</span>
        </div>
        <span className="text-xs text-gray-500">
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <div ref={containerRef} className="flex-1 p-1" />
    </div>
  )
}
