#!/bin/sh
set -eu

hook_input=$(cat)
commit=$(printf '%s' "$hook_input" | grep -Eo '[0-9a-fA-F]{40}' | head -n 1 || true)

if [ -z "$commit" ]; then
  printf '%s\n' "OverClick delivery evidence must cite the full Git commit ID." >&2
  exit 2
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf '%s\n' "OverClick could not verify the delivered commit outside a Git worktree." >&2
  exit 2
fi

if ! git cat-file -e "$commit^{commit}" >/dev/null 2>&1; then
  printf '%s\n' "The commit cited in OverClick delivery evidence is not present locally." >&2
  exit 2
fi

if ! git fetch --all --quiet --prune >/dev/null 2>&1; then
  printf '%s\n' "OverClick could not refresh remote refs to verify the delivered commit." >&2
  exit 2
fi

if ! git for-each-ref --contains="$commit" --format='%(refname)' refs/remotes | grep -q .; then
  printf '%s\n' "The commit cited in OverClick delivery evidence is not present on a remote branch." >&2
  exit 2
fi

exit 0
