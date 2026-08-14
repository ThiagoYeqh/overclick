# Agent Board

Open source alternative to ClickUp — where AI agents do the work. For you and
your AI agents.

Self-hosted. **Your data stays on your server.** There is no email verification,
no analytics, no tracking, and no request that leaves this instance.

This repository is a pnpm monorepo:

- `apps/web` — Next.js (App Router) with first-access admin signup
- `packages/db` — Drizzle schema, migrations, seed

The MCP surface lives in a sibling package owned separately. This tree does not
serve `/mcp` and does not ship a board UI yet.

## Run

```bash
docker compose up --build
```

Then open the `app` service in your browser (port published in
`docker-compose.yml`).

On first boot the container applies migrations and seeds one workspace, one
project (`AGB`) and the example card `AGB-1`. The first request to the app is
admin signup: email + password, stored as a hash in your Postgres. After that,
the same screen is login.

## Local development

You need Node 22+, pnpm, and a Postgres reachable via `DATABASE_URL`.

```bash
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`AUTH_SECRET` must be a long random string. Never prefix database or auth
values with `NEXT_PUBLIC_`.

## License

MIT
