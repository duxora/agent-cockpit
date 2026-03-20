#!/bin/bash
# Called by Claude Code Stop hook (each turn end)
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null)

[ -z "$SESSION_ID" ] && exit 0

COCKPIT_URL="${COCKPIT_URL:-https://agent-cockpit-production.up.railway.app}"
COCKPIT_AUTH="${COCKPIT_AUTH:-admin:spartan2026}"

curl -sf --max-time 5 -X POST "$COCKPIT_URL/api/hooks/heartbeat" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"status\":\"active\"}" \
  -u "$COCKPIT_AUTH" \
  >/dev/null 2>&1 &

exit 0
