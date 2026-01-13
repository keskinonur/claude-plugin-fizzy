---
description: Show Fizzy.do connection and sync status
allowed-tools: [Bash, Read]
---

# Fizzy Status

Show current connection and sync status.

## Steps

1. Check config files:

```bash
cat .claude/fizzy_claude.json 2>/dev/null || echo "{}"
cat .claude/fizzy_state.json 2>/dev/null || echo "{}"
```

2. Report status:
   - **Board**: Name and ID (or "Not configured - run /fizzy:configure")
   - **Card**: Current card number and title (or "No active card")
   - **Steps**: Count of synced steps
