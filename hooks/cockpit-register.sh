#!/bin/bash
# Called by Claude Code SessionStart hook
# Registers session with Agent Cockpit
# Telemetry only: stdout stays empty and the exit code stays 0. Claude Code parses
# hook stdout as a decision payload, so any stray line here is a malformed one.
# See server/hook-decision.ts for the blocking contract (exit 2 + valid payload).
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null)
CWD=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null)
# startup | resume | clear | compact | fork ('fork' added in Claude Code v2.1.214)
SOURCE=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('source',''))" 2>/dev/null)
NAME=$(basename "$CWD")

[ -z "$SESSION_ID" ] && exit 0

COCKPIT_URL="${COCKPIT_URL:-https://agent-cockpit-production.up.railway.app}"
COCKPIT_AUTH="${COCKPIT_AUTH:-admin:spartan2026}"

curl -sf --max-time 5 -X POST "$COCKPIT_URL/api/hooks/session-start" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"name\":\"$NAME\",\"cwd\":\"$CWD\",\"source\":\"$SOURCE\"}" \
  -u "$COCKPIT_AUTH" \
  >/dev/null 2>&1 &

exit 0
