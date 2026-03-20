import { Monitor, Clock, Trash2, Terminal, AlertTriangle, Circle, Radio } from 'lucide-react'
import type { Session } from '../types'

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; pulse: boolean }> = {
  active: { color: 'text-green-400', bg: 'bg-green-500/20', label: 'Active', pulse: false },
  idle: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Idle', pulse: false },
  waiting: { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Waiting', pulse: true },
  dead: { color: 'text-gray-500', bg: 'bg-gray-500/20', label: 'Dead', pulse: false },
  stopped: { color: 'text-gray-500', bg: 'bg-gray-500/20', label: 'Stopped', pulse: false },
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return `${h}h ${m}m`
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  session: Session
  isSelected: boolean
  onSelect: () => void
  onKill: () => void
  onSendKeys?: (keys: string) => void
}

export default function SessionCard({ session, isSelected, onSelect, onKill, onSendKeys }: Props) {
  const cfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.dead
  const isLocal = session.source === 'local'

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-lg border p-4 transition-all hover:border-blue-500/50 ${
        isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-gray-700 bg-gray-900 hover:bg-gray-800/50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-gray-400" />
          <span className="font-mono text-sm font-medium text-gray-100">{session.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}>
            <Circle className={`h-2 w-2 fill-current ${cfg.pulse ? 'animate-pulse' : ''}`} />
            {cfg.label}
          </span>
          {isLocal && (
            <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
              session.relayConnected
                ? 'bg-green-900/30 text-green-400'
                : 'bg-gray-700 text-gray-400'
            }`}>
              {session.relayConnected && <Radio className="h-2.5 w-2.5" />}
              {session.relayConnected ? 'Relay' : 'Local'}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onKill()
            }}
            className="rounded p-1 text-gray-500 hover:bg-red-500/20 hover:text-red-400"
            title="Kill session"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Started {formatTime(session.created)}
        </span>
        <span>
          Idle {formatDuration(session.idleSecs)}
        </span>
        {session.attached && (
          <span className="flex items-center gap-1 text-blue-400">
            <Terminal className="h-3 w-3" />
            Attached
          </span>
        )}
      </div>

      <div className="mt-2 truncate font-mono text-xs text-gray-600">
        {session.cwd}
      </div>

      {session.status === 'waiting' && (
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertTriangle className="h-3 w-3" />
            Needs your attention
          </div>
          {session.source === 'tmux' && onSendKeys && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); onSendKeys('y\n') }}
                className="rounded bg-green-600/20 px-2 py-0.5 text-xs font-medium text-green-400 hover:bg-green-600/30"
              >
                Yes
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onSendKeys('n\n') }}
                className="rounded bg-red-600/20 px-2 py-0.5 text-xs font-medium text-red-400 hover:bg-red-600/30"
              >
                No
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onSendKeys('\n') }}
                className="rounded bg-gray-600/20 px-2 py-0.5 text-xs font-medium text-gray-400 hover:bg-gray-600/30"
                title="Send Enter"
              >
                Enter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
