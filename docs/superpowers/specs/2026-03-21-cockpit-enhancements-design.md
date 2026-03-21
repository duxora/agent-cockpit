# Agent Cockpit Enhancements: Analytics, Hooks, GitHub, Skills

**Date:** 2026-03-21
**Status:** Design approved, ready for implementation
**Scope:** 4 independent enhancements leveraging new Claude Code capabilities

---

## Executive Summary

Four enhancements to Agent Cockpit to leverage modern Claude Code capabilities:

1. **Session Analytics Dashboard** - Metrics and historical trends for session performance
2. **Enhanced Hooks System** - UI for managing pre/post-session automation
3. **MCP GitHub Integration** - PR/issue tracking in operational dashboard
4. **Skill Management UI** - Browse and manage Claude Code skills from Cockpit

Each enhancement is independently deployable. Implementation order: Analytics → Hooks → GitHub → Skills.

---

## Enhancement 1: Session Analytics Dashboard

### Purpose
Provide visibility into session performance through metrics (duration, token usage, model distribution) and historical trends.

### Architecture

**Database Changes:**
```sql
CREATE TABLE session_metrics (
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

CREATE INDEX idx_session_metrics_session_id ON session_metrics(session_id);
CREATE INDEX idx_session_metrics_ended_at ON session_metrics(ended_at);
```

**Backend:**
- File: `server/db.ts` - Add `logSessionMetrics(sessionId, data)` function
- File: `server/index.ts` - Call `logSessionMetrics()` when session ends
- New endpoint: `GET /api/admin/analytics/metrics?days=30` - Return aggregated metrics
- New endpoint: `GET /api/admin/analytics/history?session_id=xxx` - Return session details

**Frontend:**
- New file: `src/components/AnalyticsDashboard.tsx` (500-600 lines)
  - Charts: Session duration (histogram), token usage (trend line), model distribution (pie)
  - Tables: Top sessions by duration, token usage, cost
  - Filters: Date range, model, session name
- Library: Recharts or Chart.js for visualizations
- Integration: Add "Analytics" tab to AdminPanel

### Data Model

```typescript
interface SessionMetric {
  sessionId: string
  sessionName: string
  model: string // 'sonnet', 'opus', etc.
  durationMs: number
  tokensUsed: number
  costUsd: number
  endedAt: number
}

interface AggregatedMetrics {
  totalSessions: number
  avgDurationMs: number
  totalTokensUsed: number
  totalCostUsd: number
  modelDistribution: Record<string, number>
  dailyTrends: Array<{ date: string; sessions: number; tokens: number }>
}
```

### Success Criteria
- ✅ Metrics collected on every session end
- ✅ Dashboard displays charts without errors
- ✅ Filters work (date range, model)
- ✅ Historical data persists across restarts
- ✅ Performance acceptable (queries <500ms for 30-day range)

---

## Enhancement 2: Enhanced Hooks System

### Purpose
Allow users to configure pre-session setup and post-session automation through a user-friendly UI.

### Architecture

**Database Changes:**
```sql
CREATE TABLE hooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hook_type TEXT NOT NULL, -- 'pre-session', 'post-session'
  trigger TEXT NOT NULL,    -- 'on-start', 'on-end', 'manual'
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  enabled BOOLEAN DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
);
```

**Backend:**
- File: `server/db.ts` - Add CRUD functions: `createHook()`, `listHooks()`, `updateHook()`, `deleteHook()`
- File: `server/index.ts` - Extend hook endpoints:
  - `GET /api/hooks` - List all hooks
  - `POST /api/hooks` - Create hook
  - `PUT /api/hooks/:id` - Update hook
  - `DELETE /api/hooks/:id` - Delete hook
- Hook execution: Extend existing SessionStart/SessionEnd hook system

**Frontend:**
- New file: `src/components/HooksManager.tsx` (400-500 lines)
  - Table of hooks with enable/disable toggles
  - Form to add new hooks (type, trigger, command, name)
  - Edit modal for existing hooks
  - Delete confirmation
