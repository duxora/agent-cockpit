import { useState, useEffect } from 'react'
import { Clock, AlertTriangle, Play, Square, Zap } from 'lucide-react'

interface TimelineEvent {
  id: number
  sessionName: string
  eventType: string
  data: string | null
  createdAt: number
}

interface Props {
  sessionName: string
}

const EVENT_ICONS: Record<string, { icon: typeof Clock; color: string }> = {
  created: { icon: Play, color: 'text-green-400' },
  killed: { icon: Square, color: 'text-red-400' },
  waiting: { icon: AlertTriangle, color: 'text-yellow-400' },
  heartbeat: { icon: Zap, color: 'text-blue-400' },
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function SessionTimeline({ sessionName }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([])

  useEffect(() => {
    fetch(`/api/sessions/${encodeURIComponent(sessionName)}/logs?limit=50`)
      .then((r) => r.json())
      .then(setEvents)
      .catch(() => {})

    const interval = setInterval(() => {
      fetch(`/api/sessions/${encodeURIComponent(sessionName)}/logs?limit=50`)
        .then((r) => r.json())
        .then(setEvents)
        .catch(() => {})
    }, 5000)

    return () => clearInterval(interval)
  }, [sessionName])

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-600 text-xs">
        No events recorded
      </div>
    )
  }

  return (
    <div className="space-y-1 py-2">
      {events.map((event) => {
        const cfg = EVENT_ICONS[event.eventType] || { icon: Clock, color: 'text-gray-500' }
        const Icon = cfg.icon
        let detail = ''
        if (event.data) {
          try {
            const parsed = JSON.parse(event.data)
            detail = parsed.command || parsed.tool || parsed.message || event.data
          } catch {
            detail = event.data
          }
        }

        return (
          <div key={event.id} className="flex items-start gap-2 px-3 py-1">
            <Icon className={`h-3 w-3 mt-0.5 ${cfg.color}`} />
            <div className="flex-1 min-w-0">
              <span className="text-xs text-gray-300">{event.eventType}</span>
              {detail && (
                <span className="ml-2 text-xs text-gray-500 truncate">{detail}</span>
              )}
            </div>
            <span className="text-[10px] text-gray-600 whitespace-nowrap">
              {formatTimestamp(event.createdAt)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
