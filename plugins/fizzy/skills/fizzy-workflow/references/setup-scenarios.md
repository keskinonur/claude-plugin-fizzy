# Fizzy Setup Scenarios

Scenarios and troubleshooting for Fizzy.do project setup.

## Scenario 1: Fresh Project Setup

New project with no existing Fizzy configuration.

1. Check existing configuration: `cat .claude/fizzy_claude.json 2>/dev/null`
2. Verify token: `[ -n "$FIZZY_TOKEN" ] && echo "Available"`
3. If token missing, guide to https://app.fizzy.do/settings to generate one
4. List boards and let user select or create new
5. Save to `.claude/fizzy_claude.json`

## Scenario 2: Reconfiguration

Project already configured, user wants different board.

1. Show current board configuration
2. Confirm reconfiguration intent
3. Offer: select existing, create new, or keep current
4. Update `.claude/fizzy_claude.json`
5. Clear `.claude/fizzy_state.json` to reset card tracking

## Scenario 3: Team/Shared Board Setup

User wants to use a shared team board.

**Considerations:**
- Verify user has board access
- Card titles should include context (e.g., "[Username] Feature X")
- Consider separate boards per developer for clarity

**Steps:**
1. List boards and identify shared ones (usually have more cards)
2. Confirm shared board selection with visibility warning
3. Suggest naming convention: "[Your Name] Task Description"

## Troubleshooting

### Token Not Working
- Verify no extra spaces in token
- Check token hasn't expired
- Regenerate from Fizzy.do settings

### Board Not Found
- Board may have been deleted
- Access may have been revoked
- Reconfigure with valid board

### Permission Denied
- Check board permissions in Fizzy.do
- Request edit access from board owner
- Use a different board

## Environment Setup

```bash
# Project .env file (recommended)
FIZZY_TOKEN=your-token-here

# Or global in ~/.bashrc or ~/.zshrc
export FIZZY_TOKEN=your-token-here

# Or per-session
FIZZY_TOKEN=your-token-here claude
```

## Validation Checklist

- [ ] FIZZY_TOKEN is set and valid
- [ ] Board exists and is accessible
- [ ] `.claude/fizzy_claude.json` has correct board_id
- [ ] Can create a test card
- [ ] Hook triggers on TodoWrite
