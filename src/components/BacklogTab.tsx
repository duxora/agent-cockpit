import { useEffect, useState, useCallback } from 'react'
import {
  RefreshCw,
  Search,
  ChevronRight,
  ChevronDown,
  GitBranch,
  ExternalLink,
  FileText,
  Calendar,
  User,
  Clock,
} from 'lucide-react'

// --- Types ---

interface ProjectStats {
  id: string
  name: string
  repoPath: string | null
  stats: { open: number; inProgress: number; done: number; deferred: number }
}

interface Task {
  id: number
  projectId: string
  title: string
  description: string | null
  type: string
  priority: string
  status: string
  domain: string | null
  specPath: string | null
  prNumber: number | null
  branch: string | null
  supersedes: number | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  dueDate: string | null
}

interface TaskDetail extends Task {
  notes: { id: number; content: string; addedBy: string | null; createdAt: string }[]
  history: {
    id: number
    field: string
    oldValue: string | null
    newValue: string | null
    changedBy: string | null
    changedAt: string
  }[]
  claim: {
    agent: string
    sessionId: string | null
    claimedAt: string
    heartbeatAt: string
  } | null
}

// --- Constants ---

const STATUSES = ['open', 'in_progress', 'done', 'deferred', 'cancelled'] as const
const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  in_progress: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  done: { bg: 'bg-green-500/20', text: 'text-green-400' },
  deferred: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400' },
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-500/20', text: 'text-red-400' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  medium: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  low: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
}

const TYPE_ICONS: Record<string, string> = {
  bug: '\u{1F41B}',
  feature: '\u{2728}',
  task: '\u{1F4CB}',
  chore: '\u{1F527}',
}

// --- Helpers ---

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// --- Component ---

