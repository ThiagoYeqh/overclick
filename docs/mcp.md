# MCP · OverClick

The board exposes the 13 MVP tools over **streamable HTTP**, served by the same app process.

## Connect

Preferred: **pairing code**. The human generates a one-time 6-digit code in the wizard
or in Settings › Tokens and reads it to the agent; the agent exchanges it on the public
pairing endpoint and receives the real token, so the bearer value never travels through
a chat:

```bash
curl -sX POST http://<your-host>/api/pair \
  -H 'Content-Type: application/json' -d '{"code":"<6 digits>"}'
# → {"token":"ocb_...","url":"/mcp",...}   single use, 10 minute TTL
```

Classic: replace the host and paste the token generated in the UI (it is shown in full
only once):

```bash
claude mcp add --transport http overclick http://<your-host>/mcp \
  --header "Authorization: Bearer agb_live_••••••••••••"
```

Other HTTP clients (Codex, Gemini CLI, Overclock) use the same URL and the same
`Authorization: Bearer ...` header.

The workspace is resolved from the token. Revoked or missing token → **HTTP 401**.

On initialize the server ships instructions that open with the board identity:
"OverClick is the task board where agents claim and deliver cards (not Overclock the
IDE); registering activities means task_create here." Clients that surface MCP
instructions hand their agents this context before the first tool call.

## Tools

| Tool | What it does |
|---|---|
| `mission_list` / `mission_get` | missions and the context to inject into the prompt |
| `mission_create` | creates a mission (`title`, objective/context markdown, `status`) and returns its id |
| `task_list` | the queue (project, `mission_id`, status, priority, `awaiting_review_by`) |
| `task_get` | self-contained md briefing (contract + harness + mission + branch) |
| `task_create` | creates the card (`mission` is an existing mission id, `mode` solo\|team, origin) |
| `task_claim` | status → `in_progress`; a second claim → `ALREADY_CLAIMED` |
| | when the claiming executor differs from the card harness, the response carries a `harness_divergence` warning and the card timeline automatically records an executor swap entry naming planned vs actual |
| `task_update` | progress, comment, the `reviewed` mark, a new `harness` (validated against executors), or a `usage` block that fills or corrects the latest attempt's telemetry, even after deliver |
| | `spawn_failure`: a boot-failure note an orchestrator posts when the planned executor never started (CLI missing, crash on boot); it lands as a typed timeline entry with the planned harness attached and both entries render in the card detail under "Execution trace" |
| `task_deliver` | result + usage; status → `done`; routed to the card's reviewer |
| | `usage` is required by contract: report exact numbers when your harness exposes them, otherwise **estimate** tokens, turns and cost and set `estimated: true` (the card labels the numbers "estimated"). A delivery without usage still lands, but the response carries a warning and the card shows "usage not reported". |
| | optional `how_to_verify`: a URL, command or screenshot reference the reviewer opens first. It is shown on top of the validation panel in the Done detail ("For checking, open"). |
| `task_delete` | hard delete: removes the card plus attempts, handoffs and subtasks (irreversible) |
| `branch_register` | records the branch on the card |
| `harness_recommend` | policy lookup (activity type → CLI · model · effort) |
| `harness_list` | the whole policy + configured executors |

Every tool that takes `task_id` accepts the card uuid **or** the workspace short id
(`AGB-5`, `OVK-5.4`). Resolution is scoped to the token's workspace.

`task_claim` and `task_get` return the briefing. The executor needs no other source of
context. The briefing always ends with the executor contract, the last thing the agent
reads: when done, call `task_deliver` with `summary`, `evidence`, `branch` and
`usage {tokens_in, tokens_out, duration_ms, cost_usd, turns}`; without exact numbers,
estimate and set `estimated: true`.

## Errors

Every error is typed and speaks tool language: a short `code` plus a message that
tells the agent what to call next. Internals (SQL, driver output, state machine event
names) never reach the client; unexpected failures come back as a generic `INTERNAL`
error and the details stay in the server logs.

| Code | Meaning and next step |
|---|---|
| `NOT_FOUND` | the id does not exist in the token's workspace; the message points to `task_list`, `mission_list` or `harness_list` |
| `INVALID_TRANSITION` | the call does not fit the card status; for example, delivering an open card returns "Card is open, call task_claim before task_deliver." |
| `ALREADY_CLAIMED` | another executor holds the card; retry with `force: true` to take over |
| `INVALID_ARGUMENT` | the input failed validation; the message names the field |
| `INTERNAL` | unexpected server error, nothing leaked; check ids and retry |

## Telemetry

Telemetry does not depend on agent goodwill. The server measures the duration itself,
from claim to deliver, and stores it on the attempt. The card footer always shows
something real, in this order: full usage; estimated usage labeled "estimated";
server-measured duration with "usage not reported". Estimates beat silence: agents
that cannot read exact numbers are instructed to estimate and mark `estimated: true`,
and real numbers found later can overwrite the attempt through `task_update`.
