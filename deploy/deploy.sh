#!/usr/bin/env bash
# Deploy the cloud instance: pull, rebuild, restart, prove it came back.
set -euo pipefail

cd "$(dirname "$0")/.."
# The proxy overlay is part of the deployment whenever this instance is fronted by
# an existing Traefik: leaving it out recreates the container without its route,
# which takes the site down while the container looks perfectly healthy.
COMPOSE=(docker compose -p overclick -f deploy/docker-compose.cloud.yml)
OVERLAY=0
if [ -f deploy/docker-compose.traefik.yml ] && grep -qE '^OVERCLICK_HOST=.+' deploy/.env 2>/dev/null; then
  COMPOSE+=(-f deploy/docker-compose.traefik.yml)
  OVERLAY=1
  echo "==> proxy overlay on (OVERCLICK_HOST set)"
fi
PORT="$(grep -E '^OVERCLICK_PORT=' deploy/.env 2>/dev/null | cut -d= -f2 || true)"
PORT="${PORT:-3100}"

# Where to knock. The proxy overlay drops the host port on purpose (the proxy
# reaches the container over the shared network), so knocking on the host
# loopback there answers nothing no matter how healthy the app is: a good
# deploy would spend two minutes timing out and then exit 1. Under the overlay
# the probe runs inside the container, where the app always listens on 3000.
if [ "$OVERLAY" = 1 ]; then
  WHERE="inside the container"
else
  WHERE="127.0.0.1:${PORT}"
fi

probe() {
  if [ "$OVERLAY" = 1 ]; then
    "${COMPOSE[@]}" exec -T app node -e \
      'fetch("http://127.0.0.1:3000/setup").then(r=>console.log(r.status)).catch(()=>console.log("000"))' \
      2>/dev/null || echo "000"
  else
    curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/setup" || true
  fi
}

echo "==> pulling"
git pull --ff-only

echo "==> building and restarting"
"${COMPOSE[@]}" up -d --build

echo "==> waiting for the app (${WHERE})"
for i in $(seq 1 60); do
  code="$(probe | tr -dc '0-9')"
  # /setup answers 200 on a fresh board and redirects once the owner exists.
  # Both prove the app is serving, which is all this check is asking.
  case "$code" in
    200 | 30?)
      echo "==> up (HTTP ${code}) on ${WHERE}"
      "${COMPOSE[@]}" ps --format '{{.Service}} {{.Status}}'
      exit 0
      ;;
  esac
  sleep 2
done

echo "!! the app did not answer in time (${WHERE}), last 40 log lines:" >&2
"${COMPOSE[@]}" logs --tail 40 app >&2
exit 1
