# Agent Cockpit Channel Setup Guide

## Installation

1. Install the channel plugin from the repository:
```bash
claude /plugin install agent-cockpit@agent-cockpit-repo
```

2. Configure credentials:
```bash
claude /agent-cockpit:configure
```

This creates `~/.claude/channels/agent-cockpit/.env`

3. Start Claude Code with the channel enabled:
```bash
claude --channels plugin:agent-cockpit@agent-cockpit-repo
```

## Configuration

Environment variables in `~/.claude/channels/agent-cockpit/.env`:

- `AGENT_COCKPIT_URL` - Agent Cockpit server URL (default: http://localhost:4200)
- `COCKPIT_USER` - Admin username (default: admin)
- `COCKPIT_PASSWORD` - Admin password
- `POLL_INTERVAL_SECONDS` - How often to check for tasks (default: 30)
- `MAX_TASKS_PER_POLL` - Maximum tasks per poll (default: 10)

## How It Works

1. Claude Code connects to Agent Cockpit via the channel
2. Every 30 seconds, Claude polls for pending tasks
3. When tasks arrive, Claude executes them autonomously
4. Claude reports results back to Agent Cockpit
5. Agent Cockpit UI shows task status and execution results
6. Users can create tasks in the "Claude Tasks" dashboard tab

## Offline Behavior

If Claude Code goes offline:
- Tasks queue in Agent Cockpit
- Dashboard shows "Pending: N"
- Claude reconnects → fetches all pending tasks
- No tasks are lost or duplicated

## Troubleshooting

**Channel doesn't connect:**
- Check `AGENT_COCKPIT_URL` is correct
- Verify `COCKPIT_PASSWORD` matches Agent Cockpit server
- Check firewall/network connectivity

**No tasks received:**
- Ensure Claude Code is running with `--channels` flag
- Check `POLL_INTERVAL_SECONDS` is reasonable
- Verify tasks exist in Agent Cockpit UI
