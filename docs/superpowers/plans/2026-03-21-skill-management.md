# Skill Management UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browse available Claude Code skills from Cockpit dashboard, view metadata, and toggle activation.

**Architecture:** Backend scans `~/.claude/skills/` directory, parses skill metadata, provides REST endpoint. Frontend displays skills in table with enable/disable functionality.

**Tech Stack:** Node.js fs module, Express, React, TypeScript

---

## File Structure

| File | Status | Purpose |
|------|--------|---------|
| `server/skills.ts` | CREATE | Skill discovery and metadata parsing |
| `server/index.ts` | MODIFY | Add /api/skills endpoints |
| `src/components/SkillsManager.tsx` | CREATE | Skills UI component |
| `src/components/__tests__/SkillsManager.test.tsx` | CREATE | Component tests |

---

## Task 1: Create Skill Discovery Module

**Files:**
- Create: `server/skills.ts`

- [ ] **Step 1: Create skills module**

```typescript
// server/skills.ts
import fs from 'fs'
import path from 'path'

export interface Skill {
  name: string
  description: string
  version: string
  category: string
  enabled: boolean
  path: string
}

export async function listAvailableSkills(): Promise<Skill[]> {
  const skillsDir = path.join(process.env.HOME || '', '.claude', 'skills')

  // Handle if directory doesn't exist
  if (!fs.existsSync(skillsDir)) {
    return []
  }

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
    const skills: Skill[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const skillPath = path.join(skillsDir, entry.name)
      const metadata = parseSkillMetadata(skillPath, entry.name)

      if (metadata) {
        skills.push(metadata)
      }
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Failed to list skills:', error)
    return []
  }
}

function parseSkillMetadata(skillPath: string, skillName: string): Skill | null {
  try {
    // Try to read skill.md for metadata in frontmatter
    const skillMdPath = path.join(skillPath, 'skill.md')
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, 'utf-8')
      const metadata = extractFrontmatter(content)

      return {
        name: metadata.name || skillName,
        description: metadata.description || '',
        version: metadata.version || '1.0.0',
        category: metadata.category || 'uncategorized',
        enabled: true, // In MVP, assume all discovered skills are enabled
        path: skillPath
      }
    }

    // Fallback: use directory name as skill name
    return {
      name: skillName,
      description: 'No metadata available',
      version: '1.0.0',
      category: 'uncategorized',
      enabled: true,
      path: skillPath
    }
  } catch (error) {
    console.error(`Failed to parse skill ${skillName}:`, error)
    return null
  }
}

function extractFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}

  const frontmatter: Record<string, string> = {}
  const lines = match[1].split('\n')

  for (const line of lines) {
    const [key, ...valueParts] = line.split(':')
    if (key && valueParts.length > 0) {
      frontmatter[key.trim()] = valueParts.join(':').trim()
    }
  }

  return frontmatter
}

export function getSkillMetadata(skillName: string): Skill | null {
  const skillsDir = path.join(process.env.HOME || '', '.claude', 'skills')
  const skillPath = path.join(skillsDir, skillName)

  if (!fs.existsSync(skillPath)) {
    return null
  }

  return parseSkillMetadata(skillPath, skillName)
}
```

- [ ] **Step 2: Build and test**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add server/skills.ts
git commit -m "feat: add skill discovery module for listing available Claude Code skills"
```

---

## Task 2: Add Skills REST Endpoints

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add endpoints**

```typescript
import { listAvailableSkills, getSkillMetadata } from './skills.js'

app.get('/api/skills', async (req, res) => {
  try {
    const skills = await listAvailableSkills()
    res.json(skills)
  } catch (error) {
    res.status(500).json({ error: 'Failed to list skills' })
  }
})

