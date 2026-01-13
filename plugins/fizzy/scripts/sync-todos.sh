#!/bin/bash
# Hook script that syncs Claude Code todos to Fizzy.do

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

# Security: Sanitize extracted content to prevent injection
# Removes control characters, limits length, strips dangerous patterns
sanitize_content() {
    local input="$1"
    local max_length="${2:-500}"
    # Remove control chars except newline/tab, truncate, strip backticks and $()
    echo "$input" | tr -d '\r' | tr '\000-\010\013\014\016-\037' ' ' | \
        head -c "$max_length" | sed 's/[`]//g; s/\$([^)]*)//g; s/\${[^}]*}//g'
}

load_env || { output_error "Fizzy not configured. Run /fizzy:setup first."; exit 0; }

INPUT=$(cat)
TODOS=$(echo "$INPUT" | jq -r '.tool_input.todos // empty')

[[ -z "$TODOS" || "$TODOS" == "null" ]] && exit 0

TODO_COUNT=$(echo "$TODOS" | jq 'length')
[[ "$TODO_COUNT" -eq 0 ]] && { clear_state; exit 0; }

CONFIG=$(get_config)
BOARD_ID=$(echo "$CONFIG" | jq -r '.board_id // empty')

[[ -z "$BOARD_ID" ]] && { output_message "Fizzy sync: No board configured. Run /fizzy:configure \\\"$(basename "$PWD")\\\" to set up."; exit 0; }

STATE=$(get_state)
CARD_NUMBER=$(echo "$STATE" | jq -r '.card_number // empty')
CARD_TITLE=$(echo "$STATE" | jq -r '.card_title // empty')
FIRST_TODO_CONTENT=$(sanitize_content "$(echo "$TODOS" | jq -r '.[0].content // empty')" 200)

process_todo() {
    local todo="$1"
    local content=$(sanitize_content "$(echo "$todo" | jq -r '.content')")
    local completed=$([[ "$(echo "$todo" | jq -r '.status')" == "completed" ]] && echo "true" || echo "false")
    local step_id=$(echo "$STEP_MAP" | jq -r --arg c "$content" '.[$c] // empty')

    if [[ -n "$step_id" ]]; then
        update_step "$CARD_NUMBER" "$step_id" "$completed" > /dev/null
        ((UPDATED_COUNT++))
    else
        step_id=$(add_step "$CARD_NUMBER" "$content")
        [[ -z "$step_id" ]] && return
        STEP_MAP=$(echo "$STEP_MAP" | jq --arg c "$content" --arg id "$step_id" '. + {($c): $id}')
        ((NEW_COUNT++))
        [[ "$completed" == "true" ]] && update_step "$CARD_NUMBER" "$step_id" true > /dev/null || true
    fi
}

process_all_todos() {
    while IFS= read -r todo; do process_todo "$todo"; done < <(echo "$TODOS" | jq -c '.[]')
    STATE=$(echo "$STATE" | jq --argjson sm "$STEP_MAP" '.step_map = $sm')
    save_state "$STATE"
}

NEW_COUNT=0
UPDATED_COUNT=0

if [[ -z "$CARD_NUMBER" || "$FIRST_TODO_CONTENT" != "$CARD_TITLE" ]]; then
    CARD_NUMBER=$(create_card "$BOARD_ID" "[Claude] $FIRST_TODO_CONTENT")
    [[ -z "$CARD_NUMBER" ]] && { output_error "Failed to create Fizzy card"; exit 0; }
    STATE=$(jq -n --arg cn "$CARD_NUMBER" --arg ct "$FIRST_TODO_CONTENT" '{card_number: $cn, card_title: $ct, step_map: {}}')
    STEP_MAP="{}"
    process_all_todos
    output_message "Fizzy: Created card #$CARD_NUMBER with $TODO_COUNT steps"
else
    STEP_MAP=$(echo "$STATE" | jq -r '.step_map // {}')
    process_all_todos
    [[ $NEW_COUNT -gt 0 ]] \
        && output_message "Fizzy: Updated card #$CARD_NUMBER (+$NEW_COUNT new steps)" \
        || output_message "Fizzy: Synced $UPDATED_COUNT steps to card #$CARD_NUMBER"
fi
