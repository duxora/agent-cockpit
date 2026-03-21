import { useState, useEffect } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'

interface PR {
  number: number
  title: string
  author: string
  state: string
  url: string
}

interface Issue {
  number: number
  title: string
  state: string
  labels: string[]
  url: string
}

interface Branch {
  name: string
  commit: string
  url: string
}

export function GitHubStatus() {
  const [config, setConfig] = useState({ owner: '', repo: '' })
  const [prs, setPrs] = useState<PR[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({ token: '', owner: '', repo: '' })

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/admin/github/config')
      const data = await res.json()
      setConfig(data)
      if (data.owner && data.repo) {
        fetchData(data)
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchData = async (cfg: any = config) => {
    setLoading(true)
    try {
      const [prsRes, issuesRes, branchesRes] = await Promise.all([
        fetch('/api/admin/github/prs'),
        fetch('/api/admin/github/issues'),
        fetch('/api/admin/github/branches')
      ])

      if (prsRes.ok) setPrs(await prsRes.json())
      if (issuesRes.ok) setIssues(await issuesRes.json())
      if (branchesRes.ok) setBranches(await branchesRes.json())
    } catch (error) {
      console.error('Failed to fetch GitHub data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await fetch('/api/admin/github/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      setConfig({ owner: formData.owner, repo: formData.repo })
      setEditing(false)
      fetchData({ owner: formData.owner, repo: formData.repo })
    } catch (error) {
      console.error('Failed to save GitHub config:', error)
    }
  }

  if (loading && !config.owner) {
    return <div className="p-4">Loading GitHub config...</div>
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">GitHub Integration</h2>
        <button
          onClick={() => {
            setEditing(!editing)
            if (!editing) setFormData({ token: '', owner: config.owner, repo: config.repo })
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          {editing ? 'Cancel' : 'Configure'}
        </button>
      </div>

      {editing && (
        <form onSubmit={handleSave} className="bg-white p-4 rounded border space-y-3">
          <input
            type="password"
            placeholder="GitHub Token"
            value={formData.token}
            onChange={(e) => setFormData({ ...formData, token: e.target.value })}
            className="w-full px-3 py-2 border rounded"
            required
          />
          <input
            type="text"
            placeholder="Owner"
            value={formData.owner}
            onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
            className="w-full px-3 py-2 border rounded"
            required
          />
          <input
            type="text"
            placeholder="Repository"
            value={formData.repo}
            onChange={(e) => setFormData({ ...formData, repo: e.target.value })}
            className="w-full px-3 py-2 border rounded"
            required
          />
          <button type="submit" className="w-full bg-green-500 text-white px-4 py-2 rounded">
            Save
          </button>
        </form>
      )}

      {config.owner && config.repo && (
        <>
          <div className="flex gap-2 items-center text-sm text-gray-600">
            <span>{config.owner}/{config.repo}</span>
            <button
              onClick={() => fetchData()}
              className="text-blue-500 hover:text-blue-600"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded border">
              <h3 className="font-bold mb-2">Open PRs ({prs.length})</h3>
              <div className="space-y-2 text-sm">
                {prs.map(pr => (
                  <a
                    key={pr.number}
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:bg-gray-50 p-2 rounded flex justify-between items-start"
                  >
                    <div>
                      <div className="font-semibold">#{pr.number}</div>
                      <div className="text-gray-600">{pr.title}</div>
                      <div className="text-xs text-gray-500">by {pr.author}</div>
                    </div>
                    <ExternalLink size={14} className="flex-shrink-0 mt-1" />
                  </a>
                ))}
              </div>
            </div>

            <div className="bg-white p-4 rounded border">
              <h3 className="font-bold mb-2">Open Issues ({issues.length})</h3>
              <div className="space-y-2 text-sm">
                {issues.map(issue => (
                  <a
                    key={issue.number}
                    href={issue.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:bg-gray-50 p-2 rounded flex justify-between items-start"
                  >
                    <div>
                      <div className="font-semibold">#{issue.number}</div>
                      <div className="text-gray-600 truncate">{issue.title}</div>
                      <div className="flex gap-1 mt-1">
                        {issue.labels.map(label => (
                          <span key={label} className="text-xs bg-gray-100 px-1 rounded">
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ExternalLink size={14} className="flex-shrink-0 mt-1" />
                  </a>
                ))}
              </div>
            </div>

            <div className="bg-white p-4 rounded border">
              <h3 className="font-bold mb-2">Recent Branches ({branches.length})</h3>
              <div className="space-y-2 text-sm">
                {branches.map(branch => (
                  <a
                    key={branch.name}
                    href={branch.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:bg-gray-50 p-2 rounded flex justify-between items-center"
                  >
                    <div>
                      <div className="font-semibold truncate">{branch.name}</div>
                      <code className="text-xs text-gray-500">{branch.commit}</code>
                    </div>
                    <ExternalLink size={14} className="flex-shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
