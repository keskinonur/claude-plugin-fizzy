# Fizzy

**Your AI's work, visible to your team.**

Fizzy syncs Claude Code todos to [Fizzy.do](https://fizzy.do) cards in real-time. When Claude plans and executes tasks, your team sees the progress live.

## Why?

When Claude works on complex tasks, it creates internal todo lists. These disappear when the session ends. Fizzy captures them as persistent cards your whole team can track.

```
Claude creates todos → Fizzy syncs automatically → Team sees progress in Fizzy.do
```

## Install

```bash
claude plugin marketplace add keskinonur/claude-plugin-fizzy
claude plugin install fizzy
```

Build the MCP server:
```bash
cd ~/.claude/plugins/cache/fizzy-marketplace/fizzy/*/servers/fizzy-mcp
npm install && npm run build
```

## Setup

1. Get your API token from [Fizzy.do Settings](https://app.fizzy.do/settings)

2. Connect your account:
   ```
   /fizzy:setup <your-token>
   ```

3. Set your sync target:
   ```
   /fizzy:configure "My Project"
   ```

Done. Your todos now sync automatically.

## How It Works

When Claude uses `TodoWrite`, a hook automatically:
- Creates a card in your configured board
- Adds each todo as a step
- Updates completion status in real-time
- Prefixes cards with `[Claude]` for easy filtering

## Commands

| Command | Description |
|---------|-------------|
| `/fizzy:setup <token>` | Connect your Fizzy.do account |
| `/fizzy:configure <board>` | Set which board to sync to |
| `/fizzy:status` | Check connection and sync status |

## For Teams

Cards created by Claude show up alongside your team's work in Fizzy.do:

- **Transparency** - See what Claude is working on
- **Handoff** - If Claude stops, remaining steps are visible
- **Integration** - AI work tracked in same board as human work

## Token Storage

Fizzy checks these locations (in order):
1. Environment variable `FIZZY_TOKEN`
2. macOS Keychain
3. Config file `~/.claude/plugins/fizzy/config.json`

## Requirements

- Claude Code CLI
- Node.js 18+
- Fizzy.do account
- `jq` and `curl`

## License

Apache-2.0
