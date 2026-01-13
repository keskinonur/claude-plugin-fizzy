#!/bin/bash
# Shared functions for Fizzy.do API integration

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

# Security: Check file permissions (should be 600 or 400)
check_env_permissions() {
    local file="$1"
    if [[ "$(uname)" == "Darwin" || "$(uname)" == "Linux" ]]; then
        local perms=$(stat -f "%Lp" "$file" 2>/dev/null || stat -c "%a" "$file" 2>/dev/null)
        if [[ "$perms" != "600" && "$perms" != "400" ]]; then
            echo "Warning: $file has insecure permissions ($perms). Run: chmod 600 $file" >&2
        fi
    fi
}

# Security: Parse env file safely - only extract whitelisted variables
parse_env_safe() {
    local env_file="$1"
    while IFS='=' read -r key value || [[ -n "$key" ]]; do
        [[ "$key" =~ ^[[:space:]]*# || -z "$key" || -z "$value" ]] && continue
        key="${key// /}"
        value="${value#[\"']}" && value="${value%[\"']}"
        case "$key" in
            FIZZY_TOKEN|FIZZY_URL|FIZZY_ACCOUNT_SLUG) export "$key"="$value" ;;
        esac
    done < "$env_file"
}

# Security: Try macOS Keychain for token storage
get_token_from_keychain() {
    if [[ "$(uname)" == "Darwin" ]] && command -v security &>/dev/null; then
        security find-generic-password -a "$USER" -s "fizzy-token" -w 2>/dev/null && return 0
    fi
    return 1
}

# Try plugin config.json (created by /fizzy:setup)
get_token_from_config() {
    local config_file="$HOME/.claude/plugins/fizzy/config.json"
    if [[ -f "$config_file" ]]; then
        check_env_permissions "$config_file"
        local token=$(jq -r '.token // empty' "$config_file" 2>/dev/null)
        local url=$(jq -r '.url // empty' "$config_file" 2>/dev/null)
        if [[ -n "$token" ]]; then
            export FIZZY_TOKEN="$token"
            [[ -n "$url" ]] && export FIZZY_URL="$url"
            return 0
        fi
    fi
    return 1
}

load_env() {
    # 1. Environment variable (highest priority)
    if [[ -n "${FIZZY_TOKEN:-}" ]]; then
        FIZZY_URL="${FIZZY_URL:-https://app.fizzy.do}"
        return 0
    fi

    # 2. macOS Keychain
    if FIZZY_TOKEN=$(get_token_from_keychain 2>/dev/null); then
        export FIZZY_TOKEN
        FIZZY_URL="${FIZZY_URL:-https://app.fizzy.do}"
        return 0
    fi

    # 3. Plugin config.json (from /fizzy:setup)
    if get_token_from_config; then
        FIZZY_URL="${FIZZY_URL:-https://app.fizzy.do}"
        return 0
    fi

    # 4. Fall back to .env files
    local env_files=("$PWD/.env" "$HOME/.env" "$PLUGIN_ROOT/.env")
    for env_file in "${env_files[@]}"; do
        if [[ -f "$env_file" ]]; then
            check_env_permissions "$env_file"
            parse_env_safe "$env_file"
            if [[ -n "${FIZZY_TOKEN:-}" ]]; then
                FIZZY_URL="${FIZZY_URL:-https://app.fizzy.do}"
                return 0
            fi
        fi
    done

    echo "Error: FIZZY_TOKEN not set. Run /fizzy:setup to configure." >&2
    return 1
}

fizzy_api() {
    local method="$1" endpoint="$2" data="${3:-}"
    local curl_args=(-s -X "$method" -H "Authorization: Bearer ${FIZZY_TOKEN}" -H "Accept: application/json")

    [[ -n "$data" ]] && curl_args+=(-H "Content-Type: application/json" -d "$data")
    curl "${curl_args[@]}" "${FIZZY_URL}${endpoint}"
}

get_account_slug() {
    if [[ -z "${FIZZY_ACCOUNT_SLUG:-}" ]]; then
        FIZZY_ACCOUNT_SLUG=$(fizzy_api GET "/my/identity" | jq -r '.accounts[0].slug')
    fi
    echo "$FIZZY_ACCOUNT_SLUG"
}

get_config_path() { echo "$PWD/.claude/fizzy_claude.json"; }
get_state_path() { echo "$PWD/.claude/fizzy_state.json"; }

read_json_file() {
    local path="$1"
    [[ -f "$path" ]] && cat "$path" || echo "{}"
}

write_json_file() {
    local path="$1" content="$2"
    mkdir -p "$(dirname "$path")"
    echo "$content" > "$path"
    chmod 600 "$path"  # Restrictive permissions for security
}

get_config() { read_json_file "$(get_config_path)"; }
save_config() { write_json_file "$(get_config_path)" "$1"; }
get_state() { read_json_file "$(get_state_path)"; }
save_state() { write_json_file "$(get_state_path)" "$1"; }

clear_state() {
    local state_path="$(get_state_path)"
    [[ -f "$state_path" ]] && rm "$state_path"
}

list_boards() {
    fizzy_api GET "$(get_account_slug)/boards"
}

get_board() {
    fizzy_api GET "$(get_account_slug)/boards/$1"
}

find_board_by_name() {
    list_boards | jq -r --arg name "$1" '.[] | select(.name == $name) | .id'
}

create_board() {
    local name="$1"
    local data=$(jq -n --arg name "$name" '{board: {name: $name}}')
    fizzy_api POST "$(get_account_slug)/boards" "$data" > /dev/null
    find_board_by_name "$name"
}

create_card() {
    local board_id="$1" title="$2" description="${3:-}"
    local slug="$(get_account_slug)"
    local data=$(jq -n --arg t "$title" --arg d "$description" \
        'if $d == "" then {card: {title: $t}} else {card: {title: $t, description: $d}} end')

    curl -s -i --http1.1 -X POST \
        -H "Authorization: Bearer ${FIZZY_TOKEN}" \
        -H "Accept: application/json" \
        -H "Content-Type: application/json" \
        -d "$data" \
        "${FIZZY_URL}${slug}/boards/${board_id}/cards" \
        | grep -i "^location:" | grep -oE '/cards/[0-9]+' | grep -oE '[0-9]+'
}

get_card() {
    fizzy_api GET "$(get_account_slug)/cards/$1"
}

add_step() {
    local card_number="$1" content="$2"
    local slug="$(get_account_slug)"
    local data=$(jq -n --arg c "$content" '{step: {content: $c}}')

    curl -s -i --http1.1 -X POST \
        -H "Authorization: Bearer ${FIZZY_TOKEN}" \
        -H "Accept: application/json" \
        -H "Content-Type: application/json" \
        -d "$data" \
        "${FIZZY_URL}${slug}/cards/${card_number}/steps" \
        | grep -i "^location:" | sed -E 's|.*/steps/([^/.]+).*|\1|'
}

update_step() {
    local card_number="$1" step_id="$2" completed="$3"
    local data=$(jq -n --argjson completed "$completed" '{step: {completed: $completed}}')
    fizzy_api PUT "$(get_account_slug)/cards/${card_number}/steps/${step_id}" "$data"
}

delete_step() {
    fizzy_api DELETE "$(get_account_slug)/cards/$1/steps/$2"
}

output_message() { jq -n --arg msg "$1" '{result: $msg}'; }
output_error() { jq -n --arg msg "$1" '{error: $msg}' >&2; }
