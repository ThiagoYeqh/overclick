#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

queue=$(oc_mcp_call task_list '{"status":"aberto","limit":10}' 2>/dev/null || true)
claims=$(oc_mcp_call task_list '{"status":"em_execucao","claimed_by":"me","limit":10}' 2>/dev/null || true)

[ -n "$queue" ] || exit 0
printf '%s\n' "OverClick board snapshot"
printf '%s' "$queue" | oc_with_json render "Open queue" || exit 0
if [ -n "$claims" ]; then
  printf '%s' "$claims" | oc_with_json render "Your active claims" || true
fi
