import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import type { Express, Request, Response } from 'express'

const DB_PATH = path.join(os.homedir(), '.backlog', 'backlog.db')

/** Map snake_case DB row to camelCase task object */
function toTask(row: Record<string, any>): Record<string, any> {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    type: row.type,
    priority: row.priority,
    status: row.status,
    domain: row.domain,
    specPath: row.spec_path,
    prNumber: row.pr_number,
    branch: row.branch,
    supersedes: row.supersedes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    dueDate: row.due_date,
  }
}

export function registerBacklogRoutes(app: Express): void {
  let db: Database.Database

  try {
    db = new Database(DB_PATH, { readonly: true })
    db.pragma('journal_mode = WAL')
  } catch (err) {
    console.warn(`[backlog] Could not open ${DB_PATH}: ${err}`)
    console.warn('[backlog] Backlog routes will return 503')

    // Register stub routes that return 503 when DB is unavailable
    app.get('/api/backlog/*', (_req: Request, res: Response) => {
      res.status(503).json({ error: 'Backlog database not available' })
    })
    return
  }

  // --- GET /api/backlog/projects ---
  app.get('/api/backlog/projects', (_req: Request, res: Response) => {
    try {
      const rows = db.prepare(`
        SELECT p.id, p.name, p.repo_path,
          SUM(CASE WHEN t.status = 'open' THEN 1 ELSE 0 END) AS open_count,
          SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
          SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_count,
          SUM(CASE WHEN t.status = 'deferred' THEN 1 ELSE 0 END) AS deferred_count
        FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
        WHERE p.archived_at IS NULL
        GROUP BY p.id, p.name
        ORDER BY p.name
      `).all()

      res.json(rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        repoPath: r.repo_path,
        stats: {
          open: r.open_count ?? 0,
          inProgress: r.in_progress_count ?? 0,
          done: r.done_count ?? 0,
          deferred: r.deferred_count ?? 0,
        },
      })))
    } catch (err) {
      console.error('[backlog] projects error:', err)
      res.status(500).json({ error: 'Failed to list projects' })
    }
  })

  // --- GET /api/backlog/tasks ---
  app.get('/api/backlog/tasks', (req: Request, res: Response) => {
    try {
      const { project, status, priority, domain, search } = req.query

      if (!project) {
        res.status(400).json({ error: 'project query param is required' })
        return
      }

      const conditions: string[] = ['t.project_id = ?']
      const params: any[] = [project]

      if (status) {
        const statuses = (status as string).split(',').map(s => s.trim())
        conditions.push(`t.status IN (${statuses.map(() => '?').join(',')})`)
        params.push(...statuses)
      }

      if (priority) {
        const priorities = (priority as string).split(',').map(p => p.trim())
        conditions.push(`t.priority IN (${priorities.map(() => '?').join(',')})`)
        params.push(...priorities)
      }

      if (domain) {
        conditions.push('t.domain = ?')
        params.push(domain)
      }

      if (search) {
        conditions.push('(t.title LIKE ? OR t.description LIKE ?)')
        const searchPattern = `%${search}%`
        params.push(searchPattern, searchPattern)
      }

      const sql = `
        SELECT t.* FROM tasks t
        WHERE ${conditions.join(' AND ')}
        ORDER BY
          CASE t.priority
            WHEN 'critical' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
            ELSE 4
          END ASC,
          t.created_at ASC
      `

      const rows = db.prepare(sql).all(...params) as Record<string, any>[]
      res.json(rows.map(toTask))
    } catch (err) {
      console.error('[backlog] tasks error:', err)
      res.status(500).json({ error: 'Failed to list tasks' })
    }
  })

  // --- GET /api/backlog/tasks/:id ---
  app.get('/api/backlog/tasks/:id', (req: Request, res: Response) => {
    try {
      const taskId = req.params.id

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, any> | undefined
      if (!task) {
        res.status(404).json({ error: 'Task not found' })
        return
      }

      const notes = db.prepare(
        'SELECT id, task_id AS taskId, content, added_by AS addedBy, created_at AS createdAt FROM task_notes WHERE task_id = ? ORDER BY created_at ASC'
      ).all(taskId)

      const history = db.prepare(
        'SELECT id, task_id AS taskId, field, old_value AS oldValue, new_value AS newValue, changed_by AS changedBy, changed_at AS changedAt FROM task_history WHERE task_id = ? ORDER BY changed_at ASC'
      ).all(taskId)

      const claim = db.prepare(
        "SELECT task_id AS taskId, agent, session_id AS sessionId, claimed_at AS claimedAt, heartbeat_at AS heartbeatAt FROM claims WHERE task_id = ? AND heartbeat_at > datetime('now', '-2 hours')"
      ).get(taskId) ?? null

      res.json({
        ...toTask(task),
        notes,
        history,
        claim,
      })
    } catch (err) {
      console.error('[backlog] task detail error:', err)
      res.status(500).json({ error: 'Failed to get task detail' })
    }
  })

  // --- GET /api/backlog/domains ---
  app.get('/api/backlog/domains', (req: Request, res: Response) => {
    try {
      const { project } = req.query

      if (!project) {
        res.status(400).json({ error: 'project query param is required' })
        return
      }

      const rows = db.prepare(
        'SELECT DISTINCT domain FROM tasks WHERE project_id = ? AND domain IS NOT NULL ORDER BY domain'
      ).all(project) as { domain: string }[]

      res.json(rows.map(r => r.domain))
    } catch (err) {
      console.error('[backlog] domains error:', err)
      res.status(500).json({ error: 'Failed to list domains' })
    }
  })

  console.log('[backlog] Routes registered (read-only)')
}
