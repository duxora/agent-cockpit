# Agent Cockpit — Agent Session Fleet Manager

## Overview
Web dashboard for monitoring and controlling multiple AI agent sessions (Claude Code, Codex, etc.) running on a local machine. Access from any browser on the network.

## Architecture
- **Backend**: Node.js + Express + WebSocket (ws)
- **Frontend**: React + Vite + xterm.js + Tailwind CSS
- **Session Layer**: tmux for session hosting/persistence
- **Events**: Claude Code JSONL hooks for structured monitoring

## MVP Features

### 1. Session Dashboard
- Grid/list view of all active tmux sessions
- Per-session status: running, idle, waiting-for-input, errored
- Session metadata: project directory, start time, duration, agent type
- Auto-refresh via WebSocket push

### 2. Live Terminal View
- xterm.js-based terminal rendering
- Attach to any tmux session in read-write mode
- Split-pane view for monitoring multiple sessions simultaneously
- Full keyboard input support

### 3. Session Management
- Start new agent sessions (claude, codex, aider) in tmux
- Stop/kill sessions
- Detach from sessions (keep running in background)
- Session naming and tagging

### 4. Status Detection
- Idle detection: no output for configurable duration
- Permission prompt detection: scan terminal output for permission patterns
- Visual alerts: color-coded status badges, browser notifications
- Tab title updates showing session requiring attention

### 5. Session History
- Log session start/stop events
- Store terminal output snapshots
- Session duration tracking

## Tech Stack
- **Runtime**: Node.js 20+
- **Backend**: Express, ws (WebSocket), node-pty
- **Frontend**: React 18, Vite, xterm.js, @xterm/addon-fit, Tailwind CSS
- **Session**: tmux (system dependency)
- **Storage**: SQLite via better-sqlite3 (session metadata, events)

## API Design

### REST
- `GET /api/sessions` — List all tmux sessions with status
- `POST /api/sessions` — Create new session
- `DELETE /api/sessions/:name` — Kill session
- `GET /api/sessions/:name/logs` — Get session event log

### WebSocket
- `ws://host:port/ws/terminal/:session` — Terminal I/O stream
- `ws://host:port/ws/events` — Real-time status/event push

## Deployment
- Run locally: `npm start` → serves on port 4200
- Access from any device on LAN via `http://<local-ip>:4200`
- Optional: expose via Cloudflare Tunnel or ngrok for remote access
