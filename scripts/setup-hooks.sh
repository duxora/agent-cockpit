#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HOOK_DIR="$HOME/.claude/hooks"

echo "Installing Agent Cockpit hooks..."

# Create hooks directory
mkdir -p "$HOOK_DIR"

# Copy hook scripts
cp "$PROJECT_DIR/hooks/cockpit-register.sh" "$HOOK_DIR/"
cp "$PROJECT_DIR/hooks/cockpit-heartbeat.sh" "$HOOK_DIR/"
cp "$PROJECT_DIR/hooks/cockpit-notify.sh" "$HOOK_DIR/"
chmod +x "$HOOK_DIR"/cockpit-*.sh

echo "  Hook scripts installed to $HOOK_DIR"

# Merge hook config into settings.json
python3 "$SCRIPT_DIR/merge-hooks.py"

echo ""
echo "Done! Agent Cockpit hooks are installed."
echo ""
echo "Configuration:"
echo "  COCKPIT_URL  — default: http://localhost:4200"
echo "  COCKPIT_AUTH — set to user:pass for remote cockpit with auth"
echo ""
echo "Add to your shell profile (~/.zshrc or ~/.bashrc):"
echo "  export COCKPIT_URL=http://localhost:4200"
