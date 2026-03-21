# MCP GitHub Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub PR/issue tracking to Cockpit dashboard showing open PRs, issues, and recent branches.

**Architecture:** GitHub API client wrapper (`server/github.ts`), REST endpoints in Express, React component for display. Credentials stored securely in database.

**Tech Stack:** Octokit (GitHub API), Express, React, SQLite, TypeScript

---

## File Structure

| File | Status | Purpose |
|------|--------|---------|
| `server/github.ts` | CREATE | GitHub API client wrapper |
| `server/db.ts` | MODIFY | Add github_config table |
| `server/index.ts` | MODIFY | Add /api/admin/github/* endpoints |
| `src/components/GitHubStatus.tsx` | CREATE | GitHub info display component |
| `src/components/__tests__/GitHubStatus.test.tsx` | CREATE | Component tests |

---

## Task 1: Install Octokit Package

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add Octokit dependency**

```bash
npm install octokit
npm install --save-dev @types/octokit
```

- [ ] **Step 2: Verify installation**

```bash
npm list octokit
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add octokit for GitHub API integration"
```

---

## Task 2: Add GitHub Config Database Table

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Add table**

```typescript
// In server/db.ts initialization
db.exec(`
  CREATE TABLE IF NOT EXISTS github_config (
    id INTEGER PRIMARY KEY,
    token TEXT NOT NULL,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
  )
`)
```

- [ ] **Step 2: Add config functions**

```typescript
export function saveGitHubConfig(token: string, owner: string, repo: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO github_config (id, token, owner, repo, updated_at)
    VALUES (1, ?, ?, ?, unixepoch())
  `).run(token, owner, repo)
}

export function getGitHubConfig(): { token: string; owner: string; repo: string } | null {
  return db.prepare(`
    SELECT token, owner, repo FROM github_config WHERE id = 1
  `).get() as any
}
```

- [ ] **Step 3: Commit**

```bash
git add server/db.ts
git commit -m "feat: add github_config table for credentials storage"
```

---

## Task 3: Create GitHub API Client

**Files:**
- Create: `server/github.ts`

- [ ] **Step 1: Create GitHub client**

```typescript
// server/github.ts
import { Octokit } from 'octokit'
import { getGitHubConfig } from './db.js'

let octokit: Octokit | null = null

export function initGitHub(): void {
  const config = getGitHubConfig()
  if (config && config.token) {
    octokit = new Octokit({
      auth: config.token
    })
  }
}

export async function fetchPRs(owner: string, repo: string) {
  if (!octokit) throw new Error('GitHub not configured')

  try {
    const response = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 10
    })

    return response.data.map(pr => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login || 'unknown',
      state: pr.state,
      url: pr.html_url,
      createdAt: pr.created_at
    }))
  } catch (error) {
    console.error('Failed to fetch PRs:', error)
    return []
  }
}

export async function fetchIssues(owner: string, repo: string) {
  if (!octokit) throw new Error('GitHub not configured')

  try {
    const response = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      per_page: 10
    })

    return response.data.map(issue => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      labels: issue.labels.map(l => typeof l === 'string' ? l : l.name || ''),
      url: issue.html_url
    }))
  } catch (error) {
    console.error('Failed to fetch issues:', error)
    return []
  }
}

export async function fetchBranches(owner: string, repo: string) {
  if (!octokit) throw new Error('GitHub not configured')

  try {
    const response = await octokit.rest.repos.listBranches({
      owner,
      repo,
      per_page: 10
    })

    return response.data.map(branch => ({
      name: branch.name,
      commit: branch.commit.sha.substring(0, 7),
      url: `https://github.com/${owner}/${repo}/tree/${branch.name}`
    }))
  } catch (error) {
    console.error('Failed to fetch branches:', error)
    return []
  }
}
```

- [ ] **Step 2: Build and test**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add server/github.ts
git commit -m "feat: create GitHub API client wrapper with PR/issue/branch fetching"
```

---

## Task 4: Add GitHub REST Endpoints

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add endpoints**

```typescript
import { initGitHub, fetchPRs, fetchIssues, fetchBranches } from './github.js'
import { saveGitHubConfig, getGitHubConfig } from './db.js'

// Call on startup
initGitHub()

// Endpoints
app.get('/api/admin/github/config', (req, res) => {
  const config = getGitHubConfig()
  if (config) {
    res.json({ owner: config.owner, repo: config.repo })
  } else {
    res.json({ owner: '', repo: '' })
  }
})

app.post('/api/admin/github/config', (req, res) => {
  const { token, owner, repo } = req.body

  if (!token || !owner || !repo) {
    res.status(400).json({ error: 'Missing fields' })
    return
  }

  try {
    saveGitHubConfig(token, owner, repo)
    initGitHub()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to save config' })
  }
})

app.get('/api/admin/github/prs', async (req, res) => {
  const config = getGitHubConfig()
  if (!config) {
    res.status(400).json({ error: 'GitHub not configured' })
    return
  }

  try {
    const prs = await fetchPRs(config.owner, config.repo)
    res.json(prs)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch PRs' })
  }
})

app.get('/api/admin/github/issues', async (req, res) => {
  const config = getGitHubConfig()
  if (!config) {
    res.status(400).json({ error: 'GitHub not configured' })
    return
  }

  try {
    const issues = await fetchIssues(config.owner, config.repo)
    res.json(issues)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch issues' })
  }
})

app.get('/api/admin/github/branches', async (req, res) => {
  const config = getGitHubConfig()
  if (!config) {
    res.status(400).json({ error: 'GitHub not configured' })
    return
  }

  try {
    const branches = await fetchBranches(config.owner, config.repo)
    res.json(branches)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch branches' })
  }
})
```

- [ ] **Step 2: Build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat: add /api/admin/github endpoints for PR/issue/branch management"
```

---

## Task 5: Create GitHubStatus Component

**Files:**
- Create: `src/components/GitHubStatus.tsx`

- [ ] **Step 1: Create component**

```typescript
// src/components/GitHubStatus.tsx
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
```

- [ ] **Step 2: Add to AdminPanel**

```typescript
import { GitHubStatus } from './GitHubStatus'

// In tab rendering:
{activeTab === 'github' && <GitHubStatus />}

// Add button:
<button onClick={() => setActiveTab('github')}>GitHub</button>
```

- [ ] **Step 3: Build and test**

```bash
npm run build
npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/GitHubStatus.tsx src/components/AdminPanel.tsx
git commit -m "feat: add GitHubStatus component with PR/issue/branch display"
```

---

## Success Criteria

✅ GitHub config stored securely
✅ Octokit API client works
✅ REST endpoints return GitHub data
✅ Component displays PRs, issues, branches
✅ External links work
✅ Configuration UI functional
✅ Graceful handling of API errors
✅ Build succeeds
✅ All tests passing
