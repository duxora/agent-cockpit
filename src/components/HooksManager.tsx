import { useState, useEffect } from 'react'
import { Trash2, Plus, Edit2 } from 'lucide-react'

interface Hook {
  id: number
  hook_type: 'pre-session' | 'post-session'
  trigger: 'on-start' | 'on-end' | 'manual'
  name: string
  command: string
  enabled: boolean
  created_at: number
}

export function HooksManager() {
  const [hooks, setHooks] = useState<Hook[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    hook_type: 'pre-session' as const,
    trigger: 'on-start' as const,
    command: ''
  })

  useEffect(() => {
    fetchHooks()
  }, [])

  const fetchHooks = async () => {
    try {
      const res = await fetch('/api/hooks')
      const data = await res.json()
      setHooks(data)
    } catch (error) {
      console.error('Failed to fetch hooks:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (editingId) {
        await fetch(`/api/hooks/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
      } else {
        await fetch('/api/hooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
      }
      setFormData({ name: '', hook_type: 'pre-session', trigger: 'on-start', command: '' })
      setEditingId(null)
      setShowForm(false)
      fetchHooks()
    } catch (error) {
      console.error('Failed to save hook:', error)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this hook?')) return

    try {
      await fetch(`/api/hooks/${id}`, { method: 'DELETE' })
      fetchHooks()
    } catch (error) {
      console.error('Failed to delete hook:', error)
    }
  }

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await fetch(`/api/hooks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled })
      })
      fetchHooks()
    } catch (error) {
      console.error('Failed to toggle hook:', error)
    }
  }

  const handleEdit = (hook: Hook) => {
    setEditingId(hook.id)
    setFormData({
      name: hook.name,
      hook_type: hook.hook_type,
      trigger: hook.trigger,
      command: hook.command
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setFormData({ name: '', hook_type: 'pre-session', trigger: 'on-start', command: '' })
  }

  if (loading) return <div className="p-4 text-gray-400">Loading hooks...</div>

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-100">Session Hooks</h2>
        <button
          onClick={() => {
            if (showForm) {
              handleCancel()
            } else {
              setShowForm(true)
            }
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={18} /> Add Hook
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 p-4 rounded space-y-3">
          <input
            type="text"
            placeholder="Hook name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-700 rounded bg-gray-800 text-gray-100 placeholder-gray-500"
            required
          />
          <select
            value={formData.hook_type}
            onChange={(e) => setFormData({ ...formData, hook_type: e.target.value as any })}
            className="w-full px-3 py-2 border border-gray-700 rounded bg-gray-800 text-gray-100"
          >
            <option value="pre-session">Pre-session (before)</option>
            <option value="post-session">Post-session (after)</option>
          </select>
          <select
            value={formData.trigger}
            onChange={(e) => setFormData({ ...formData, trigger: e.target.value as any })}
            className="w-full px-3 py-2 border border-gray-700 rounded bg-gray-800 text-gray-100"
          >
            <option value="on-start">On start</option>
            <option value="on-end">On end</option>
            <option value="manual">Manual</option>
          </select>
          <textarea
            placeholder="Command"
            value={formData.command}
            onChange={(e) => setFormData({ ...formData, command: e.target.value })}
            className="w-full px-3 py-2 border border-gray-700 rounded bg-gray-800 text-gray-100 font-mono text-sm placeholder-gray-500"
            required
          />
          <div className="flex gap-2">
            <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
              {editingId ? 'Update' : 'Create'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {hooks.length === 0 && !loading && (
          <div className="text-gray-500 text-center py-8">No hooks configured yet</div>
        )}
        {hooks.map((hook) => (
          <div key={hook.id} className="bg-gray-900 border border-gray-800 p-4 rounded flex justify-between items-start hover:border-gray-700 transition">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hook.enabled}
                  onChange={() => handleToggle(hook.id, hook.enabled)}
                  className="w-5 h-5"
                />
                <h3 className="font-bold text-gray-100">{hook.name}</h3>
                <span className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded">{hook.hook_type}</span>
                <span className="text-xs bg-purple-900 text-purple-200 px-2 py-1 rounded">{hook.trigger}</span>
              </div>
              <code className="text-sm text-gray-400 block mt-2 break-all">{hook.command}</code>
            </div>
            <div className="flex gap-2 ml-4">
              <button
                onClick={() => handleEdit(hook)}
                className="text-blue-400 hover:text-blue-300"
                title="Edit"
              >
                <Edit2 size={18} />
              </button>
              <button
                onClick={() => handleDelete(hook.id)}
                className="text-red-400 hover:text-red-300"
                title="Delete"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default HooksManager
