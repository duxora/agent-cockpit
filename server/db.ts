import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'cockpit.db')

const db = new Database(DB_PATH)

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS session_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    data TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_session_events_name ON session_events(session_name);
  CREATE INDEX IF NOT EXISTS idx_session_events_created ON session_events(created_at);

  CREATE TABLE IF NOT EXISTS managed_sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cwd TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    started_at INTEGER NOT NULL,
    last_heartbeat INTEGER NOT NULL,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_managed_sessions_status ON managed_sessions(status);

  CREATE TABLE IF NOT EXISTS session_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    cwd TEXT DEFAULT '~',
    icon TEXT DEFAULT '🤖',
    category TEXT DEFAULT 'general',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`)

export interface SessionEvent {
  id: number
  sessionName: string
  eventType: string
  data: string | null
  createdAt: number
}

const insertEvent = db.prepare(
  'INSERT INTO session_events (session_name, event_type, data) VALUES (?, ?, ?)'
)

const getEvents = db.prepare(
  'SELECT id, session_name as sessionName, event_type as eventType, data, created_at as createdAt FROM session_events WHERE session_name = ? ORDER BY created_at DESC LIMIT ?'
)

const getRecentEvents = db.prepare(
  'SELECT id, session_name as sessionName, event_type as eventType, data, created_at as createdAt FROM session_events ORDER BY created_at DESC LIMIT ?'
)

export function logEvent(sessionName: string, eventType: string, data?: string): void {
  insertEvent.run(sessionName, eventType, data ?? null)
}

export function getSessionEvents(sessionName: string, limit = 50): SessionEvent[] {
  return getEvents.all(sessionName, limit) as SessionEvent[]
}

export function getAllRecentEvents(limit = 100): SessionEvent[] {
  return getRecentEvents.all(limit) as SessionEvent[]
}

// --- Session Templates ---

const insertTemplate = db.prepare(
  'INSERT INTO session_templates (name, command, cwd, icon, category) VALUES (?, ?, ?, ?, ?)'
)

const getAllTemplates = db.prepare(
  'SELECT * FROM session_templates ORDER BY category, name'
)

const deleteTemplate = db.prepare(
  'DELETE FROM session_templates WHERE id = ?'
)

export interface SessionTemplate {
  id: number
  name: string
  command: string
  cwd: string
  icon: string
  category: string
  created_at: number
}

export function createTemplate(name: string, command: string, cwd: string, icon: string = '🤖', category: string = 'general'): SessionTemplate {
  const result = insertTemplate.run(name, command, cwd, icon, category)
  return { id: Number(result.lastInsertRowid), name, command, cwd, icon, category, created_at: Math.floor(Date.now() / 1000) }
}

export function listTemplates(): SessionTemplate[] {
  return getAllTemplates.all() as SessionTemplate[]
}

export function removeTemplate(id: number): boolean {
  return deleteTemplate.run(id).changes > 0
}

// --- Managed Sessions (auto-linked Claude sessions) ---

const upsertManagedSession = db.prepare(
  `INSERT OR REPLACE INTO managed_sessions (id, name, cwd, status, started_at, last_heartbeat, metadata)
   VALUES (?, ?, ?, 'active', ?, ?, ?)`
)

const updateHeartbeat = db.prepare(
  `UPDATE managed_sessions SET last_heartbeat = ?, status = ? WHERE id = ?`
)

const stopManagedSession = db.prepare(
  `UPDATE managed_sessions SET status = 'stopped' WHERE id = ?`
)

const getActiveManagedSessions = db.prepare(
  `SELECT * FROM managed_sessions WHERE status != 'stopped' ORDER BY last_heartbeat DESC`
)

const cleanupIdleSessions = db.prepare(
  `UPDATE managed_sessions SET status = 'idle' WHERE status = 'active' AND last_heartbeat < ?`
)

const cleanupStoppedSessions = db.prepare(
  `UPDATE managed_sessions SET status = 'stopped' WHERE status IN ('active', 'idle') AND last_heartbeat < ?`
)

const deleteOldSessions = db.prepare(
  `DELETE FROM managed_sessions WHERE status = 'stopped' AND last_heartbeat < ?`
)

export interface ManagedSession {
  id: string
  name: string
  cwd: string
  status: string
  started_at: number
  last_heartbeat: number
  metadata: string | null
}

export function registerManagedSession(id: string, name: string, cwd: string, metadata?: string): void {
  const now = Math.floor(Date.now() / 1000)
  upsertManagedSession.run(id, name, cwd, now, now, metadata ?? null)
}

export function heartbeatManagedSession(id: string, status: string = 'active'): void {
  const now = Math.floor(Date.now() / 1000)
  updateHeartbeat.run(now, status, id)
}

export function endManagedSession(id: string): void {
  stopManagedSession.run(id)
}

export function getManagedSessionById(id: string): ManagedSession | undefined {
  return db.prepare('SELECT * FROM managed_sessions WHERE id = ?').get(id) as ManagedSession | undefined
}

export function listManagedSessions(): ManagedSession[] {
  return getActiveManagedSessions.all() as ManagedSession[]
}

export function cleanupManagedSessions(): void {
  const now = Math.floor(Date.now() / 1000)
  cleanupIdleSessions.run(now - 300)    // 5 minutes
  cleanupStoppedSessions.run(now - 1800) // 30 minutes
  deleteOldSessions.run(now - 86400)     // 24 hours
}

export default db
