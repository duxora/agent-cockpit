import { useEffect, useState } from 'react'
import TextLog from './TextLog'

interface ShareMetadata {
  sessionId: string
  accessLevel: 'read' | 'interactive'
  requiresPassword: boolean
  sessionActive: boolean
}

interface SharedSessionViewProps {
  shareId?: string
  token?: string
}

export default function SharedSessionView({ shareId, token }: SharedSessionViewProps) {
  // Get URL parameters if not passed as props
  const urlShareId = shareId || new URLSearchParams(window.location.search).get('shareId')
  const urlToken = token || new URLSearchParams(window.location.search).get('token')

  const [shareMetadata, setShareMetadata] = useState<ShareMetadata | null>(null)
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [outputs, setOutputs] = useState<string[]>([])
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null)

  // Validate share on mount
  useEffect(() => {
    const validateShare = async () => {
      if (!urlShareId || !urlToken) {
        setError('Invalid share link')
        return
      }

      try {
        const res = await fetch(`/api/share/${urlShareId}?token=${urlToken}`)
        if (!res.ok) {
          setError('Invalid or expired link')
          return
        }

        const metadata = await res.json()
        setShareMetadata(metadata)

        if (!metadata.requiresPassword) {
          setAuthenticated(true)
        }
      } catch (err) {
        setError('Failed to validate share')
      }
    }

    validateShare()
  }, [urlShareId, urlToken])

  // Set up auto-refresh of outputs every 2 seconds
  useEffect(() => {
    if (authenticated && urlShareId && urlToken) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/share/${urlShareId}/outputs?token=${urlToken}`)
          if (res.ok) {
            const data = await res.json()
            setOutputs(data.outputs || [])
          }
        } catch (err) {
          console.error('Failed to refresh outputs:', err)
        }
      }, 2000)

      setRefreshInterval(interval)

      return () => {
        if (interval) clearInterval(interval)
      }
    }
  }, [authenticated, urlShareId, urlToken])

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || !urlShareId || !urlToken) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/share/${urlShareId}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: urlToken, password, prompt: 'VALIDATE' })
      })

      if (!res.ok) {
        setError('Invalid password')
        setLoading(false)
        return
      }

      setAuthenticated(true)
      setPassword('')
    } catch (err) {
      setError('Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSendPrompt = async () => {
    if (!prompt || !shareMetadata || !urlShareId || !urlToken) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/share/${urlShareId}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: urlToken, password, prompt })
      })

      if (!res.ok) {
        setError('Failed to send prompt')
        return
      }

      setPrompt('')
      setOutputs([...outputs, `> ${prompt}`, 'Prompt submitted'])
    } catch (err) {
      setError('Failed to send prompt')
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="bg-red-900 text-red-100 p-6 rounded-lg max-w-md">
          <h2 className="font-bold mb-2">Error</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (!shareMetadata) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <p className="text-gray-400">Loading share...</p>
      </div>
    )
  }

  if (!authenticated && shareMetadata.requiresPassword) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <form
          onSubmit={handlePasswordSubmit}
          className="bg-gray-800 p-6 rounded-lg max-w-md w-full"
        >
          <h2 className="text-xl font-bold mb-4">Enter Password</h2>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-gray-700 text-white px-3 py-2 rounded mb-4"
          />
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white py-2 rounded"
          >
            {loading ? 'Verifying...' : 'Access'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">Shared Session</h1>
        <p className="text-gray-400 text-sm">
          Status: {shareMetadata.sessionActive ? '🟢 Active' : '🔴 Offline'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {outputs.length === 0 ? (
          <p className="text-gray-400">Session outputs will appear here...</p>
        ) : (
          <TextLog outputs={outputs} maxHeight={window.innerHeight - 200} />
        )}
      </div>

      {error && (
        <div className="bg-red-900 text-red-100 p-2 m-4 rounded text-sm">
          {error}
        </div>
      )}

      {shareMetadata.accessLevel === 'interactive' && shareMetadata.sessionActive && (
        <div className="bg-gray-800 p-4 border-t border-gray-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendPrompt()}
              placeholder="Send prompt..."
              className="flex-1 bg-gray-700 text-white px-3 py-2 rounded"
            />
            <button
              onClick={handleSendPrompt}
              disabled={loading || !prompt}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
