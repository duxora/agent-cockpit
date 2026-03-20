import { useEffect, useState } from 'react'
import { Eye, EyeOff, Copy } from 'lucide-react'

interface EnvVar {
  name: string
  value: string
  isSecret: boolean
}

export default function VariablesManager() {
  const [vars, setVars] = useState<EnvVar[]>([])
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const fetchVars = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/railway/variables')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setVars(data)
    } catch {
      // Fail silently
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchVars()
  }, [])

  const toggleReveal = (name: string) => {
    const newRevealed = new Set(revealed)
    if (newRevealed.has(name)) {
      newRevealed.delete(name)
    } else {
      newRevealed.add(name)
    }
    setRevealed(newRevealed)
  }

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value)
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">Environment Variables</h3>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {vars.length === 0 ? (
          <p className="text-xs text-gray-600">No variables found</p>
        ) : (
          vars.map((v) => (
            <div key={v.name} className="flex items-center justify-between rounded bg-gray-800/50 px-3 py-2">
              <div className="flex-1">
                <p className="text-xs font-mono text-gray-300">{v.name}</p>
                {v.isSecret ? (
                  <p className="text-xs text-gray-600">
                    {revealed.has(v.name) ? v.value : '••••••••'}
                  </p>
                ) : (
                  <p className="text-xs text-gray-600 truncate">{v.value}</p>
                )}
              </div>
              <div className="flex gap-1">
                {v.isSecret && (
                  <button
                    onClick={() => toggleReveal(v.name)}
                    className="p-1 text-gray-500 hover:text-gray-300"
                  >
                    {revealed.has(v.name) ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => copyToClipboard(v.value)}
                  className="p-1 text-gray-500 hover:text-gray-300"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
