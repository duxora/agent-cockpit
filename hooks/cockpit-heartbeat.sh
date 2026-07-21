#!/bin/bash
# Called by Claude Code Stop hook (each turn end)
# Telemetry only: stdout stays empty and the exit code stays 0. Stop hooks can
# block with {"decision":"block","reason":...}; this one never should.
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',''))" 2>/dev/null)

[ -z "$SESSION_ID" ] && exit 0

COCKPIT_URL="${COCKPIT_URL:-https://agent-cockpit-production.up.railway.app}"
# No baked-in credential. Send auth only when COCKPIT_AUTH is set in the env;
# these endpoints are public server-side, so shipping no default secret is safe.
auth_args=()
[ -n "${COCKPIT_AUTH:-}" ] && auth_args=(-u "$COCKPIT_AUTH")

curl -sf --max-time 5 -X POST "$COCKPIT_URL/api/hooks/heartbeat" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"status\":\"active\"}" \
  "${auth_args[@]}" \
  >/dev/null 2>&1 &

exit 0
