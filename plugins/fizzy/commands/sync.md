---
description: Manually trigger todo sync to Fizzy.do
allowed-tools: [Bash]
---

# Manual Sync

Trigger a manual sync to Fizzy.do.

## Steps

1. If user has current todos, use TodoWrite to trigger the automatic hook
2. Otherwise, report no todos to sync

## Note

Syncing happens automatically via the PostToolUse hook. This command is for manual intervention.
