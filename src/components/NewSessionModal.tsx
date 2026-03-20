import { useState } from 'react'
import { X, Plus } from 'lucide-react'

const PRESETS = [
  { label: 'Claude Code', command: 'claude', icon: '🤖' },
  { label: 'Claude (Plan)', command: 'claude --plan', icon: '📋' },
  { label: 'Bash', command: 'bash', icon: '💻' },
  { label: 'Custom', command: '', icon: '⚙️' },
]

interface Props {
  onClose: () => void
  onCreate: (name: string, command: string, cwd: string) => void
}

export default function NewSessionModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('claude')
  const [cwd, setCwd] = useState('')
  const [selectedPreset, setSelectedPreset] = useState(0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !command.trim()) return
    onCreate(name.trim(), command.trim(), cwd.trim() || '~')
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
          {/* Presets */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Agent Type</label>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((preset, i) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setSelectedPreset(i)
                    if (preset.command) setCommand(preset.command)
                  }}
                  className={`rounded-lg border px-3 py-2 text-center text-xs transition-all ${
                    selectedPreset === i
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <div className="text-lg">{preset.icon}</div>
                  <div className="mt-1">{preset.label}</div>
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
            <input
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="~/projects/my-project"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

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
