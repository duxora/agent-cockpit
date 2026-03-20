import { useState } from 'react'
import { X, Key, RefreshCw } from 'lucide-react'

interface Props {
  onClose: () => void
}

export default function SettingsModal({ onClose }: Props) {
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSaveToken() {
    if (!token.trim()) return
    if (!token.startsWith('sk-ant-oat')) {
      setMessage({ type: 'error', text: 'Token should start with sk-ant-oat' })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings/claude-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const data = await res.json()
      if (data.ok) {
        setMessage({ type: 'success', text: 'Token updated. Server will restart.' })
        setToken('')
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update token' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error' })
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">Settings</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Claude Auth Token */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-400">
              <Key className="h-3 w-3" />
              Claude Auth Token
            </label>
            <p className="mb-2 text-[10px] text-gray-600">
              Update CLAUDE_CODE_AUTH_TOKEN. Run `claude setup-token` locally to generate.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="sk-ant-oat01-..."
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-xs text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={handleSaveToken}
                disabled={saving || !token.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${saving ? 'animate-spin' : ''}`} />
                Update
              </button>
            </div>
            {message && (
              <p className={`mt-2 text-xs ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {message.text}
              </p>
            )}
          </div>

          {/* Notification Status */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              Browser Notifications
            </label>
            <p className="text-[10px] text-gray-600">
              {typeof Notification !== 'undefined'
                ? `Status: ${Notification.permission}`
                : 'Not supported in this browser'}
            </p>
            {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
              <button
                onClick={() => Notification.requestPermission()}
                className="mt-1 rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
              >
                Enable Notifications
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
