#!/usr/bin/env bash
# Deploy the cloud instance: pull, rebuild, restart, prove it came back.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -p overclick -f deploy/docker-compose.cloud.yml)
PORT="$(grep -E '^OVERCLICK_PORT=' deploy/.env 2>/dev/null | cut -d= -f2 || true)"
PORT="${PORT:-3100}"

echo "==> pulling"
git pull --ff-only

echo "==> building and restarting"
"${COMPOSE[@]}" up -d --build

echo "==> waiting for the app"
for i in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/setup" || true)"
  if [ "$code" = "200" ] || [ "$code" = "307" ]; then
    echo "==> up (HTTP ${code}) on 127.0.0.1:${PORT}"
    "${COMPOSE[@]}" ps --format '{{.Service}} {{.Status}}'
    exit 0
  fi
  sleep 2
done

echo "!! the app did not answer in time, last 40 log lines:" >&2
"${COMPOSE[@]}" logs --tail 40 app >&2
exit 1
