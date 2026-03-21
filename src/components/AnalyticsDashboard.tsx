import { useState, useEffect } from 'react'

interface Metric {
  model: string
  total_sessions: number
  avg_duration_ms: number
  total_tokens_used: number
  total_cost_usd: number
}

interface DailyMetric {
  date: string
  sessions: number
  tokens: number
}

export function AnalyticsDashboard() {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    fetchMetrics()
  }, [days])

  const fetchMetrics = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/analytics/metrics?days=${days}`)
      const data = await response.json()
      setMetrics(data.metrics || [])
      setDailyMetrics(data.daily || [])
    } catch (error) {
      console.error('Failed to fetch metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="p-4">Loading metrics...</div>

  const totalSessions = metrics.reduce((sum, m) => sum + m.total_sessions, 0)
  const avgDuration = metrics.length > 0
    ? Math.round(metrics[0].avg_duration_ms / 1000)
    : 0
  const totalTokens = metrics.reduce((sum, m) => sum + m.total_tokens_used, 0)
  const totalCost = metrics.reduce((sum, m) => sum + (m.total_cost_usd || 0), 0)

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Session Analytics</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setDays(7)}
            className={days === 7 ? 'font-bold bg-blue-100 px-3 py-1 rounded' : 'px-3 py-1 rounded hover:bg-gray-100'}
          >
            7d
          </button>
          <button
            onClick={() => setDays(30)}
            className={days === 30 ? 'font-bold bg-blue-100 px-3 py-1 rounded' : 'px-3 py-1 rounded hover:bg-gray-100'}
          >
            30d
          </button>
          <button
            onClick={() => setDays(90)}
            className={days === 90 ? 'font-bold bg-blue-100 px-3 py-1 rounded' : 'px-3 py-1 rounded hover:bg-gray-100'}
          >
            90d
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-slate-100 p-4 rounded border">
          <div className="text-sm text-gray-600 font-semibold">Total Sessions</div>
          <div className="text-3xl font-bold mt-2">{totalSessions}</div>
        </div>
        <div className="bg-slate-100 p-4 rounded border">
          <div className="text-sm text-gray-600 font-semibold">Avg Duration</div>
          <div className="text-3xl font-bold mt-2">{avgDuration}s</div>
        </div>
        <div className="bg-slate-100 p-4 rounded border">
          <div className="text-sm text-gray-600 font-semibold">Total Tokens</div>
          <div className="text-3xl font-bold mt-2">{totalTokens.toLocaleString()}</div>
        </div>
        <div className="bg-slate-100 p-4 rounded border">
          <div className="text-sm text-gray-600 font-semibold">Total Cost</div>
          <div className="text-3xl font-bold mt-2">${totalCost.toFixed(2)}</div>
        </div>
      </div>

      <div className="bg-white p-4 rounded border">
        <h3 className="font-bold text-lg mb-4">Model Distribution</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-2">Model</th>
              <th className="text-right px-4 py-2">Sessions</th>
              <th className="text-right px-4 py-2">Tokens</th>
              <th className="text-right px-4 py-2">Cost</th>
            </tr>
          </thead>
          <tbody>
            {metrics.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-4 text-gray-500">
                  No sessions in this period
                </td>
              </tr>
            ) : (
              metrics.map(m => (
                <tr key={m.model} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2">{m.model || 'unknown'}</td>
                  <td className="text-right px-4 py-2">{m.total_sessions}</td>
                  <td className="text-right px-4 py-2">{m.total_tokens_used.toLocaleString()}</td>
                  <td className="text-right px-4 py-2">${(m.total_cost_usd || 0).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {dailyMetrics.length > 0 && (
        <div className="bg-white p-4 rounded border">
          <h3 className="font-bold text-lg mb-4">Daily Breakdown</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-right px-4 py-2">Sessions</th>
                <th className="text-right px-4 py-2">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {dailyMetrics.map(d => (
                <tr key={d.date} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2">{d.date}</td>
                  <td className="text-right px-4 py-2">{d.sessions}</td>
                  <td className="text-right px-4 py-2">{d.tokens.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
