#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

hook_input=$(cat)
tool_name=$(printf '%s' "$hook_input" | oc_with_json hook-tool 2>/dev/null || true)
hook_cwd=$(printf '%s' "$hook_input" | oc_with_json hook-cwd 2>/dev/null || true)
[ -n "$hook_cwd" ] || hook_cwd=$(pwd)

case "$tool_name" in
  task_claim|mcp__*__task_claim)
    claimed_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    marker=$(printf '%s' "$hook_input" | oc_with_json claim-marker "$claimed_at" 2>/dev/null || true)
    [ -n "$marker" ] || exit 0
    oc_write_claim_marker "$hook_cwd" "$marker"
    exit 0
    ;;
  task_deliver|mcp__*__task_deliver|task_release|mcp__*__task_release)
    oc_clear_claim_marker "$hook_cwd"
    exit 0
    ;;
esac

oc_enabled enforce_claim || exit 0

case "$tool_name" in
  Edit|Write|edit|write)
    ;;
  Bash|bash)
    command=$(printf '%s' "$hook_input" | oc_with_json hook-command 2>/dev/null || true)
    oc_bash_writes "$command" || exit 0
    ;;
  *)
    exit 0
    ;;
esac

session_id=$(printf '%s' "$hook_input" | oc_with_json hook-session 2>/dev/null || true)
if oc_claim_marker_valid "$hook_cwd" "$session_id"; then
  exit 0
fi

claims=$(oc_mcp_call task_list '{"status":"em_execucao","claimed_by":"me","limit":2}' 2>/dev/null || true)
if [ -n "$claims" ]; then
  count=$(printf '%s' "$claims" | oc_with_json count 2>/dev/null || printf '0')
  if [ "$count" -gt 0 ] 2>/dev/null; then
    exit 0
  fi
fi

oc_block "claima um card no board antes: task_claim {id}"