- Template suggestions:
  - Pre-session: `export PROJECT_NAME=$COCKPIT_PROJECT`
  - Post-session: `echo "Session ended" >> ~/.cockpit/log.txt`
- Integration: Add "Hooks" tab to AdminPanel

### Data Model

```typescript
interface Hook {
  id: number
  hookType: 'pre-session' | 'post-session'
  trigger: 'on-start' | 'on-end' | 'manual'
  name: string
  command: string
  enabled: boolean
  createdAt: number
}
```

### Success Criteria
- ✅ Hooks UI functional (add, edit, delete, toggle)
- ✅ Hooks persist across restarts
- ✅ Pre-session hooks run before session starts
- ✅ Post-session hooks run after session ends
- ✅ Hook execution logged in session events
- ✅ Errors in hooks don't crash Cockpit

---

## Enhancement 3: MCP GitHub Integration

### Purpose
Display GitHub PR/issue information in Cockpit dashboard for better project visibility.

### Architecture

**Backend:**
- New file: `server/github.ts` - GitHub API client
  - Function: `initGitHub(token)` - Initialize with credentials
  - Function: `fetchPRs(owner, repo)` - Get open PRs
  - Function: `fetchIssues(owner, repo)` - Get open issues
  - Function: `fetchBranches(owner, repo)` - Get recent branches
  - Uses Octokit (npm package)
- New endpoints:
  - `GET /api/admin/github/config` - Get GitHub config (owner, repo)
  - `POST /api/admin/github/config` - Set GitHub config
  - `GET /api/admin/github/prs` - Fetch PRs for configured repo
  - `GET /api/admin/github/issues` - Fetch issues
  - `GET /api/admin/github/branches` - Fetch branches

**Frontend:**
- New file: `src/components/GitHubStatus.tsx` (300-400 lines)
  - Display: Open PRs (count, author, title), Open issues (count), Recent branches
  - Click to open GitHub links
  - Setup form: Owner + repo fields
  - Refresh button
- Integration: Add "GitHub" tab to AdminPanel

**Database Changes (minimal):**
```sql
CREATE TABLE github_config (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);
```

### Data Model

```typescript
interface GitHubPR {
  number: number
  title: string
  author: string
  state: 'open' | 'closed'
  url: string
}

interface GitHubIssue {
  number: number
  title: string
  state: 'open' | 'closed'
  labels: string[]
  url: string
}

interface GitHubBranch {
  name: string
  lastCommit: string
  lastCommitDate: string
}
```

### Success Criteria
- ✅ GitHub credentials stored securely
- ✅ PRs/issues/branches fetched without errors
- ✅ UI displays data correctly
- ✅ Links open GitHub in new tab
- ✅ Graceful handling of invalid credentials
- ✅ Refresh works and doesn't block UI

---

## Enhancement 4: Skill Management UI

### Purpose
Browse available Claude Code skills and manage activation from Cockpit dashboard.

### Architecture

**Backend:**
- New file: `server/skills.ts` - Skill discovery
  - Function: `listAvailableSkills()` - Scan `~/.claude/skills/` directory
  - Parse skill metadata (name, description, version)
  - Function: `getSkillMetadata(skillName)` - Return skill details
- New endpoints:
  - `GET /api/skills` - List all available skills
  - `GET /api/skills/:name` - Get skill details
  - `POST /api/skills/:name/enable` - Enable skill (create symlink/config)
  - `POST /api/skills/:name/disable` - Disable skill

**Frontend:**
- New file: `src/components/SkillsManager.tsx` (300-400 lines)
  - Table of skills: Name, description, version, enabled toggle
  - Click to view skill details (README, usage)
  - Search/filter by category
  - Enable/disable toggles
- Integration: Add "Skills" tab to AdminPanel

**Skill Discovery:**
- Read from: `~/.claude/skills/` directory structure
- Parse: `skill.md` or `manifest.json` for metadata
- Detect: By directory name and frontmatter

### Data Model

