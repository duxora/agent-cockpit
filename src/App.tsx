import { useState, useEffect, useCallback } from 'react'
import { Plus, LayoutGrid, Rows3, RefreshCw, Search, Settings } from 'lucide-react'
import SessionCard from './components/SessionCard'
import TerminalView from './components/TerminalView'
import LocalSessionDetail from './components/LocalSessionDetail'
import NewSessionModal from './components/NewSessionModal'
import SettingsModal from './components/SettingsModal'
import AdminPanel from './components/AdminPanel'
import LoginPage from './pages/LoginPage'
import { useWebSocket } from './hooks/useWebSocket'
import { useNotifications } from './hooks/useNotifications'
import type { Session } from './types'

interface User {
  email: string
  role: string
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<null | boolean>(null)
  const [user, setUser] = useState<null | User>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'split'>('grid')
  const [splitLayout, setSplitLayout] = useState<'1x2' | '2x2' | '1x3' | '2x3'>('2x2')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const userData = await response.json()
          setUser(userData)
          setIsAuthenticated(true)
        } else {
          setIsAuthenticated(false)
        }
      } catch {
        setIsAuthenticated(false)
      }
    }

    checkAuth()
  }, [])

  // WebSocket for real-time session updates
  const { data: wsMessage, connected } = useWebSocket<{ type: string; data: Session[] }>('/ws/events')

  // Browser push notifications for waiting sessions
  useNotifications(sessions)

  useEffect(() => {
    if (wsMessage?.type === 'sessions') {
      setSessions(wsMessage.data)

      // Update document title if any session is waiting
      const waiting = wsMessage.data.filter((s) => s.status === 'waiting')
      if (waiting.length > 0) {
        document.title = `(${waiting.length}) Agent Cockpit`
      } else {
        document.title = 'Agent Cockpit'
      }
    }
  }, [wsMessage])

  // Initial fetch
  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then(setSessions)
      .catch(() => {})
  }, [])

  const handleKill = useCallback(async (name: string, session?: Session) => {
    const id = session?.source === 'local' && session.sessionId ? session.sessionId : name
    const label = session?.source === 'local' ? 'Dismiss' : 'Kill'
    if (!confirm(`${label} session "${name}"?`)) return
    await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (selectedSession === (session?.sessionId || name)) setSelectedSession(null)
  }, [selectedSession])

  const handleCreate = useCallback(async (name: string, command: string, cwd: string) => {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, command, cwd }),
    })
    if (res.ok) {
      setShowNewModal(false)
      setSelectedSession(name)
    } else {
      const err = await res.json()
      alert(err.error || 'Failed to create session')
    }
  }, [])

  const handleSendKeys = useCallback(async (name: string, keys: string) => {
    await fetch(`/api/sessions/${encodeURIComponent(name)}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
    })
  }, [])

  const handleRefresh = useCallback(async () => {
    const res = await fetch('/api/sessions')
    const data = await res.json()
    setSessions(data)
  }, [])

  // Show loading spinner while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-700 border-t-blue-500" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />
  }

  const sortedSessions = [...sessions].sort((a, b) => {
    const priority: Record<string, number> = { waiting: 0, active: 1, idle: 2, stopped: 3, dead: 4 }
    const pa = priority[a.status] ?? 5
    const pb = priority[b.status] ?? 5
    if (pa !== pb) return pa - pb
    return b.lastActivity - a.lastActivity
  })

  const filteredSessions = sortedSessions.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return s.name.toLowerCase().includes(q) || s.cwd.toLowerCase().includes(q)
    }
    return true
  })

  const waitingCount = sessions.filter((s) => s.status === 'waiting').length
  const activeCount = sessions.filter((s) => s.status === 'active').length

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xl">🎛️</span>
          <h1 className="text-lg font-semibold text-gray-100">Agent Cockpit</h1>
          <div className="flex items-center gap-2 ml-4">
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-gray-500">{connected ? 'Live' : 'Offline'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats */}
          <div className="flex items-center gap-4 mr-4 text-xs">
            <span className="text-gray-500">
              <span className="text-gray-300 font-medium">{sessions.length}</span> sessions
            </span>
            {activeCount > 0 && (
              <span className="text-green-400">{activeCount} active</span>
            )}
            {waitingCount > 0 && (
              <span className="animate-pulse text-red-400">{waitingCount} waiting</span>
            )}
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-700">
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-l-lg p-1.5 ${viewMode === 'grid' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`rounded-r-lg p-1.5 ${viewMode === 'split' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <Rows3 className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={handleRefresh}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowAdmin(true)}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            title="Admin"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            New Session
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {viewMode === 'grid' ? (
          <>
            {/* Session list */}
            <div className="w-80 overflow-y-auto border-r border-gray-800">
              {/* Search & Filter */}
              <div className="sticky top-0 bg-gray-900 p-3 border-b border-gray-800 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search sessions..."
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 pl-8 pr-3 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex gap-1">
                  {(['all', 'waiting', 'active', 'idle'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setStatusFilter(filter)}
                      className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                        statusFilter === filter
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 space-y-3">
              {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-600">
                  <span className="text-4xl mb-3">🎛️</span>
                  <p className="text-sm">No sessions running</p>
                  <button
                    onClick={() => setShowNewModal(true)}
                    className="mt-3 text-sm text-blue-500 hover:text-blue-400"
                  >
                    Create one
                  </button>
                </div>
              ) : (
                filteredSessions.map((session) => (
                  <SessionCard
                    key={session.sessionId || session.name}
                    session={session}
                    isSelected={selectedSession === (session.sessionId || session.name)}
                    onSelect={() => setSelectedSession(session.sessionId || session.name)}
                    onKill={() => handleKill(session.name, session)}
                    onSendKeys={(keys) => handleSendKeys(session.name, keys)}
                  />
                ))
              )}
              </div>
            </div>

            {/* Detail / Terminal view */}
            <div className="flex-1 bg-[#0a0a0a]">
              {selectedSession ? (
                (() => {
                  const selected = sessions.find((s) => (s.sessionId || s.name) === selectedSession)
                  if (!selected) return <div className="flex h-full items-center justify-center text-gray-600"><p className="text-sm">Session not found</p></div>
                  if (selected.source === 'local' && selected.relayConnected) {
                    return <TerminalView sessionName={selected.sessionId || selected.name} />
                  }
                  if (selected.source === 'local') return <LocalSessionDetail session={selected} />
                  return <TerminalView sessionName={selected.name} />
                })()
              ) : (
                <div className="flex h-full items-center justify-center text-gray-600">
                  <p className="text-sm">Select a session to view details</p>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Split view - configurable grid */
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-1.5">
              <span className="text-xs text-gray-500">Layout:</span>
              {(['1x2', '2x2', '1x3', '2x3'] as const).map((layout) => (
                <button
                  key={layout}
                  onClick={() => setSplitLayout(layout)}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                    splitLayout === layout ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {layout}
                </button>
              ))}
            </div>
            <div className={`flex-1 grid gap-px bg-gray-800 ${
              splitLayout === '1x2' ? 'grid-cols-2 grid-rows-1' :
              splitLayout === '2x2' ? 'grid-cols-2 grid-rows-2' :
              splitLayout === '1x3' ? 'grid-cols-3 grid-rows-1' :
              'grid-cols-3 grid-rows-2'
            }`}>
              {(() => {
                const maxSlots = splitLayout === '1x2' ? 2 : splitLayout === '2x2' ? 4 : splitLayout === '1x3' ? 3 : 6
                const tmuxSessions = sortedSessions.filter((s) => s.source !== 'local')
                return tmuxSessions.slice(0, maxSlots).map((session) => (
                  <div key={session.name} className="bg-[#0a0a0a]">
                    <TerminalView sessionName={session.name} />
                  </div>
                ))
              })()}
              {sessions.length === 0 && (
                <div className="col-span-full flex h-full items-center justify-center text-gray-600">
                  <p className="text-sm">No sessions to display</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New session modal */}
      {showNewModal && (
        <NewSessionModal
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreate}
        />
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {/* Admin panel modal */}
      {showAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="h-screen w-screen max-h-screen max-w-full rounded-lg bg-gray-900 shadow-xl flex flex-col">
            <button
              onClick={() => setShowAdmin(false)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-200"
            >
              ✕
            </button>
            <AdminPanel />
          </div>
        </div>
      )}
    </div>
  )
}
