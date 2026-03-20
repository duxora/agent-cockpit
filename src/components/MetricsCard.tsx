import { useEffect, useState } from 'react'
import { TrendingUp, Activity } from 'lucide-react'

interface Metric {
  cpu_percent?: number
  memory_mb?: number
  uptime_seconds?: number
  timestamp: number
}

export default function MetricsCard() {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [current, setCurrent] = useState<Metric | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchMetrics = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/railway/metrics')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setMetrics(data)
      if (data.length > 0) setCurrent(data[0])
    } catch {
      // Fail silently
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 60000)
    return () => clearInterval(interval)
  }, [])

  if (!current) return null

  const uptime = current.uptime_seconds ? Math.floor(current.uptime_seconds / 3600) : 0

  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
      <div className="text-center">
        <div className="flex items-center justify-center h-8 text-blue-400 mb-1">
          <Activity className="h-4 w-4" />
        </div>
        <p className="text-xs text-gray-600">CPU</p>
        <p className="text-sm font-medium text-gray-300">
          {current.cpu_percent?.toFixed(1) ?? '—'}%
        </p>
      </div>
      <div className="text-center">
        <div className="flex items-center justify-center h-8 text-purple-400 mb-1">
          <TrendingUp className="h-4 w-4" />
        </div>
        <p className="text-xs text-gray-600">Memory</p>
        <p className="text-sm font-medium text-gray-300">
          {current.memory_mb?.toFixed(0) ?? '—'}MB
        </p>
      </div>
      <div className="text-center">
        <div className="flex items-center justify-center h-8 text-green-400 mb-1">
          <TrendingUp className="h-4 w-4" />
        </div>
        <p className="text-xs text-gray-600">Uptime</p>
        <p className="text-sm font-medium text-gray-300">
          {uptime}h
        </p>
      </div>
    </div>
  )
}
