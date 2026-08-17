# Getting started

The complete walkthrough: from zero to an AI agent executing cards on your own board.
Takes about 10 minutes.

## 0. Requirements

- Docker + Docker Compose (that's it: Postgres ships in the compose file).
  No Docker yet? macOS: `brew install --cask docker && open -a Docker` (or OrbStack);
  Linux: your distro's `docker` + `docker-compose-plugin` packages;
  Windows: Docker Desktop with WSL2.
- An MCP-capable coding agent on your machine: Claude Code, Codex CLI, Gemini CLI,
  [Overclock](https://overclock.sh), or any MCP client

## 1. Run the board

```bash
git clone https://github.com/ustoppble/overclick && cd overclick
docker compose up --build
```

Open **http://localhost:3000**.

> Self-hosting on a server? Set `AUTH_SECRET` to your own value (32+ chars) in the
> compose environment before exposing it: the default is for local use only. Nothing
> in the app ever calls out of your server either way.

## 2. Create the admin account

First access shows the setup screen. E-mail + password, stored (hashed) in your own
Postgres. No verification e-mail, no marketing questions: it's just a login.

## 3. Onboarding: 3 steps

1. **Project**: name it, optionally add the repo URL. The ID prefix (e.g. `AGB`) is
   derived from the name; it drives the whole Git convention: cards become `AGB-1`,
   branches become `agb-1-fix-login`.
2. **Executors**: check the CLIs/models your team actually has. This feeds the harness
   policy: the board only ever recommends models you own.
3. **Connect your agent**: two paths, both ending with the agent connected over MCP.

### Pairing code (recommended, the token never touches the chat)

Generate a one-time 6-digit pairing code in the wizard (or later in Settings › Tokens)
and read it to your agent, or hand it the ready-made exchange command. The agent trades
the code for the real token on the public pairing endpoint:

```bash
curl -sX POST http://localhost:3000/api/pair \
  -H 'Content-Type: application/json' -d '{"code":"<6 digits>"}'
```

The response carries the bearer token; the agent stores it and connects to `/mcp` with
`Authorization: Bearer <token>`. The code works once and expires in 10 minutes, so the
secret never appears in a conversation, a livestream, or a chat log. The indicator in
the wizard lights up when the code is exchanged.

Tell your agent something like:

> pair with my OverClick board at localhost:3000 with code 483920, store the token in
> your MCP config, and never print it

### Copy command (classic)

Generate an MCP token (shown once: store it safely) and copy the ready-made command for
your CLI. For Claude Code it looks like:

```bash
claude mcp add --transport http overclick http://localhost:3000/mcp \
  --header "Authorization: Bearer <your-token>"
```

Prefer this path only when you are pasting into your own terminal, not into an agent
conversation that may be logged or streamed.

## 4. The first card

Your board is born with one example card (`AGB-1`: "Ask your agent to grab this task").
In your agent's terminal, say:

> grab the next task from the board

Watch the board: the card slides to **In progress** with the executor's identity, and
when the agent finishes, it lands in **Done · review** with a summary, evidence, and the
real cost (model · minutes · tokens · ~$).

## 5. Validate: the human's move

Open the card in **Done**. Review it against the *How to confirm* script (you wrote it
when creating the card: it's the contract). Then:

- **Validate**: the card moves to *Validated*. Only humans can do this.
- **Reopen with a comment**: the card returns to *Open*, and your comment travels to
  the agent on its next claim.

## 6. Daily flow

- **Morning (board):** create cards. Each card is a contract (*What / Why / How to
  confirm*), and the form pre-fills the recommended harness from your policy (activity
  type → CLI · model · effort). Adjust per card or edit the policy in Settings.
- **All day (terminal):** "grab the next task" · "register this as a task for later".
  Agents also file their own discoveries as cards over MCP.
- **End of day (board):** the *Done* column is your review queue. Validate or reopen.

## 7. Settings

- **Executors**: add/remove CLIs and models.
- **Harness policy**: the activity-type table: which CLI/model/effort runs bugs,
  features, RFCs, mechanical chores. Agents read it via the `harness_list` tool.
- **MCP tokens**: one per agent/machine, revocable, last-use tracked. The pairing-code
  button lives here too: pair a new agent without the token ever entering a chat.
- **Updates**: the opt-in release check, and the two ways to actually update. See below.

## 8. Updating

The panel first works out how this instance runs, because the advice is not the same in
both cases. It looks for the marks a container leaves (`/.dockerenv`, the podman marker,
the container runtime in the init process's cgroup) and states what it found in the
version line: *running version 0.1.6, in a container* or *from the source checkout*. Set
`AGENT_BOARD_RUNTIME=container` or `AGENT_BOARD_RUNTIME=source` to overrule it when your
setup hides those marks.

### Running from the source checkout

`pnpm dev` or a built node process on the host has no image to pull and no container to
recreate, so the panel skips the sidecar entirely and gives the update that applies:

```bash
git pull && pnpm install && pnpm --filter @agent-board/mcp-core build
```

Then restart the process yourself, the way you started it: stop `pnpm dev` and run it
again, or restart your service manager unit. If the pull brought new migrations, run
`pnpm db:migrate` with `DATABASE_URL` set before starting it back up.

### Running in a container

There are two honest paths, and Settings › Updates shows whichever one applies to your
instance.

**By hand (default).** Nothing on the board can restart a container, so the panel gives
you the command and you run it on the server:

```bash
git pull && docker compose up -d --build
```

**One click (opt-in).** The compose file ships an optional `updater` sidecar behind a
profile. Turn it on once:

```bash
docker compose --profile updater up -d
```

It writes a heartbeat into the volume it shares with the app, so Settings can tell it
apart from the volume simply being mounted, and the Update button becomes real: it asks
the sidecar to pull the new image and recreate the app, and reports each phase
(pulling → recreating → done, or failed with the tail of the docker output). The app is
recreated mid-run, so the page loses its server for a few seconds and comes back on the
new version; the progress lives in the shared volume, not in the app, which is why it
survives that.

**The tradeoff, plainly.** That sidecar mounts `/var/run/docker.sock`. The docker socket
is root on the host: a container holding it can start, stop and replace any container on
that machine, board included. Enable it only where you already trust everyone who can
reach this board, and leave it off on a shared or exposed host. Your data is not at stake
either way (it lives in the `pgdata` volume, untouched by a pull and recreate), but the
host is. Nothing about either path calls out of your server, except the release check you
turn on yourself.

## Troubleshooting

| Symptom | Check |
|---|---|
| Agent gets 401 | Token revoked or header pasted incomplete: generate a new one in Settings › Tokens |
| "waiting for first connection" never lights | Is the container up? Can the CLI reach the host? Is the `Authorization` header whole? |
| Card stuck in *In progress* | The agent died without a handoff: reopen the card (its attempt stays recorded) |
| `Done` but no telemetry | The executor didn't report usage: generic MCP agents may not; the card is marked "telemetry incomplete" |

## Where things live

Everything is in your Postgres, on your machine. Dump it, back it up, move it: it's
yours. The board never phones home.