app.get('/api/skills/:name', async (req, res) => {
  const { name } = req.params

  try {
    const skill = getSkillMetadata(name)
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' })
      return
    }
    res.json(skill)
  } catch (error) {
    res.status(500).json({ error: 'Failed to get skill metadata' })
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
git commit -m "feat: add /api/skills endpoints for skill discovery"
```

---

## Task 3: Create SkillsManager Component

**Files:**
- Create: `src/components/SkillsManager.tsx`

- [ ] **Step 1: Create component**

```typescript
// src/components/SkillsManager.tsx
import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'

interface Skill {
  name: string
  description: string
  version: string
  category: string
  enabled: boolean
  path: string
}

export function SkillsManager() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  useEffect(() => {
    fetchSkills()
  }, [])

  const fetchSkills = async () => {
    try {
      const res = await fetch('/api/skills')
      const data = await res.json()
      setSkills(data)
    } catch (error) {
      console.error('Failed to fetch skills:', error)
    } finally {
      setLoading(false)
    }
  }

  const categories = ['all', ...new Set(skills.map(s => s.category))]

  const filteredSkills = skills.filter(skill => {
    const matchesSearch = skill.name.toLowerCase().includes(search.toLowerCase()) ||
                         skill.description.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  if (loading) return <div className="p-4">Loading skills...</div>

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">Claude Code Skills</h2>

      <div className="flex gap-4">
        <div className="flex-1 flex items-center gap-2 bg-white border rounded px-3">
          <Search size={18} className="text-gray-400" />
          <input
            type="text"
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 py-2 outline-none"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 border rounded bg-white"
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Description</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Version</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredSkills.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-4 text-gray-500">
                  No skills found
                </td>
              </tr>
            ) : (
              filteredSkills.map(skill => (
                <tr key={skill.name} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold">{skill.name}</td>
                  <td className="px-4 py-3 text-gray-600">{skill.description}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {skill.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{skill.version}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${
                      skill.enabled
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {skill.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {skills.length > 0 && (
        <div className="text-sm text-gray-600">
          Showing {filteredSkills.length} of {skills.length} skills
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add to AdminPanel**

```typescript
import { SkillsManager } from './SkillsManager'

// In tab rendering:
{activeTab === 'skills' && <SkillsManager />}

// Add button:
<button onClick={() => setActiveTab('skills')}>Skills</button>
```

- [ ] **Step 3: Build and test**

```bash
npm run build
npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/components/SkillsManager.tsx src/components/AdminPanel.tsx
git commit -m "feat: add SkillsManager component for browsing Claude Code skills"
```

---

## Task 4: Add Component Tests

**Files:**
- Create: `src/components/__tests__/SkillsManager.test.tsx`

- [ ] **Step 1: Write tests**

```typescript
// src/components/__tests__/SkillsManager.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SkillsManager } from '../SkillsManager'

describe('SkillsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('renders loading state initially', () => {
    ;(global.fetch as any).mockImplementationOnce(() =>
      new Promise(() => {})
    )

    render(<SkillsManager />)
    expect(screen.getByText(/loading skills/i)).toBeInTheDocument()
  })

  it('displays skills list', async () => {
    const mockSkills = [
      {
        name: 'test-skill',
        description: 'A test skill',
        version: '1.0.0',
        category: 'testing',
        enabled: true,
        path: '/path/to/skill'
      }
    ]

    ;(global.fetch as any).mockResolvedValueOnce({
      json: async () => mockSkills
    })

    render(<SkillsManager />)

    await waitFor(() => {
      expect(screen.getByText('test-skill')).toBeInTheDocument()
      expect(screen.getByText('A test skill')).toBeInTheDocument()
    })
  })

  it('filters skills by search', async () => {
    const mockSkills = [
      {
        name: 'test-skill',
        description: 'A test skill',
        version: '1.0.0',
        category: 'testing',
        enabled: true,
        path: '/path/to/skill'
      },
      {
        name: 'other-skill',
        description: 'Another skill',
        version: '1.0.0',
        category: 'other',
        enabled: true,
        path: '/path/to/other'
      }
    ]

    ;(global.fetch as any).mockResolvedValueOnce({
      json: async () => mockSkills
    })

    const user = userEvent.setup()
    render(<SkillsManager />)

    await waitFor(() => {
      expect(screen.getByText('test-skill')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Search skills...')
    await user.type(searchInput, 'test')

    await waitFor(() => {
      expect(screen.getByText('test-skill')).toBeInTheDocument()
      expect(screen.queryByText('other-skill')).not.toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npm test -- SkillsManager.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/components/__tests__/SkillsManager.test.tsx
git commit -m "test: add SkillsManager component tests"
```

---

## Task 5: Final Integration

**Files:**
- Test: All files

- [ ] **Step 1: Run full test suite**

```bash
npm test
npm run build
```

- [ ] **Step 2: Manual verification**

- Verify skills are discovered from `~/.claude/skills/`
- Verify metadata displays correctly
- Verify search/filter works
- Verify no errors in console

- [ ] **Step 3: Final commit**

```bash
git commit -m "✓ Skill Management UI complete and tested"
```

---

## Success Criteria

✅ Skills discovered from filesystem
✅ Skill metadata parsed correctly
✅ REST endpoints working
✅ Component displays skills
✅ Search/filter functional
✅ No errors on missing skills directory
✅ All tests passing
✅ Build succeeds
