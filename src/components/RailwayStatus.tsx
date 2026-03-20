import { useEffect, useState } from 'react'
import { RefreshCw, Zap } from 'lucide-react'

interface Deployment {
  id: string
  railway_deployment_id: string
  status: string
  created_at: number
  branch?: string
  commit_sha?: string
}

export default function RailwayStatus() {
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDeployments = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/railway/deployments')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setDeployments(data)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDeployments()
    const interval = setInterval(fetchDeployments, 60000) // Poll every 60s
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-300">Deployments</h3>
        <button
          onClick={fetchDeployments}
          disabled={loading}
          className="rounded p-1 text-gray-500 hover:bg-gray-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-400 mb-3">{error}</div>
      )}

      <div className="space-y-2">
        {deployments.length === 0 ? (
          <p className="text-xs text-gray-600">No deployments found</p>
        ) : (
          deployments.slice(0, 5).map((d) => (
            <div key={d.railway_deployment_id} className="flex items-center justify-between rounded bg-gray-800/50 px-3 py-2">
              <div>
                <p className="text-xs font-medium text-gray-300">
                  {d.branch || 'unknown'}
                </p>
                <p className="text-[10px] text-gray-600">
                  {new Date(d.created_at * 1000).toLocaleDateString()}
                </p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded ${
                d.status === 'success' ? 'bg-green-500/20 text-green-400' :
                d.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                'bg-yellow-500/20 text-yellow-400'
              }`}>
                {d.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
