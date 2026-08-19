#!/usr/bin/env bash
# The release-tag guard (OCL-73): a `vX.Y.Z` tag must always land on the exact
# commit whose package.json manifests already carry that version. When the two
# drift, `apps/web/src/lib/updates.ts` reads a stale APP_VERSION baked from the
# unbumped manifest, so an instance that already runs the tagged content still
# gets told it is out of date — the false-positive banner this script exists
# to make impossible again.
#
# Usage: scripts/verify-release-version.sh [tag]
# Without an argument, reads the tag off GITHUB_REF_NAME (set by the
# release-image workflow on every `v*` tag push).
set -euo pipefail

cd "$(dirname "$0")/.."

TAG="${1:-${GITHUB_REF_NAME:-}}"
if [ -z "$TAG" ]; then
  echo "!! no tag given and GITHUB_REF_NAME is unset" >&2
  exit 1
fi

TAG_VERSION="${TAG#v}"

MANIFESTS=(
  package.json
  apps/web/package.json
  packages/db/package.json
  packages/mcp-core/package.json
)

fail=0
for manifest in "${MANIFESTS[@]}"; do
  version="$(node -e "console.log(require('./${manifest}').version)")"
  if [ "$version" != "$TAG_VERSION" ]; then
    echo "!! ${manifest} is at ${version}, tag ${TAG} expects ${TAG_VERSION}" >&2
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "!! release aborted: bump every package.json to ${TAG_VERSION} in the same commit as the tag" >&2
  exit 1
fi

echo "==> ${TAG} matches every package.json (${TAG_VERSION})"