export default function BacklogTab() {
  const [projects, setProjects] = useState<ProjectStats[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [domains, setDomains] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null)
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Filters
  const [searchText, setSearchText] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(
    new Set(['open', 'in_progress'])
  )
  const [selectedPriorities, setSelectedPriorities] = useState<Set<string>>(new Set())
  const [selectedDomain, setSelectedDomain] = useState<string>('')

  // --- Data fetching ---

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/backlog/projects')
      if (res.ok) {
        const data: ProjectStats[] = await res.json()
        setProjects(data)
        if (data.length > 0 && !selectedProject) {
          setSelectedProject(data[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err)
    }
  }, [selectedProject])

  const fetchTasks = useCallback(async () => {
    if (!selectedProject) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('project', selectedProject)
      if (selectedStatuses.size > 0) params.set('status', [...selectedStatuses].join(','))
      if (selectedPriorities.size > 0) params.set('priority', [...selectedPriorities].join(','))
      if (selectedDomain) params.set('domain', selectedDomain)
      if (searchText.trim()) params.set('search', searchText.trim())

      const res = await fetch(`/api/backlog/tasks?${params}`)
      if (res.ok) {
        const data: Task[] = await res.json()
        setTasks(data)
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedProject, selectedStatuses, selectedPriorities, selectedDomain, searchText])

  const fetchDomains = useCallback(async () => {
    if (!selectedProject) return
    try {
      const res = await fetch(`/api/backlog/domains?project=${encodeURIComponent(selectedProject)}`)
      if (res.ok) {
        const data: string[] = await res.json()
        setDomains(data)
      }
    } catch (err) {
      console.error('Failed to fetch domains:', err)
    }
  }, [selectedProject])

  const fetchTaskDetail = useCallback(async (taskId: number) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/backlog/tasks/${taskId}`)
      if (res.ok) {
        const data: TaskDetail = await res.json()
        setTaskDetail(data)
      }
    } catch (err) {
      console.error('Failed to fetch task detail:', err)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  // --- Effects ---

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    if (selectedProject) {
      fetchTasks()
      fetchDomains()
    }
  }, [selectedProject, fetchTasks, fetchDomains])

  // --- Handlers ---

  const toggleStatus = (status: string) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const togglePriority = (priority: string) => {
    setSelectedPriorities((prev) => {
      const next = new Set(prev)
      if (next.has(priority)) next.delete(priority)
      else next.add(priority)
      return next
    })
  }

  const handleRowClick = (taskId: number) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null)
      setTaskDetail(null)
    } else {
      setExpandedTaskId(taskId)
      fetchTaskDetail(taskId)
    }
  }

  const handleRefresh = () => {
    fetchProjects()
    fetchTasks()
    fetchDomains()
  }

  const currentProject = projects.find((p) => p.id === selectedProject)

  // --- Render ---

  return (
    <div className="space-y-4">
      {/* Project selector + stats header */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedProject}
          onChange={(e) => {
            setSelectedProject(e.target.value)
            setExpandedTaskId(null)
            setTaskDetail(null)
          }}
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {currentProject && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
              {currentProject.stats.open} open
            </span>
            <span className="inline-flex items-center rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
              {currentProject.stats.inProgress} in progress
            </span>
            <span className="inline-flex items-center rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
              {currentProject.stats.done} done
            </span>
          </div>
        )}

        <button
          onClick={handleRefresh}
          aria-label="Refresh"
          className="ml-auto rounded p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Filter bar */}
      <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 py-1.5 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Status:</span>
          {STATUSES.map((s) => {
            const active = selectedStatuses.has(s)
            const colors = STATUS_COLORS[s]
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  active
                    ? `${colors.bg} ${colors.text}`
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}
              >
                {s.replace('_', ' ')}
              </button>
            )
          })}
        </div>

        {/* Priority chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Priority:</span>
          {PRIORITIES.map((p) => {
            const active = selectedPriorities.has(p)
            const colors = PRIORITY_COLORS[p]
            return (
              <button
                key={p}
                onClick={() => togglePriority(p)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  active
                    ? `${colors.bg} ${colors.text}`
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}
              >
                {p}
              </button>
            )
          })}

          {/* Domain dropdown */}
          {domains.length > 0 && (
            <>
              <span className="ml-4 text-xs text-gray-500">Domain:</span>
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="">All</option>
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {/* Task table */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-500">
              <th className="px-3 py-2 text-left font-medium">ID</th>
              <th className="px-3 py-2 text-left font-medium">Priority</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Title</th>
              <th className="px-3 py-2 text-left font-medium">Domain</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  No tasks found
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const isExpanded = expandedTaskId === task.id
                const pColors = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.low
                const sColors = STATUS_COLORS[task.status] ?? STATUS_COLORS.open

                return (
                  <>
                    <tr
                      key={task.id}
                      onClick={() => handleRowClick(task.id)}
                      className="cursor-pointer border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="px-3 py-2 text-xs text-gray-500">#{task.id}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${pColors.bg} ${pColors.text}`}
                        >
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sColors.bg} ${sColors.text}`}
                        >
                          {task.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-100">
                        <div className="flex items-center gap-1.5">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
                          )}
                          <span className="truncate">{task.title}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{task.domain ?? '-'}</td>
                      <td className="px-3 py-2 text-xs">
                        {TYPE_ICONS[task.type] ?? ''} {task.type}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {formatDate(task.createdAt)}
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr key={`${task.id}-detail`}>
                        <td colSpan={7} className="bg-gray-800/30 px-4 py-4">
                          {detailLoading ? (
                            <div className="text-sm text-gray-500">Loading details...</div>
                          ) : taskDetail && taskDetail.id === task.id ? (
                            <TaskDetailPanel detail={taskDetail} />
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="text-xs text-gray-500">
        {tasks.length} task{tasks.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

// --- Task Detail Panel ---

function TaskDetailPanel({ detail }: { detail: TaskDetail }) {
  return (
    <div className="space-y-4">
      {/* Description */}
      {detail.description && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-gray-400">Description</h4>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-700 bg-gray-900 p-3 font-mono text-xs text-gray-300">
            {detail.description}
          </pre>
        </div>
      )}

      {/* Metadata row */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-400">
        {detail.branch && (
          <div className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            <span>{detail.branch}</span>
          </div>
        )}
        {detail.prNumber && (
          <div className="flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            <span>PR #{detail.prNumber}</span>
          </div>
        )}
        {detail.specPath && (
          <div className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            <span>{detail.specPath}</span>
          </div>
        )}
        {detail.dueDate && (
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>Due: {formatDate(detail.dueDate)}</span>
          </div>
        )}
      </div>

      {/* Active claim banner */}
      {detail.claim && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
          <div className="flex items-center gap-2 text-xs text-yellow-400">
            <User className="h-3.5 w-3.5" />
            <span className="font-medium">
              Claimed by {detail.claim.agent}
            </span>
            {detail.claim.sessionId && (
              <span className="text-yellow-500/60">({detail.claim.sessionId})</span>
            )}
            <span className="ml-auto text-yellow-500/60">
              <Clock className="mr-1 inline h-3 w-3" />
              {formatDateTime(detail.claim.heartbeatAt)}
            </span>
          </div>
        </div>
      )}

      {/* Notes */}
      {detail.notes.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-gray-400">Notes</h4>
          <div className="space-y-2">
            {detail.notes.map((note) => (
              <div
                key={note.id}
                className="rounded-lg border border-gray-700 bg-gray-900 p-2.5 text-xs"
              >
                <div className="mb-1 flex items-center gap-2 text-gray-500">
                  {note.addedBy && <span className="font-medium text-gray-400">{note.addedBy}</span>}
                  <span>{formatDateTime(note.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-gray-300">{note.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History timeline */}
      {detail.history.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-gray-400">History</h4>
          <div className="space-y-1.5">
            {detail.history.map((h) => (
              <div key={h.id} className="flex items-start gap-2 text-xs">
                <span className="flex-shrink-0 text-gray-600">{formatDateTime(h.changedAt)}</span>
                <span className="text-gray-400">
                  <span className="font-medium text-gray-300">{h.field}</span>
                  {': '}
                  {h.oldValue && (
                    <span className="text-red-400/70 line-through">{h.oldValue}</span>
                  )}
                  {h.oldValue && h.newValue && ' \u2192 '}
                  {h.newValue && <span className="text-green-400/70">{h.newValue}</span>}
                  {h.changedBy && (
                    <span className="ml-1 text-gray-600">by {h.changedBy}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
