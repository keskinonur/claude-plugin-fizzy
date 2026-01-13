#!/bin/bash
# Configure Fizzy.do board for the current project

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

load_env || { echo "Error: Fizzy not configured. Run /fizzy:setup first."; exit 1; }

if [[ $# -lt 1 ]]; then
    echo "Usage: configure.sh \"Board Name\""
    exit 1
fi

BOARD_NAME="$1"
echo "Configuring Fizzy board: $BOARD_NAME"

BOARD_ID=$(find_board_by_name "$BOARD_NAME")

if [[ -z "$BOARD_ID" ]]; then
    echo "Board not found. Creating new board..."
    BOARD_ID=$(create_board "$BOARD_NAME")
    [[ -z "$BOARD_ID" ]] && { echo "Error: Failed to create board"; exit 1; }
    echo "Created board: $BOARD_NAME (ID: $BOARD_ID)"
else
    echo "Found existing board: $BOARD_NAME (ID: $BOARD_ID)"
fi

save_config "$(jq -n --arg id "$BOARD_ID" --arg name "$BOARD_NAME" '{board_id: $id, board_name: $name}')"

echo "Configuration saved to .claude/fizzy_claude.json"
echo "Fizzy sync is now active for this project!"
echo "Your todos will automatically sync to board: $BOARD_NAME"
