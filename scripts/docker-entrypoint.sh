#!/bin/sh
set -eu

pnpm --filter @agent-board/db migrate
pnpm --filter @agent-board/db seed
exec pnpm --filter @agent-board/web start
