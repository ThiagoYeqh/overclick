# MCP · OverClick

The board exposes the 13 MVP tools over **streamable HTTP**, served by the same app process.

## Connect

Replace the host and paste the token generated in the UI (it is shown in full only once):

```bash
claude mcp add --transport http overclick http://<your-host>/mcp \
  --header "Authorization: Bearer agb_live_••••••••••••"
```

Other HTTP clients (Codex, Gemini CLI, Overclock) use the same URL and the same
`Authorization: Bearer ...` header.

The workspace is resolved from the token. Revoked or missing token → **HTTP 401**.

## Tools

| Tool | What it does |
|---|---|
| `mission_list` / `mission_get` | missions and the context to inject into the prompt |
| `mission_create` | creates a mission (`title`, objective/context markdown, `status`) and returns its id |
| `task_list` | the queue (project, `mission_id`, status, priority, `awaiting_review_by`) |
| `task_get` | self-contained md briefing (contract + harness + mission + branch) |
| `task_create` | creates the card (`mission` is an existing mission id, `mode` solo\|team, origin) |
| `task_claim` | status → `in_progress`; a second claim → `ALREADY_CLAIMED` |
| `task_update` | progress, comment, the `reviewed` mark, a new `harness` (validated against executors), or a `usage` block that fills or corrects the latest attempt's telemetry, even after deliver |
| `task_deliver` | result + usage; status → `done`; routed to the card's reviewer |
| | `usage` is required by contract: report exact numbers when your harness exposes them, otherwise **estimate** tokens, turns and cost and set `estimated: true` (the card labels the numbers "estimated"). A delivery without usage still lands, but the response carries a warning and the card shows "usage not reported". |
| | optional `how_to_verify`: a URL, command or screenshot reference the reviewer opens first. It is shown on top of the validation panel in the Done detail ("For checking, open"). |
| `task_delete` | hard delete: removes the card plus attempts, handoffs and subtasks (irreversible) |
| `branch_register` | records the branch on the card |
| `harness_recommend` | policy lookup (activity type → CLI · model · effort) |
| `harness_list` | the whole policy + configured executors |

`task_claim` and `task_get` return the briefing. The executor needs no other source of
context. The briefing ends with the executor contract: when done, call `task_deliver`
with `summary`, `evidence`, `branch` and `usage {tokens_in, tokens_out, duration_ms,
cost_usd, turns}`.

## Telemetry

Telemetry does not depend on agent goodwill. The server measures the duration itself,
from claim to deliver, and stores it on the attempt. The card footer always shows
something real, in this order: full usage; estimated usage labeled "estimated";
server-measured duration with "usage not reported". Estimates beat silence: agents
that cannot read exact numbers are instructed to estimate and mark `estimated: true`,
and real numbers found later can overwrite the attempt through `task_update`.
