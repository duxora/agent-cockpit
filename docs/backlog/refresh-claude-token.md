# Refresh Claude Setup Token via Cockpit UI

**Priority:** Medium
**Status:** Open

## Summary

Add a UI in Agent Cockpit to refresh the `CLAUDE_CODE_AUTH_TOKEN` Railway env var without SSH or CLI access. Currently, when the token expires, you must run `claude setup-token` locally, copy the token, and manually update the Railway variable — tedious for a remote-first workflow.

## Requirements

1. **Settings page or button** in cockpit UI to update the Claude auth token
2. **API endpoint** `POST /api/settings/claude-token` that accepts the new token
3. **Server-side**: Update the Railway env var via Railway API or CLI, then trigger a redeploy
4. **Validation**: Verify the token format before saving (starts with `sk-ant-oat`)
5. **Security**: This endpoint must require authentication (basic auth)

## Implementation Notes

- Railway CLI: `railway variable set CLAUDE_CODE_AUTH_TOKEN=<token>` + `railway redeploy`
- Alternatively, use Railway API directly if CLI isn't available in the container
- Could also store token in a mounted volume or Railway volume instead of env var to avoid redeploy
- Consider showing token expiry status if Claude Code exposes that info
