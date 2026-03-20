#!/usr/bin/env python3
"""Merge cockpit hook configuration into ~/.claude/settings.json"""
import json
import os

SETTINGS_PATH = os.path.expanduser("~/.claude/settings.json")
HOOK_DIR = os.path.expanduser("~/.claude/hooks")

COCKPIT_HOOKS = {
    "SessionStart": [
        {
            "matcher": "",
            "hooks": [
                {
                    "type": "command",
                    "command": f"{HOOK_DIR}/cockpit-register.sh",
                    "timeout": 5
                }
            ]
        }
    ],
    "Stop": [
        {
            "matcher": "",
            "hooks": [
                {
                    "type": "command",
                    "command": f"{HOOK_DIR}/cockpit-heartbeat.sh",
                    "timeout": 5
                }
            ]
        }
    ],
    "Notification": [
        {
            "matcher": "",
            "hooks": [
                {
                    "type": "command",
                    "command": f"{HOOK_DIR}/cockpit-notify.sh",
                    "timeout": 5
                }
            ]
        }
    ]
}

# Load existing settings
settings = {}
if os.path.exists(SETTINGS_PATH):
    with open(SETTINGS_PATH) as f:
        settings = json.load(f)

# Merge hooks (append, don't overwrite)
if "hooks" not in settings:
    settings["hooks"] = {}

for event, hook_list in COCKPIT_HOOKS.items():
    if event not in settings["hooks"]:
        settings["hooks"][event] = []
    # Check if cockpit hook already installed
    existing_commands = [
        h.get("hooks", [{}])[0].get("command", "")
        for h in settings["hooks"][event]
    ]
    for hook in hook_list:
        cmd = hook["hooks"][0]["command"]
        if cmd not in existing_commands:
            settings["hooks"][event].append(hook)

# Write back
with open(SETTINGS_PATH, "w") as f:
    json.dump(settings, f, indent=2)
    f.write("\n")

print(f"Updated {SETTINGS_PATH}")
