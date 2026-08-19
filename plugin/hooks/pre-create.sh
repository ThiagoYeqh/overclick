#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

oc_enabled enforce_harness || exit 0
hook_input=$(cat)
task_type=$(printf '%s' "$hook_input" | grep -Eo '"type"[[:space:]]*:[[:space:]]*"(feature|bug|rfc)"' | tail -n 1 | sed -E 's/.*"(feature|bug|rfc)"/\1/' || true)

if [ -z "$task_type" ]; then
  oc_block "OverClick could not determine the task type for harness recommendation."
  exit 0
fi

recommendation=$(oc_mcp_call harness_recommend "{\"type\":\"$task_type\"}" 2>/dev/null || true)
if [ -z "$recommendation" ]; then
  oc_block "OverClick could not read the current harness recommendation. Retry before task_create."
  exit 0
fi

actual=$(printf '%s' "$hook_input" | oc_with_json hook-harness 2>/dev/null || true)
expected=$(printf '%s' "$recommendation" | oc_with_json recommendation-harness 2>/dev/null || true)

if [ -z "$actual" ] || [ "$actual" != "$expected" ]; then
  oc_block "Call harness_recommend and use its current CLI, model, and effort in task_create."
fi
