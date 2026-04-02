#!/bin/bash
# WoClaw SessionStop Hook for OpenAI Codex CLI
# Reads session data from Codex stdin (JSON) and saves summary to WoClaw Hub

# Load env from ~/.woclaw/.env (set by install.js)
if [ -f "$HOME/.woclaw/.env" ]; then
  set -a
  source "$HOME/.woclaw/.env"
  set +a
fi

export WOCLAW_HUB_URL="${WOCLAW_HUB_URL:-http://vm153:8083}"
export WOCLAW_TOKEN="${WOCLAW_TOKEN:-WoClaw2026}"
export WOCLAW_PROJECT_KEY="${WOCLAW_PROJECT_KEY:-project:context}"

echo "=== WoClaw [Codex]: Saving session context ==="

# Read Codex hook event from stdin (JSON)
# Codex passes: { session_id, transcript_path, cwd, hook_event_name, model }
STDIN_DATA=""
if [ ! -t 0 ]; then
  STDIN_DATA=$(cat)
fi

# Extract session_id if available
SESSION_ID=$(echo "$STDIN_DATA" | node -pe "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.session_id||'');}catch(e){console.log('');}" 2>/dev/null || echo "")

# Try to extract a summary from the transcript if provided
SUMMARY=""
TRANSCRIPT_PATH=$(echo "$STDIN_DATA" | node -pe "try{const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.transcript_path||'');}catch(e){console.log('');}" 2>/dev/null || echo "")

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Get last 30 lines of transcript as session summary
  SUMMARY=$(tail -30 "$TRANSCRIPT_PATH" 2>/dev/null | node -pe "
const lines = require('fs').readFileSync('/dev/stdin','utf8').split('\n').filter(l=>l.trim());
const summary = lines.slice(-20).join('\n');
console.log(JSON.stringify(summary));
" 2>/dev/null || echo '""')
fi

# Also check for CLAUDE.md or session logs
if [ "$SUMMARY" = '""' ] && [ -f "CLAUDE.md" ]; then
  SUMMARY=$(tail -30 CLAUDE.md 2>/dev/null | node -pe 'const d=require("fs").readFileSync("/dev/stdin","utf8");console.log(JSON.stringify(d));' 2>/dev/null || echo '""')
fi

# Write session summary to WoClaw Hub
RESULT=$(curl -s -X POST \
  -H "Authorization: Bearer $WOCLAW_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"key\":\"$WOCLAW_PROJECT_KEY\",\"value\":$SUMMARY,\"updatedBy\":\"codex:$SESSION_ID\"}" \
  "$WOCLAW_HUB_URL/memory")

echo "Context saved to WoClaw Hub: $RESULT"
