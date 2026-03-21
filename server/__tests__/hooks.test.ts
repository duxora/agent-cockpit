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
    expect(columnNames).toContain('trigger')
    expect(columnNames).toContain('name')
    expect(columnNames).toContain('command')
    expect(columnNames).toContain('enabled')
    expect(columnNames).toContain('created_at')
  })

  it('inserts and retrieves hooks', () => {
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

    const insertStmt = db.prepare(
      'INSERT INTO hooks (hook_type, trigger, name, command, enabled) VALUES (?, ?, ?, ?, ?)'
    )
    const result = insertStmt.run('pre-session', 'on-start', 'test-hook', 'echo test', 1)

    expect(result.lastInsertRowid).toBe(1)

    const selectStmt = db.prepare('SELECT * FROM hooks WHERE id = ?')
    const hook = selectStmt.get(1) as any

    expect(hook.hook_type).toBe('pre-session')
    expect(hook.trigger).toBe('on-start')
    expect(hook.name).toBe('test-hook')
    expect(hook.command).toBe('echo test')
    expect(hook.enabled).toBe(1)
  })
})

describe('Hooks CRUD Functions', () => {
  let db: Database.Database
  const testDbPath = path.join(__dirname, '../../test-hooks-crud.db')

  beforeEach(() => {
    db = new Database(testDbPath)
    // Create tables needed for CRUD tests
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
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)
  })

  it('creates a hook with correct data', () => {
    const insertStmt = db.prepare(
      'INSERT INTO hooks (hook_type, trigger, name, command, enabled) VALUES (?, ?, ?, ?, ?)'
    )
    const selectStmt = db.prepare('SELECT * FROM hooks WHERE id = ?')

    const result = insertStmt.run('pre-session', 'on-start', 'setup', 'npm install', 1)
    const hookId = Number(result.lastInsertRowid)

    const hook = selectStmt.get(hookId) as any

    expect(hook.id).toBe(hookId)
    expect(hook.name).toBe('setup')
    expect(hook.command).toBe('npm install')
    expect(hook.enabled).toBe(1)
  })

  it('lists all hooks', () => {
    const insertStmt = db.prepare(
      'INSERT INTO hooks (hook_type, trigger, name, command, enabled) VALUES (?, ?, ?, ?, ?)'
    )

    insertStmt.run('pre-session', 'on-start', 'hook1', 'cmd1', 1)
    insertStmt.run('post-session', 'on-end', 'hook2', 'cmd2', 1)

    const selectAllStmt = db.prepare('SELECT * FROM hooks ORDER BY created_at DESC')
    const hooks = selectAllStmt.all()

    expect(hooks).toHaveLength(2)
  })

  it('filters hooks by type', () => {
    const insertStmt = db.prepare(
      'INSERT INTO hooks (hook_type, trigger, name, command, enabled) VALUES (?, ?, ?, ?, ?)'
    )

    insertStmt.run('pre-session', 'on-start', 'pre-hook', 'cmd1', 1)
    insertStmt.run('post-session', 'on-end', 'post-hook', 'cmd2', 1)

    const selectByTypeStmt = db.prepare('SELECT * FROM hooks WHERE hook_type = ?')
    const preHooks = selectByTypeStmt.all('pre-session')

    expect(preHooks).toHaveLength(1)
    expect((preHooks[0] as any).name).toBe('pre-hook')
  })

  it('updates a hook', () => {
    const insertStmt = db.prepare(
      'INSERT INTO hooks (hook_type, trigger, name, command, enabled) VALUES (?, ?, ?, ?, ?)'
    )
    const updateStmt = db.prepare('UPDATE hooks SET name = ?, command = ?, enabled = ? WHERE id = ?')
    const selectStmt = db.prepare('SELECT * FROM hooks WHERE id = ?')

    const result = insertStmt.run('pre-session', 'on-start', 'old-name', 'old-cmd', 1)
    const id = Number(result.lastInsertRowid)

    updateStmt.run('new-name', 'new-cmd', 0, id)

    const hook = selectStmt.get(id) as any

    expect(hook.name).toBe('new-name')
    expect(hook.command).toBe('new-cmd')
    expect(hook.enabled).toBe(0)
  })

  it('deletes a hook', () => {
    const insertStmt = db.prepare(
      'INSERT INTO hooks (hook_type, trigger, name, command, enabled) VALUES (?, ?, ?, ?, ?)'
    )
    const deleteStmt = db.prepare('DELETE FROM hooks WHERE id = ?')
    const selectStmt = db.prepare('SELECT * FROM hooks WHERE id = ?')

    const result = insertStmt.run('pre-session', 'on-start', 'to-delete', 'cmd', 1)
    const id = Number(result.lastInsertRowid)

    expect(selectStmt.get(id)).toBeDefined()

    deleteStmt.run(id)

    expect(selectStmt.get(id)).toBeUndefined()
  })
})
