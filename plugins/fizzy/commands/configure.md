---
description: Configure which Fizzy.do board to sync todos to
argument-hint: "<board-name>"
allowed-tools: [Bash]
---

# Configure Fizzy Board

Configure which board to use for todo synchronization.

## Usage

`/fizzy:configure "My Project"` or `/fizzy:configure` (will prompt for name)

## Steps

1. Run the configure script with the board name:

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/configure.sh "BOARD_NAME"
```

2. Report success or failure

## Notes

- Creates the board if it doesn't exist
- Saves to `.claude/fizzy_claude.json` in the project directory
- Requires `/fizzy:setup` to be run first
