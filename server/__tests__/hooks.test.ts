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
