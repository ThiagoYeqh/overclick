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
3. **Connect your agent**: generate an MCP token (shown once: store it safely) and copy
   the ready-made command for your CLI. The indicator lights up on the first call.

For Claude Code, the command looks like:

```bash
claude mcp add --transport http overclick http://localhost:3000/mcp \
  --header "Authorization: Bearer <your-token>"
```

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
- **MCP tokens**: one per agent/machine, revocable, last-use tracked.

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
