import { useState, useEffect, useCallback } from 'react'
import { X, Copy, Trash2 } from 'lucide-react'

interface SessionShareModalProps {
  sessionId: string
  isOpen: boolean
  onClose: () => void
}

interface Share {
  id: string
  accessLevel: 'read' | 'interactive'
  createdAt: number
  createdBy: string
  accessedAt?: number
}

export default function SessionShareModal({ sessionId, isOpen, onClose }: SessionShareModalProps) {
  const [password, setPassword] = useState('')
  const [accessLevel, setAccessLevel] = useState<'read' | 'interactive'>('read')
  const [shares, setShares] = useState<Share[] | undefined>()
  const [shareUrl, setShareUrl] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const loadShares = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/shares`)
      if (res.ok) {
        const data = await res.json()
        setShares(data.shares || [])
      } else {
        setShares([])
      }
    } catch (err) {
      console.error('Failed to load shares:', err)
      setShares([])
    }
  }, [sessionId])

  useEffect(() => {
    if (isOpen) {
      loadShares()
    }
  }, [isOpen, loadShares])

  if (!isOpen) return null

  const handleCreateShare = async () => {
    if (!password) {
      setError('Password required')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/sessions/${sessionId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, accessLevel })
      })

      if (!res.ok) {
        setError('Failed to create share')
        return
      }

      const data = await res.json()
      setShareUrl(data.url)
      setPassword('')

      // Refresh shares list
      loadShares()
    } catch (err) {
      setError('Error creating share')
    } finally {
      setLoading(false)
    }
  }

  const handleRevoke = async (shareId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/shares/${shareId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        loadShares()
      }
    } catch (err) {
      console.error('Failed to revoke share:', err)
    }
  }

  const handleCopyUrl = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Share Session</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="bg-red-900 text-red-100 p-2 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {shareUrl && (
          <div className="bg-green-900 text-green-100 p-3 rounded mb-4">
            <p className="text-sm mb-2">Share link created:</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 bg-green-800 text-white px-2 py-1 rounded text-xs font-mono"
              />
              <button
                onClick={handleCopyUrl}
                className="bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded"
                title="Copy to clipboard"
              >
                <Copy size={16} />
              </button>
            </div>
            <p className="text-xs mt-2 text-green-200">Share password separately for security</p>
          </div>
        )}

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full bg-gray-700 text-white px-3 py-2 rounded"
            />
          </div>

          <div>
            <label className="block text-sm mb-2">Access Level</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="accessLevel"
                  value="read"
                  checked={accessLevel === 'read'}
                  onChange={(e) => setAccessLevel(e.target.value as 'read' | 'interactive')}
                />
                <span className="text-sm">View Only</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="accessLevel"
                  value="interactive"
                  checked={accessLevel === 'interactive'}
                  onChange={(e) => setAccessLevel(e.target.value as 'read' | 'interactive')}
                />
                <span className="text-sm">Can Prompt</span>
              </label>
            </div>
          </div>
        </div>

        <button
          onClick={handleCreateShare}
          disabled={loading || !password}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white py-2 rounded"
        >
          {loading ? 'Creating...' : 'Create Share'}
        </button>

        <div className="mt-6 border-t border-gray-700 pt-4">
          <h3 className="text-sm font-semibold mb-2">Active Shares</h3>
          {!shares || shares.length === 0 ? (
            <p className="text-gray-400 text-sm">No active shares</p>
          ) : (
            <div className="space-y-2">
              {shares.map((share) => (
                <div key={share.id} className="flex justify-between items-center bg-gray-700 p-2 rounded text-sm">
                  <span>{share.accessLevel === 'read' ? '👁️ View' : '💬 Prompt'} • {share.createdBy}</span>
                  <button
                    onClick={() => handleRevoke(share.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