```typescript
interface Skill {
  name: string
  description: string
  version: string
  category: string // 'development', 'automation', 'analysis', etc.
  enabled: boolean
  path: string // ~/.claude/skills/skill-name
}

interface SkillMetadata {
  name: string
  description: string
  usage: string
  examples: string[]
  dependencies: string[]
}
```

### Success Criteria
- ✅ Skills discovered from filesystem
- ✅ UI displays skills with metadata
- ✅ Enable/disable toggles work
- ✅ Skill details display correctly
- ✅ Search/filter functional
- ✅ No errors on startup if skills dir doesn't exist

---

## Files Summary

### New Files
| File | Purpose | LOC |
|------|---------|-----|
| `server/github.ts` | GitHub API client | 150-200 |
| `server/skills.ts` | Skill discovery | 100-150 |
| `src/components/AnalyticsDashboard.tsx` | Metrics dashboard | 500-600 |
| `src/components/GitHubStatus.tsx` | GitHub info display | 300-400 |
| `src/components/HooksManager.tsx` | Hooks UI | 400-500 |
| `src/components/SkillsManager.tsx` | Skills UI | 300-400 |

### Modified Files
| File | Changes | Impact |
|------|---------|--------|
| `server/index.ts` | Add 8 new endpoints, hook logging | Medium |
| `server/db.ts` | Add 4 new tables, 12 new functions | Medium |
| `src/components/AdminPanel.tsx` | Add 4 new tabs | Low |
| `src/App.tsx` | (no changes needed) | None |

### Dependencies
- `octokit` - GitHub API client (new)
- `recharts` or `chart.js` - Charting (new)
- Existing: express, better-sqlite3, react, typescript

---

## Implementation Order & Dependencies

**Phase 1: Session Analytics** (Independent)
- No external dependencies
- Foundation for future metrics

**Phase 2: Enhanced Hooks** (Independent)
- Builds on existing hook system
- No new external dependencies

**Phase 3: GitHub Integration** (Independent)
- Requires Octokit package
- Requires user GitHub token setup

**Phase 4: Skill Management** (Independent)
- Filesystem operations only
- No external dependencies

All 4 can be implemented in parallel after approval, or sequentially for stability.

---

## Testing Strategy

### Unit Tests
- Analytics aggregation logic
- Hook CRUD operations
- GitHub API client methods
- Skill discovery logic

### Integration Tests
- Endpoints return correct data
- Database operations are atomic
- UI components render without errors

### Manual E2E
- Analytics: Verify metrics collected and displayed
- Hooks: Run pre/post hooks and verify execution
- GitHub: Connect real GitHub account and verify data fetches
- Skills: Check skill discovery and toggle functionality

---

## Rollout Plan

**Phase 1 (Week 1):** Analytics + Hooks
**Phase 2 (Week 2):** GitHub + Skills
**Phase 3:** Monitoring and user feedback
**Phase 4 (Optional):** Advanced features
- Analytics: Cost estimation, budgeting alerts
- Hooks: Conditional hooks, scheduling
- GitHub: PR comments, issue creation
- Skills: Custom skill creation UI

---

## Success Metrics

- ✅ All 4 enhancements deployed without bugs
- ✅ Analytics dashboard shows accurate metrics
- ✅ Hooks execute reliably
- ✅ GitHub integration works with real repos
- ✅ Skill discovery works for all installed skills
- ✅ No performance regression in Cockpit
- ✅ User can manage all features through UI

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| GitHub token security | Medium | Store encrypted in DB, never log |
| Analytics query performance | Low | Index on session_id and ended_at |
| Hook execution blocking UI | Medium | Run hooks in background thread |
| Skill path variations | Low | Normalize paths, handle missing dirs |
| External API failures (GitHub) | Low | Graceful degradation, cached data |

---

## Next Steps

1. ✅ Design approved
2. → Write implementation plans (writing-plans skill)
3. → Execute plans with subagents (subagent-driven-development)
4. → Deploy to Railway
5. → Monitor and iterate based on feedback
