# Channel API Reference

## Endpoints

All endpoints require Basic authentication (COCKPIT_USER:COCKPIT_PASSWORD)

### GET /api/channel/tasks/pending

Fetch pending tasks for Claude Code to execute.

**Response:**
```json
{
  "tasks": [
    {
      "id": "uuid-1",
      "task_type": "deployment",
      "title": "Deploy to production",
      "input_payload": { "branch": "main" },
      "created_at": "2026-03-21T12:00:00Z"
    }
  ],
  "checkpoint": "uuid-1"
}
```

### POST /api/channel/tasks/{id}/result

Report task completion result.

**Request Body:**
```json
{
  "status": "completed",
  "output_payload": {
    "deployment_id": "xyz",
    "url": "https://...",
    "logs": "Build output"
  },
  "error_message": null,
  "duration_ms": 45000
}
```

**Response:**
```json
{
  "acknowledged": true,
  "task_id": "uuid-1"
}
```

### GET /api/channel/sync/status

Get current sync status (for dashboard).

**Response:**
```json
{
  "session_id": "claude-session-xyz",
  "status": "connected",
  "last_sync": "2026-03-21T12:05:00Z",
  "pending_count": 5,
  "completed_today": 12,
  "in_progress": {
    "id": "uuid-3",
    "task_type": "deployment",
    "title": "Deploy to production",
    "started_at": "2026-03-21T12:10:00Z"
  }
}
```

## Task Lifecycle

1. **pending** - Task created, awaiting Claude
2. **fetched** - Claude fetched the task
3. **executing** - Claude is executing the task
4. **completed** - Task completed successfully
5. **failed** - Task failed with error

## Idempotency

All operations are idempotent:
- Posting the same result twice is safe
- Tasks are deduplicated by UUID
- Timestamps preserve ordering
