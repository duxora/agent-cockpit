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

export default db
