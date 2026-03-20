import { useState, useEffect } from 'react'
import { X, Plus, FolderOpen, Bookmark } from 'lucide-react'

interface Template {
  id: number
  name: string
  command: string
  cwd: string
  icon: string
  category: string
}

const DEFAULT_PRESETS: Template[] = [
  { id: -1, name: 'Claude Code', command: 'claude', cwd: '~', icon: '🤖', category: 'default' },
  { id: -2, name: 'Claude (Plan)', command: 'claude --plan', cwd: '~', icon: '📋', category: 'default' },
  { id: -3, name: 'Bash', command: 'bash', cwd: '~', icon: '💻', category: 'default' },
]

interface Props {
  onClose: () => void
  onCreate: (name: string, command: string, cwd: string) => void
}

export default function NewSessionModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('claude')
  const [cwd, setCwd] = useState('')
  const [picking, setPicking] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedId, setSelectedId] = useState(-1)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((data: Template[]) => setTemplates(data))
      .catch(() => {})
  }, [])

  const allPresets = [...DEFAULT_PRESETS, ...templates]

  async function handlePickFolder() {
    setPicking(true)
    try {
      const res = await fetch('/api/pick-folder')
      const data = await res.json()
      if (data.path) setCwd(data.path)
    } catch { /* ignore */ }
    setPicking(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !command.trim()) return
    onCreate(name.trim(), command.trim(), cwd.trim() || '~')
  }

  async function handleSaveTemplate() {
    if (!templateName.trim() || !command.trim()) return
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: templateName.trim(), command: command.trim(), cwd: cwd.trim() || '~', icon: '🔧' }),
    })
    if (res.ok) {
      const tmpl = await res.json()
      setTemplates((prev) => [...prev, tmpl])
      setShowSaveTemplate(false)
      setTemplateName('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">New Session</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Presets + Templates */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Agent Type</label>
            <div className="grid grid-cols-4 gap-2">
              {allPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(preset.id)
                    setCommand(preset.command)
                    if (preset.cwd !== '~') setCwd(preset.cwd)
                  }}
                  className={`rounded-lg border px-3 py-2 text-center text-xs transition-all ${
                    selectedId === preset.id
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <div className="text-lg">{preset.icon}</div>
                  <div className="mt-1 truncate">{preset.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Session Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-feature-work"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Command */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Command</label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="claude"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Working Directory */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Working Directory</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="~/projects/my-project"
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handlePickFolder}
                disabled={picking}
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-400 hover:border-gray-600 hover:text-gray-200 disabled:opacity-50"
                title="Browse folder"
              >
                <FolderOpen className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Save as Template */}
          {showSaveTemplate ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name..."
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={!templateName.trim()}
                className="rounded-lg bg-gray-700 px-3 py-2 text-xs text-gray-300 hover:bg-gray-600 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowSaveTemplate(false)}
                className="rounded-lg px-2 py-2 text-xs text-gray-500 hover:text-gray-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSaveTemplate(true)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300"
            >
              <Bookmark className="h-3 w-3" />
              Save as template
            </button>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !command.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Create Session
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
