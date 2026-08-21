#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

oc_enabled enforce_stop || exit 0
claims=$(oc_mcp_call task_list '{"status":"em_execucao","claimed_by":"me","limit":2}' 2>/dev/null || true)
[ -n "$claims" ] || exit 0
count=$(printf '%s' "$claims" | oc_with_json count 2>/dev/null || printf '0')

if [ "$count" -gt 0 ] 2>/dev/null; then
  oc_block "An OverClick card is still claimed by this token. Deliver it or call task_release before stopping."
fi
