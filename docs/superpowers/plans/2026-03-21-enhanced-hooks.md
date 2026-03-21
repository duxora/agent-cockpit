# Enhanced Hooks System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build UI for managing pre/post-session hooks with enable/disable toggles, add/edit/delete functionality.

**Architecture:** Database layer stores hook configurations, backend provides CRUD endpoints, frontend UI allows management. Hooks executed via existing SessionStart/SessionEnd hook system.

**Tech Stack:** SQLite (better-sqlite3), Express, React, TypeScript, Vitest

---

## File Structure

| File | Status | Purpose |
|------|--------|---------|
| `server/db.ts` | MODIFY | Add hooks table and CRUD functions |
| `server/index.ts` | MODIFY | Add /api/hooks/* endpoints |
| `src/components/HooksManager.tsx` | CREATE | UI for managing hooks |
| `src/components/__tests__/HooksManager.test.tsx` | CREATE | Component tests |
| `server/__tests__/hooks.test.ts` | CREATE | Backend API tests |

---

## Task 1: Create Hooks Database Table

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Write test for hooks table**

```typescript
// Add to server/__tests__/hooks.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

describe('Hooks Database', () => {
  let db: Database.Database
  const testDbPath = path.join(__dirname, '../../test-hooks.db')

  beforeEach(() => {
    db = new Database(testDbPath)
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)
  })

  it('creates hooks table with correct schema', () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS hooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hook_type TEXT NOT NULL,
        trigger TEXT NOT NULL,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `)

    const tableInfo = db.prepare("PRAGMA table_info(hooks)").all()
    const columnNames = tableInfo.map((col: any) => col.name)

    expect(columnNames).toContain('hook_type')
    expect(columnNames).toContain('command')
    expect(columnNames).toContain('enabled')
  })
})
```

- [ ] **Step 2: Add table to db.ts**

In `server/db.ts` initialization:

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS hooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hook_type TEXT NOT NULL,
    trigger TEXT NOT NULL,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch())
  )
`)
```

- [ ] **Step 3: Run and commit**

```bash
npm test -- hooks.test.ts
git add server/db.ts server/__tests__/hooks.test.ts
git commit -m "feat: add hooks table for pre/post-session automation"
```

---

## Task 2: Add Hook CRUD Functions

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Implement hook functions**

```typescript
export interface Hook {
  id: number
  hookType: 'pre-session' | 'post-session'
  trigger: 'on-start' | 'on-end' | 'manual'
  name: string
  command: string
  enabled: boolean
  createdAt: number
}

export function createHook(hook: Omit<Hook, 'id' | 'createdAt'>): Hook {
  const result = db.prepare(`
    INSERT INTO hooks (hook_type, trigger, name, command, enabled)
    VALUES (?, ?, ?, ?, ?)
  `).run(hook.hookType, hook.trigger, hook.name, hook.command, hook.enabled ? 1 : 0)

  return {
    id: result.lastInsertRowid as number,
    ...hook,
    createdAt: Math.floor(Date.now() / 1000)
  }
}

export function listHooks(filterType?: string): Hook[] {
  let query = 'SELECT * FROM hooks ORDER BY created_at DESC'
  if (filterType) {
    query += ` WHERE hook_type = ?`
    return db.prepare(query).all(filterType) as any[]
  }
  return db.prepare(query).all() as any[]
}

export function updateHook(id: number, updates: Partial<Omit<Hook, 'id' | 'createdAt'>>): void {
  const fields: string[] = []
  const values: any[] = []

  if (updates.name) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.command) {
    fields.push('command = ?')
    values.push(updates.command)
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?')
    values.push(updates.enabled ? 1 : 0)
  }

  if (fields.length === 0) return

  values.push(id)
  const query = `UPDATE hooks SET ${fields.join(', ')} WHERE id = ?`
  db.prepare(query).run(...values)
}

export function deleteHook(id: number): void {
  db.prepare('DELETE FROM hooks WHERE id = ?').run(id)
}
```

- [ ] **Step 2: Test functions**

```bash
npm test -- hooks.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add server/db.ts
git commit -m "feat: add hook CRUD functions (create, list, update, delete)"
```

---

## Task 3: Add Hook REST Endpoints

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Add endpoints**

```typescript
import { createHook, listHooks, updateHook, deleteHook } from './db.js'

app.get('/api/hooks', (req, res) => {
  const hookType = req.query.type as string | undefined
  const hooks = listHooks(hookType)
  res.json(hooks)
})

app.post('/api/hooks', (req, res) => {
  const { hookType, trigger, name, command, enabled } = req.body

  if (!hookType || !trigger || !name || !command) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }

  try {
    const hook = createHook({
      hookType,
      trigger,
      name,
      command,
      enabled: enabled !== false
    })
    res.status(201).json(hook)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create hook' })
  }
})

app.put('/api/hooks/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const { enabled, command, name } = req.body

  try {
    updateHook(id, { enabled, command, name })
    const hooks = listHooks()
    const updated = hooks.find(h => h.id === id)
    res.json(updated)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update hook' })
  }
})

app.delete('/api/hooks/:id', (req, res) => {
  const id = parseInt(req.params.id)

  try {
    deleteHook(id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete hook' })
  }
})
```

- [ ] **Step 2: Build and test**

```bash
npm run build
npm test
```

- [ ] **Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat: add /api/hooks endpoints for hook management"
```

---

## Task 4: Create HooksManager Component

**Files:**
- Create: `src/components/HooksManager.tsx`

- [ ] **Step 1: Create component**

```typescript
// src/components/HooksManager.tsx
import { useState, useEffect } from 'react'
import { Trash2, Plus, Edit2 } from 'lucide-react'

interface Hook {
  id: number
  hookType: 'pre-session' | 'post-session'
  trigger: 'on-start' | 'on-end' | 'manual'
  name: string
  command: string
  enabled: boolean
  createdAt: number
}

export function HooksManager() {
  const [hooks, setHooks] = useState<Hook[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    hookType: 'pre-session' as const,
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
      setFormData({ name: '', hookType: 'pre-session', trigger: 'on-start', command: '' })
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

  if (loading) return <div className="p-4">Loading hooks...</div>

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Session Hooks</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center gap-2"
        >
          <Plus size={18} /> Add Hook
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded border space-y-3">
          <input
            type="text"
            placeholder="Hook name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border rounded"
            required
          />
          <select
            value={formData.hookType}
            onChange={(e) => setFormData({ ...formData, hookType: e.target.value as any })}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="pre-session">Pre-session (before)</option>
            <option value="post-session">Post-session (after)</option>
          </select>
          <select
            value={formData.trigger}
            onChange={(e) => setFormData({ ...formData, trigger: e.target.value as any })}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="on-start">On start</option>
            <option value="on-end">On end</option>
            <option value="manual">Manual</option>
          </select>
          <textarea
            placeholder="Command"
            value={formData.command}
            onChange={(e) => setFormData({ ...formData, command: e.target.value })}
            className="w-full px-3 py-2 border rounded font-mono text-sm"
            required
          />
          <div className="flex gap-2">
            <button type="submit" className="bg-green-500 text-white px-4 py-2 rounded">
              {editingId ? 'Update' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
                setFormData({ name: '', hookType: 'pre-session', trigger: 'on-start', command: '' })
              }}
              className="bg-gray-400 text-white px-4 py-2 rounded"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {hooks.map((hook) => (
          <div key={hook.id} className="bg-white p-4 rounded border flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hook.enabled}
                  onChange={() => handleToggle(hook.id, hook.enabled)}
                  className="w-5 h-5"
                />
                <h3 className="font-bold">{hook.name}</h3>
                <span className="text-xs bg-blue-100 px-2 py-1 rounded">{hook.hookType}</span>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded">{hook.trigger}</span>
              </div>
              <code className="text-sm text-gray-600 block mt-2">{hook.command}</code>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditingId(hook.id)
                  setFormData({
                    name: hook.name,
                    hookType: hook.hookType,
                    trigger: hook.trigger,
                    command: hook.command
                  })
                  setShowForm(true)
                }}
                className="text-blue-500 hover:text-blue-600"
              >
                <Edit2 size={18} />
              </button>
              <button
                onClick={() => handleDelete(hook.id)}
                className="text-red-500 hover:text-red-600"
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
```

- [ ] **Step 2: Add to AdminPanel**

```typescript
import { HooksManager } from './HooksManager'

// In tab rendering:
{activeTab === 'hooks' && <HooksManager />}

// Add button:
<button onClick={() => setActiveTab('hooks')}>Hooks</button>
```

- [ ] **Step 3: Run tests**

```bash
npm test
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/HooksManager.tsx src/components/AdminPanel.tsx
git commit -m "feat: add HooksManager UI for pre/post-session automation"
```

---

## Task 5: Final Testing

- [ ] **Step 1: Full test suite**

```bash
npm test
npm run build
```

- [ ] **Step 2: Verify hooks persistence**

- [ ] **Step 3: Test enable/disable functionality**

- [ ] **Step 4: Final commit**

```bash
git commit -m "✓ Enhanced Hooks System complete and tested"
```

---

## Success Criteria

✅ Hooks table created
✅ CRUD endpoints working
✅ HooksManager UI functional
✅ Enable/disable toggles work
✅ Add/edit/delete operations working
✅ All tests passing
✅ Build succeeds
