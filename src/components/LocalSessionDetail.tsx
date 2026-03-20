import { Monitor, Clock, MapPin, Wifi, WifiOff, Laptop } from 'lucide-react'
import type { Session } from '../types'
import SessionTimeline from './SessionTimeline'

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  active: { color: 'text-green-400', bg: 'bg-green-500/20', label: 'Active' },
  idle: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Idle' },
  waiting: { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Waiting for input' },
  stopped: { color: 'text-gray-500', bg: 'bg-gray-500/20', label: 'Stopped' },
  dead: { color: 'text-gray-500', bg: 'bg-gray-500/20', label: 'Dead' },
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return `${h}h ${m}m ago`
}

interface Props {
  session: Session
}

export default function LocalSessionDetail({ session }: Props) {
  const cfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.dead

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800">
            <Laptop className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-100">{session.name}</h2>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}>
              {session.status === 'active' ? (
                <Wifi className="h-3 w-3" />
              ) : session.status === 'stopped' ? (
                <WifiOff className="h-3 w-3" />
              ) : (
                <Monitor className="h-3 w-3" />
              )}
              {cfg.label}
            </span>
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-3 px-6 py-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <MapPin className="h-3 w-3" />
            Working Directory
          </div>
          <p className="font-mono text-sm text-gray-300 truncate" title={session.cwd}>
            {session.cwd}
          </p>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Clock className="h-3 w-3" />
            Started
          </div>
          <p className="text-sm text-gray-300">{formatTime(session.created)}</p>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Wifi className="h-3 w-3" />
            Last Heartbeat
          </div>
          <p className="text-sm text-gray-300">{formatDuration(session.idleSecs)}</p>
        </div>

        {session.sessionId && (
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3">
            <div className="text-xs text-gray-500 mb-1">Session ID</div>
            <p className="font-mono text-xs text-gray-400 truncate" title={session.sessionId}>
              {session.sessionId}
            </p>
          </div>
        )}
      </div>

      {/* Note about local sessions */}
      <div className="mx-6 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
        <p className="text-xs text-blue-400">
          This is a local Claude Code session registered via hooks. Terminal view is only available for tmux sessions created on the server.
        </p>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Event Timeline</h3>
        <div className="rounded-lg border border-gray-800 bg-gray-900/50">
          <SessionTimeline sessionName={session.name} />
        </div>
      </div>
    </div>
  )
}
