#!/bin/bash
# Called by Claude Code Notification hook (permission prompts)
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null)

[ -z "$SESSION_ID" ] && exit 0

COCKPIT_URL="${COCKPIT_URL:-http://localhost:4200}"

curl -sf -X POST "$COCKPIT_URL/api/hooks/heartbeat" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"status\":\"waiting\"}" \
  ${COCKPIT_AUTH:+-u "$COCKPIT_AUTH"} \
  >/dev/null 2>&1 &

exit 0
