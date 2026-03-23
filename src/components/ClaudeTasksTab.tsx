import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, CheckCircle, Clock, AlertCircle } from 'lucide-react'

interface InProgressTask {
  title: string
  started_at: string
}

interface SyncStatus {
  session_id: string | null
  status: 'connected' | 'offline' | 'syncing'
  last_sync: string
  pending_count: number
  completed_today: number
  in_progress: InProgressTask | null
  active_channel_sessions: number
}

export default function ClaudeTasksTab() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSyncStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/channel/sync/status')
      if (response.ok) {
        const data = await response.json()
        setSyncStatus(data)
      }
    } catch (error) {
      console.error('Failed to fetch sync status:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSyncStatus()
    const interval = setInterval(fetchSyncStatus, 15000)
    return () => clearInterval(interval)
  }, [fetchSyncStatus])

  if (loading) {
    return <div className="p-6 text-gray-400">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* Session Status Bar */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-100">Claude Session Status</h3>
            <div className="mt-2 flex items-center gap-2">
              {/* Status config */}
              {(() => {
                const statusConfig: Record<string, { color: string; label: string }> = {
                  connected: { color: 'bg-green-500', label: 'Connected ✓' },
                  idle: { color: 'bg-yellow-500', label: 'Idle' },
                  syncing: { color: 'bg-blue-500', label: 'Syncing' },
                  offline: { color: 'bg-gray-500', label: 'Offline ✗' },
                }
                const currentStatus = syncStatus?.status ?? 'offline'
                const current = statusConfig[currentStatus] || statusConfig.offline

                return (
                  <>
                    <div className={`w-2 h-2 rounded-full ${current.color}`} />
                    <span className="text-sm text-gray-400">{current.label}</span>
                    {(syncStatus?.active_channel_sessions ?? 0) > 0 && (
                      <span className="ml-2 text-xs text-gray-500">
                        {syncStatus!.active_channel_sessions} session
                        {syncStatus!.active_channel_sessions !== 1 ? 's' : ''}
                      </span>
                    )}
                  </>
                )
              })()}
              <span className="ml-4 text-xs text-gray-500">
                Last sync:{' '}
                {syncStatus?.last_sync
                  ? new Date(syncStatus.last_sync).toLocaleTimeString()
                  : 'Never'}
              </span>
            </div>
          </div>
          <button
            onClick={fetchSyncStatus}
            aria-label="Refresh"
            className="rounded p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">Pending Tasks</p>
              <p className="mt-2 text-2xl font-bold text-gray-100">
                {syncStatus?.pending_count ?? 0}
              </p>
            </div>
            <Clock className="h-6 w-6 text-gray-600" />
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">Completed Today</p>
              <p className="mt-2 text-2xl font-bold text-gray-100">
                {syncStatus?.completed_today ?? 0}
              </p>
            </div>
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">In Progress</p>
              <p className="mt-2 text-2xl font-bold text-gray-100">
                {syncStatus?.in_progress ? 1 : 0}
              </p>
            </div>
            <AlertCircle className="h-6 w-6 text-yellow-600" />
          </div>
        </div>
      </div>

      {/* Currently Executing */}
      {syncStatus?.in_progress && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-100">Currently Executing</h4>
          <div className="space-y-2">
            <p className="text-sm text-gray-300">{syncStatus.in_progress.title}</p>
            <p className="text-xs text-gray-500">
              Started: {new Date(syncStatus.in_progress.started_at).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
