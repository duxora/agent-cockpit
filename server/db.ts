import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'cockpit.db')

const db = new Database(DB_PATH)

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cwd TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    display_mode TEXT DEFAULT 'terminal' CHECK(display_mode IN ('terminal', 'text')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_activity INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

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

  CREATE TABLE IF NOT EXISTS deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    railway_deployment_id TEXT UNIQUE NOT NULL,
    service_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    trigger TEXT,
    commit_sha TEXT,
    branch TEXT,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_deployments_service_id ON deployments(service_id);
  CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);

  CREATE TABLE IF NOT EXISTS service_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    cpu_percent REAL,
    memory_mb REAL,
    uptime_seconds INTEGER,
    request_count INTEGER,
    error_count INTEGER,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_service_metrics_service_id ON service_metrics(service_id, timestamp);

  CREATE TABLE IF NOT EXISTS session_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    session_name TEXT NOT NULL,
    model TEXT,
    duration_ms INTEGER,
    tokens_used INTEGER,
    cost_usd REAL,
    ended_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_session_metrics_session_id ON session_metrics(session_id);
  CREATE INDEX IF NOT EXISTS idx_session_metrics_ended_at ON session_metrics(ended_at);

  CREATE TABLE IF NOT EXISTS github_config (
    id INTEGER PRIMARY KEY,
    token TEXT NOT NULL,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS hooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hook_type TEXT NOT NULL,
    trigger TEXT NOT NULL,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_hooks_hook_type ON hooks(hook_type);
  CREATE INDEX IF NOT EXISTS idx_hooks_enabled ON hooks(enabled);

  CREATE TABLE IF NOT EXISTS session_shares (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    access_level TEXT CHECK(access_level IN ('read', 'interactive')),
    password_hash TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    expires_at INTEGER,
    accessed_at INTEGER,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_session_shares_session_id ON session_shares(session_id);
  CREATE INDEX IF NOT EXISTS idx_session_shares_expires_at ON session_shares(expires_at);
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
  `DELETE FROM managed_sessions WHERE id = ?`
)

const getActiveManagedSessions = db.prepare(
  `SELECT * FROM managed_sessions WHERE status != 'stopped' ORDER BY last_heartbeat DESC`
)

const cleanupIdleSessions = db.prepare(
  `UPDATE managed_sessions SET status = 'idle' WHERE status IN ('active', 'waiting') AND last_heartbeat < ?`
)

const deleteStaleSession = db.prepare(
  `DELETE FROM managed_sessions WHERE last_heartbeat < ?`
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
  cleanupIdleSessions.run(now - 300)       // 5 min no heartbeat → idle
  deleteStaleSession.run(now - 1800)       // 30 min no heartbeat → remove
}

// --- Deployments ---

const upsertDeployment = db.prepare(`
  INSERT OR REPLACE INTO deployments (railway_deployment_id, service_id, status, created_at, updated_at, trigger, commit_sha, branch, metadata)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const getRecentDeployments = db.prepare(`
  SELECT * FROM deployments
  WHERE service_id = ?
  ORDER BY updated_at DESC
  LIMIT ?
`)

const getDeploymentCount = db.prepare(`
  SELECT COUNT(*) as count FROM deployments WHERE service_id = ?
`)

export interface Deployment {
  id: number
  railway_deployment_id: string
  service_id: string
  status: string
  created_at: number
  updated_at: number
  trigger: string | null
  commit_sha: string | null
  branch: string | null
  metadata: string | null
}

export function upsertDeploymentRecord(
  railwayId: string,
  serviceId: string,
  status: string,
  trigger?: string,
  commitSha?: string,
  branch?: string,
  metadata?: object
): void {
  const now = Math.floor(Date.now() / 1000)
  upsertDeployment.run(
    railwayId, serviceId, status, now, now,
    trigger ?? null, commitSha ?? null, branch ?? null,
    metadata ? JSON.stringify(metadata) : null
  )
}

export function listDeployments(serviceId: string, limit = 20): Deployment[] {
  return getRecentDeployments.all(serviceId, limit) as Deployment[]
}

// --- Service Metrics ---

const insertMetric = db.prepare(`
  INSERT INTO service_metrics (service_id, timestamp, cpu_percent, memory_mb, uptime_seconds, request_count, error_count, metadata)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const getMetricsRange = db.prepare(`
  SELECT * FROM service_metrics
  WHERE service_id = ? AND timestamp >= ?
  ORDER BY timestamp DESC
  LIMIT ?
`)

export interface ServiceMetric {
  id: number
  service_id: string
  timestamp: number
  cpu_percent: number | null
  memory_mb: number | null
  uptime_seconds: number | null
  request_count: number | null
  error_count: number | null
  metadata: string | null
}

export function logMetric(
  serviceId: string,
  cpu?: number,
  memory?: number,
  uptime?: number,
  requestCount?: number,
  errorCount?: number,
  metadata?: object
): void {
  const timestamp = Math.floor(Date.now() / 1000)
  insertMetric.run(
    serviceId, timestamp,
    cpu ?? null, memory ?? null, uptime ?? null,
    requestCount ?? null, errorCount ?? null,
    metadata ? JSON.stringify(metadata) : null
  )
}

export function getMetrics(serviceId: string, hoursBack = 24, limit = 100): ServiceMetric[] {
  const since = Math.floor(Date.now() / 1000) - (hoursBack * 3600)
  return getMetricsRange.all(serviceId, since, limit) as ServiceMetric[]
}

// --- Session Metrics ---

export interface SessionMetric {
  sessionId: string
  sessionName: string
  model?: string
  durationMs: number
  tokensUsed: number
  costUsd?: number
  endedAt: number
}

const insertSessionMetric = db.prepare(`
  INSERT INTO session_metrics
  (session_id, session_name, model, duration_ms, tokens_used, cost_usd, ended_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`)

const getSessionMetricById = db.prepare(`
  SELECT * FROM session_metrics WHERE session_id = ?
`)

const getAggregatedMetricsQuery = db.prepare(`
  SELECT
    COUNT(*) as total_sessions,
    AVG(duration_ms) as avg_duration_ms,
    SUM(tokens_used) as total_tokens_used,
    SUM(cost_usd) as total_cost_usd,
    model
  FROM session_metrics
  WHERE ended_at > ?
  GROUP BY model
`)

const getDailyMetricsQuery = db.prepare(`
  SELECT
    DATE(ended_at, 'unixepoch') as date,
    COUNT(*) as sessions,
    SUM(tokens_used) as tokens
  FROM session_metrics
  WHERE ended_at > ?
  GROUP BY DATE(ended_at, 'unixepoch')
  ORDER BY date DESC
`)

export function logSessionMetrics(metric: SessionMetric): void {
  insertSessionMetric.run(
    metric.sessionId,
    metric.sessionName,
    metric.model || null,
    metric.durationMs,
    metric.tokensUsed,
    metric.costUsd || null,
    metric.endedAt
  )
}

export function getSessionMetrics(sessionId: string): SessionMetric | null {
  const metric = getSessionMetricById.get(sessionId) as any

  return metric ? {
    sessionId: metric.session_id,
    sessionName: metric.session_name,
    model: metric.model,
    durationMs: metric.duration_ms,
    tokensUsed: metric.tokens_used,
    costUsd: metric.cost_usd,
    endedAt: metric.ended_at
  } : null
}

export function getAggregatedMetrics(days: number = 30): any {
  const sinceTimestamp = Math.floor(Date.now() / 1000) - (days * 86400)

  const metrics = getAggregatedMetricsQuery.all(sinceTimestamp)
  const daily = getDailyMetricsQuery.all(sinceTimestamp)

  return { metrics, daily }
}

// --- Hooks ---

export interface Hook {
  id: number
  hook_type: 'pre-session' | 'post-session'
  trigger: 'on-start' | 'on-end' | 'manual'
  name: string
  command: string
  enabled: boolean
  created_at: number
}

const insertHook = db.prepare(`
  INSERT INTO hooks (hook_type, trigger, name, command, enabled)
  VALUES (?, ?, ?, ?, ?)
`)

const selectAllHooks = db.prepare(`
  SELECT * FROM hooks ORDER BY created_at DESC
`)

const selectHooksByType = db.prepare(`
  SELECT * FROM hooks WHERE hook_type = ? ORDER BY created_at DESC
`)

const selectHookById = db.prepare(`
  SELECT * FROM hooks WHERE id = ?
`)

const updateHookStmt = db.prepare(`
  UPDATE hooks SET name = ?, command = ?, enabled = ? WHERE id = ?
`)

const deleteHookStmt = db.prepare(`
  DELETE FROM hooks WHERE id = ?
`)

export function createHook(hookData: Omit<Hook, 'id' | 'created_at'>): Hook {
  const result = insertHook.run(
    hookData.hook_type,
    hookData.trigger,
    hookData.name,
    hookData.command,
    hookData.enabled ? 1 : 0
  )

  return {
    id: Number(result.lastInsertRowid),
    ...hookData,
    created_at: Math.floor(Date.now() / 1000)
  }
}

export function listHooks(filterType?: string): Hook[] {
  if (filterType) {
    return selectHooksByType.all(filterType) as Hook[]
  }
  return selectAllHooks.all() as Hook[]
}

export function getHook(id: number): Hook | null {
  return selectHookById.get(id) as Hook | null
}

export function updateHook(id: number, updates: Partial<Omit<Hook, 'id' | 'created_at'>>): Hook | null {
  const hook = getHook(id)
  if (!hook) return null

  const name = updates.name ?? hook.name
  const command = updates.command ?? hook.command
  const enabled = updates.enabled !== undefined ? updates.enabled : hook.enabled

  updateHookStmt.run(name, command, enabled ? 1 : 0, id)

  return { ...hook, name, command, enabled }
}

export function deleteHook(id: number): boolean {
  return deleteHookStmt.run(id).changes > 0
}

// --- Sessions ---

export interface Session {
  id: string
  name: string
  cwd: string
  status: string
  display_mode: string
  created_at: number
  last_activity: number | null
}

const getSessionStmt = db.prepare('SELECT * FROM sessions WHERE id = ?')

const updateSessionDisplayModeStmt = db.prepare(
  'UPDATE sessions SET display_mode = ? WHERE id = ?'
)

export function getSession(id: string): Session | undefined {
  return getSessionStmt.get(id) as Session | undefined
}

export function updateSessionDisplayMode(id: string, displayMode: 'terminal' | 'text'): void {
  updateSessionDisplayModeStmt.run(displayMode, id)
}

// --- Session Shares ---

export interface SessionShare {
  id: string
  sessionId: string
  accessLevel: 'read' | 'interactive'
  passwordHash: string
  createdBy: string
  createdAt: number
  expiresAt: number | null
  accessedAt: number | null
}

const createShareStmt = db.prepare(`
  INSERT INTO session_shares (id, session_id, access_level, password_hash, created_by, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)

const getShareStmt = db.prepare('SELECT * FROM session_shares WHERE id = ?')

const listSharesStmt = db.prepare('SELECT * FROM session_shares WHERE session_id = ? ORDER BY created_at DESC')

const deleteShareStmt = db.prepare('DELETE FROM session_shares WHERE id = ?')

const cleanupExpiredSharesStmt = db.prepare('DELETE FROM session_shares WHERE expires_at IS NOT NULL AND expires_at < ?')

const updateShareAccessTimeStmt = db.prepare('UPDATE session_shares SET accessed_at = ? WHERE id = ?')

export function createShare(
  id: string,
  sessionId: string,
  accessLevel: 'read' | 'interactive',
  passwordHash: string,
  createdBy: string,
  expiresAt?: number
): SessionShare {
  createShareStmt.run(id, sessionId, accessLevel, passwordHash, createdBy, expiresAt ?? null)
  const share = getShareStmt.get(id) as any
  return {
    id: share.id,
    sessionId: share.session_id,
    accessLevel: share.access_level,
    passwordHash: share.password_hash,
    createdBy: share.created_by,
    createdAt: share.created_at,
    expiresAt: share.expires_at,
    accessedAt: share.accessed_at
  }
}

export function getShare(id: string): SessionShare | undefined {
  const share = getShareStmt.get(id) as any
  if (!share) return undefined
  return {
    id: share.id,
    sessionId: share.session_id,
    accessLevel: share.access_level,
    passwordHash: share.password_hash,
    createdBy: share.created_by,
    createdAt: share.created_at,
    expiresAt: share.expires_at,
    accessedAt: share.accessed_at
  }
}

export function listShares(sessionId: string): SessionShare[] {
  const shares = listSharesStmt.all(sessionId) as any[]
  return shares.map(share => ({
    id: share.id,
    sessionId: share.session_id,
    accessLevel: share.access_level,
    passwordHash: share.password_hash,
    createdBy: share.created_by,
    createdAt: share.created_at,
    expiresAt: share.expires_at,
    accessedAt: share.accessed_at
  }))
}

export function deleteShare(id: string): boolean {
  return deleteShareStmt.run(id).changes > 0
}

export function cleanupExpiredShares(): void {
  const now = Math.floor(Date.now() / 1000)
  cleanupExpiredSharesStmt.run(now)
}

export function updateShareAccessTime(id: string): void {
  const now = Math.floor(Date.now() / 1000)
  updateShareAccessTimeStmt.run(now, id)
}

// --- GitHub Config ---

const saveGithubConfigStmt = db.prepare(`
  INSERT OR REPLACE INTO github_config (id, token, owner, repo, updated_at)
  VALUES (1, ?, ?, ?, unixepoch())
`)

const getGithubConfigStmt = db.prepare(`
  SELECT token, owner, repo FROM github_config WHERE id = 1
`)

export interface GitHubConfig {
  token: string
  owner: string
  repo: string
}

export function saveGitHubConfig(token: string, owner: string, repo: string): void {
  saveGithubConfigStmt.run(token, owner, repo)
}

export function getGitHubConfig(): GitHubConfig | null {
  return getGithubConfigStmt.get() as GitHubConfig | null
}

// --- Channel Tasks ---

db.exec(`
  CREATE TABLE IF NOT EXISTS channel_tasks (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    input_payload JSON,
    output_payload JSON,
    error_message TEXT,
    triggered_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fetched_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    sync_checkpoint TEXT,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_channel_tasks_status ON channel_tasks(status);
  CREATE INDEX IF NOT EXISTS idx_channel_tasks_created_at ON channel_tasks(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_channel_tasks_sync ON channel_tasks(status, sync_checkpoint);

  CREATE TABLE IF NOT EXISTS channel_sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSON,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES channel_tasks(id)
  );

  CREATE INDEX IF NOT EXISTS idx_channel_sync_log_task ON channel_sync_log(task_id);
  CREATE INDEX IF NOT EXISTS idx_channel_sync_log_timestamp ON channel_sync_log(timestamp DESC);
`)

// Channel task statements (pre-compiled)
const createChannelTaskStmt = db.prepare(`
  INSERT OR IGNORE INTO channel_tasks
  (id, task_type, title, status, input_payload, triggered_by)
  VALUES (?, ?, ?, ?, ?, ?)
`)

const getChannelTaskStmt = db.prepare('SELECT * FROM channel_tasks WHERE id = ?')

const listPendingTasksStmt = db.prepare(`
  SELECT * FROM channel_tasks
  WHERE status = 'pending'
  ORDER BY created_at ASC
  LIMIT ?
`)

const updateTaskStatusStmt = db.prepare(`
  UPDATE channel_tasks
  SET status = ?, fetched_at = ?, started_at = ?, completed_at = ?
  WHERE id = ?
`)

const updateTaskResultStmt = db.prepare(`
  UPDATE channel_tasks
  SET status = ?, output_payload = ?, error_message = ?, completed_at = ?, duration_ms = ?
  WHERE id = ?
`)

const logSyncEventStmt = db.prepare(`
  INSERT INTO channel_sync_log (task_id, event_type, event_data)
  VALUES (?, ?, ?)
`)

const pendingCountStmt = db.prepare("SELECT COUNT(*) as count FROM channel_tasks WHERE status = 'pending'")
const completedCountStmt = db.prepare(`
  SELECT COUNT(*) as count FROM channel_tasks
  WHERE status = 'completed' AND date(completed_at) = date('now')
`)
const inProgressStmt = db.prepare("SELECT * FROM channel_tasks WHERE status = 'executing' LIMIT 1")
const lastSyncStmt = db.prepare('SELECT timestamp FROM channel_sync_log ORDER BY timestamp DESC LIMIT 1')

export interface ChannelTask {
  id: string
  task_type: string
  title: string
  status: 'pending' | 'fetched' | 'executing' | 'completed' | 'failed'
  input_payload?: Record<string, any>
  output_payload?: Record<string, any>
  error_message?: string
  triggered_by: string
  created_at: string
  fetched_at?: string
  started_at?: string
  completed_at?: string
  duration_ms?: number
}

export function createChannelTask(task: Omit<ChannelTask, 'created_at' | 'status'>) {
  createChannelTaskStmt.run(
    task.id,
    task.task_type,
    task.title,
    'pending',
    JSON.stringify(task.input_payload || {}),
    task.triggered_by
  )

  logSyncEvent(task.id, 'created', { task_type: task.task_type })
  return getChannelTask(task.id)
}

export function getChannelTask(taskId: string): ChannelTask | null {
  const row = getChannelTaskStmt.get(taskId) as any
  if (!row) return null

  return {
    ...row,
    input_payload: row.input_payload ? JSON.parse(row.input_payload) : undefined,
    output_payload: row.output_payload ? JSON.parse(row.output_payload) : undefined
  }
}

export function listPendingTasks(limit: number): ChannelTask[] {
  const rows = listPendingTasksStmt.all(limit) as any[]
  return rows.map(row => ({
    ...row,
    input_payload: row.input_payload ? JSON.parse(row.input_payload) : undefined,
    output_payload: row.output_payload ? JSON.parse(row.output_payload) : undefined
  }))
}

export function updateTaskStatus(
  taskId: string,
  status: 'pending' | 'fetched' | 'executing' | 'completed' | 'failed',
  updates: {
    fetched_at?: boolean
    started_at?: boolean
    completed_at?: boolean
  } = {}
) {
  const now = new Date().toISOString()
  const fetched_at = updates.fetched_at ? now : null
  const started_at = updates.started_at ? now : null
  const completed_at = updates.completed_at ? now : null

  updateTaskStatusStmt.run(status, fetched_at, started_at, completed_at, taskId)
  logSyncEvent(taskId, 'status_changed', { status })
}

export function updateTaskResult(
  taskId: string,
  status: 'completed' | 'failed',
  output: Record<string, any>,
  error?: string,
  duration_ms?: number
) {
  updateTaskResultStmt.run(
    status,
    JSON.stringify(output),
    error || null,
    new Date().toISOString(),
    duration_ms || null,
    taskId
  )

  logSyncEvent(taskId, status, { output_keys: Object.keys(output) })
}

export function logSyncEvent(
  taskId: string,
  eventType: string,
  eventData: Record<string, any> = {}
) {
  logSyncEventStmt.run(taskId, eventType, JSON.stringify(eventData))
}

export function getSyncStatus() {
  const pending = (pendingCountStmt.get() as any).count
  const completed = (completedCountStmt.get() as any).count
  const inProgress = inProgressStmt.get() as any
  const lastSync = (lastSyncStmt.get() as any)?.timestamp

  return {
    pending_count: pending,
    completed_today: completed,
    in_progress: inProgress ? getChannelTask(inProgress.id) : null,
    last_sync: lastSync
  }
}

export default db
