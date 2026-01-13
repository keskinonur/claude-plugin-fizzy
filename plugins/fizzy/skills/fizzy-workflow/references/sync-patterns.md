# Fizzy Sync Patterns

Sync patterns and best practices for Fizzy.do integration.

## Sync Modes

### Automatic (Hook-Based)
PostToolUse hook on TodoWrite automatically syncs todos to configured board.
**Best for:** Continuous tracking, real-time visibility, hands-off workflow.

### Manual (Command-Based)
Use `/fizzy:sync` or ask to sync explicitly.
**Best for:** Periodic snapshots, controlled timing, review before sync.

### Guided (Skill-Based)
Use fizzy-workflow skill for step-by-step sync with confirmations.
**Best for:** First-time users, complex decisions, custom card titles.

## Card Naming Conventions

| Pattern | Example |
|---------|---------|
| Feature-based | "Implement user authentication" |
| Session-based | "2024-01-15 Development Session" |
| Task-based | "Refactor database queries" |

## Step Mapping

The plugin maintains a mapping between todo content and Fizzy step IDs in `step_map`:

```json
{"step_map": {"Implement login form": "step_abc123", "Add validation": "step_def456"}}
```

**Matching strategy:** Exact match updates existing; no match creates new step.

**Note:** When todo content changes significantly, old step may become orphaned.

## Multi-Session Workflows

| Scenario | Action |
|----------|--------|
| Continue previous work | Check state file, resume on same card |
| Start fresh | Close previous card, clear state, create new |
| Parallel workstreams | Use separate cards per feature |

## Conflict Resolution

| Problem | Solution |
|---------|----------|
| Duplicate todos | step_map prevents duplicates |
| Out-of-sync state | Refresh from Fizzy.do or reset state file |
| Concurrent edits | Use separate cards per developer |

## Performance Tips

- Batch operations with `fizzy_sync_todos`
- Update state only when card/steps change
- Fetch card details only when needed

## Error Handling

- Network failures: Continue session, retry later
- Rate limits: Implement backoff
- Invalid state: Reset and re-sync from Fizzy.do

## Best Practices

1. Use descriptive card titles
2. Keep todos concise and actionable
3. Sync regularly to prevent drift
4. Close completed cards
5. Handle errors gracefully (never block session)
6. Validate configuration before sync
