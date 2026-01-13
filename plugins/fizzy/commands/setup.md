---
description: Connect your Fizzy.do account
argument-hint: "<token>"
allowed-tools: [Bash]
---

# Fizzy Setup

Connect the plugin to your Fizzy.do account.

## Usage

`/fizzy:setup <token>` where token is from https://app.fizzy.do/settings

## Steps

1. Save the token securely:

```bash
mkdir -p ~/.claude/plugins/fizzy
echo '{"token": "TOKEN_HERE", "url": "https://app.fizzy.do"}' > ~/.claude/plugins/fizzy/config.json
chmod 600 ~/.claude/plugins/fizzy/config.json
```

2. Verify the connection:

```bash
curl -s -H "Authorization: Bearer TOKEN_HERE" -H "Accept: application/json" https://app.fizzy.do/my/identity | jq -r 'if .accounts[0].name then "✓ Connected: " + .accounts[0].name else "✗ Invalid token" end'
```

3. On success, tell the user:
   - Setup complete! Run `/fizzy:configure "Board Name"` to set your sync target.

4. On failure, ask user to verify their token at https://app.fizzy.do/settings
