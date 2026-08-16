# MCP · OverClick

The board exposes the 18 tools over **streamable HTTP**, served by the same app process.

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
| `project_list` | the workspace projects: uuid, name, card prefix, repo url, next card number and card counts by status |
| `project_create` | creates a project (`name`, optional `repo_url`, optional `id_prefix`). The prefix is derived from the name when omitted (`Agent Board` → `AB`, `OverClick` → `OC`, `overclick` → `OVE`) and is unique per workspace: a collision comes back as `INVALID_ARGUMENT` naming the project that holds it |
| `mission_list` / `mission_get` | missions and the context to inject into the prompt |
| `mission_create` | creates a mission (`title`, objective/context markdown, `status`) and returns its id |
| `task_list` | the queue (project, `mission_id`, status, priority, `awaiting_review_by`) |
| `task_get` | self-contained md briefing (contract + harness + mission + branch) |
| `task_create` | creates the card (`mission` is an existing mission id, `mode` solo\|team, origin) |
| | `project_id` takes the project uuid **or** its card prefix (`AGB`), so an agent that just called `project_list` never needs the uuid |
| `task_claim` | status → `in_progress`; a second claim → `ALREADY_CLAIMED` |
| | when the claiming executor differs from the card harness, the response carries a `harness_divergence` warning and the card timeline automatically records an executor swap entry naming planned vs actual |
| `task_update` | progress, comment, the `reviewed` mark, a new `harness` (validated against executors), or a `usage` block that fills or corrects the latest attempt's telemetry, even after deliver |
| | `spawn_failure`: a boot-failure note an orchestrator posts when the planned executor never started (CLI missing, crash on boot); it lands as a typed timeline entry with the planned harness attached and both entries render in the card detail under "Execution trace" |
| `task_deliver` | result + usage; status → `done`; routed to the card's reviewer |
| | `usage` is required by contract: report exact numbers when your harness exposes them, otherwise **estimate** tokens, turns and cost and set `estimated: true` (the card labels the numbers "estimated"). A delivery without usage still lands, but the response carries a warning and the card shows "usage not reported". |
| | `usage.segments` records tokens **per model**: `[{model, input, output, cache_read, cache_write}]`, one entry per model that ran. A conversation that switched model reports both, and the card footer reads `sonnet-5 to opus-5` instead of crediting the whole run to whichever model was recorded at claim time. The flat `tokens_in/out/cache` shape is still accepted and stored as a single segment; when segments arrive the board derives the flat totals from them, so both always agree. |
| | optional `how_to_verify`: a URL, command or screenshot reference the reviewer opens first. It is shown on top of the validation panel in the Done detail ("For checking, open"). |
| `task_delete` | hard delete: removes the card plus attempts, handoffs and subtasks (irreversible) |
| `branch_register` | records the branch on the card |
| `harness_recommend` | policy lookup (activity type → CLI · model · effort) |
| `harness_list` | the whole policy + configured executors, each line carrying `updated_by` and `updated_at` |
| `harness_set` | writes one policy line (`type`, optional `cli`, `model`, `effort`), validated against the configured executors and stamped with the token label. **Needs a manage token** (see below); `cli` omitted means no preference |
| `insights_query` | cost, tokens and time over the workspace, plus the reopened rate per model. Readable with any token |
| | `group_by=model` reads the segments, so a run that switched model lands in both model groups with the tokens each one actually spent, each priced at its own rate. Those groups carry `shared_attempts`: the runs that touched more than one model. Their duration lands whole in every model the run touched, because nothing records how the wall clock split, so per-model durations overlap instead of adding up to the total |
| | `group_by` project, mission, model or card (omit it for totals and the reopen rate only), `since` and `until` to narrow the period. Same rows and same aggregation the Insights page runs, so a number never disagrees with the screen: only finished attempts count, example cards stay out, `estimated` and `missing` come back as counts next to every total, and a card whose cost nobody reported keeps `cost_usd: null` instead of a fake `0`. The period narrows attempts by when they finished; reopens are not narrowed, so a delivery reopened later still counts |
| `executors_update` | adds or removes CLIs and models in the executor config, in the shape the Settings grid saves. **Needs a manage token** |
| | one `cli` per call (the board id, or the binary name an agent sends: `claude` resolves to `claude-code`), plus `add_models`, `remove_models`, `enabled`, `label`, or `remove: true` to drop the CLI entirely. Adding models turns the CLI on unless `enabled: false` says otherwise, because an unchecked model is invisible to the policy selects and to card harnesses. When a change orphans a policy line, the response carries `policy_warnings` naming what `harness_set` has to fix |

Every tool that takes `task_id` accepts the card uuid **or** the workspace short id
(`AGB-5`, `OVK-5.4`), and every `project_id` accepts the project uuid **or** its card
prefix (`AGB`). Resolution is case-insensitive and scoped to the token's workspace.

A fresh instance is self-serve: `project_list` shows what exists and `project_create`
starts a project, so an agent can go from an empty board to its first card without ever
reading the database.

`task_claim` and `task_get` return the briefing. The executor needs no other source of
context. The briefing always ends with the executor contract, the last thing the agent
reads: when done, call `task_deliver` with `summary`, `evidence`, `branch` and
`usage {tokens_in, tokens_out, duration_ms, cost_usd, turns}`; without exact numbers,
estimate and set `estimated: true`.

## The manage flag

Reading the board is what a worker token is for. Rewriting the workspace configuration is
not: a token that can move the harness policy can promote itself to a better model between
two claims. So the configuration tools sit behind a per-token **manage** flag, off by
default.

Tick "This token can change the workspace configuration" when generating the token in
Settings › MCP tokens. Tokens that have it show a `manage` badge in the list. Everything
else about the token is unchanged: same URL, same header, same tools for claiming and
delivering.

The tools behind it are `harness_set` and `executors_update`. Without the flag they answer
with a typed `PERMISSION_DENIED` and change nothing. The harness policy also keeps a
trail: every line records who wrote it last (an email from Settings, the token label from
`harness_set`) and when, shown in the Settings policy table and returned by
`harness_list`.

## Errors

Every error is typed and speaks tool language: a short `code` plus a message that
tells the agent what to call next. Internals (SQL, driver output, state machine event
names) never reach the client; unexpected failures come back as a generic `INTERNAL`
error and the details stay in the server logs.

| Code | Meaning and next step |
|---|---|
| `NOT_FOUND` | the id does not exist in the token's workspace; the message points to `task_list`, `project_list`, `mission_list` or `harness_list` |
| `INVALID_TRANSITION` | the call does not fit the card status; for example, delivering an open card returns "Card is open, call task_claim before task_deliver." |
| `ALREADY_CLAIMED` | another executor holds the card; retry with `force: true` to take over |
| `INVALID_ARGUMENT` | the input failed validation; the message names the field |
| `PERMISSION_DENIED` | the token is valid but has no manage flag, so it cannot change the workspace configuration; nothing was written |
| `INTERNAL` | unexpected server error, nothing leaked; check ids and retry |

## Telemetry

Telemetry does not depend on agent goodwill. The server measures the duration itself,
from claim to deliver, and stores it on the attempt. The card footer always shows
something real, in this order: full usage; estimated usage labeled "estimated";
server-measured duration with "usage not reported". Estimates beat silence: agents
that cannot read exact numbers are instructed to estimate and mark `estimated: true`,
and real numbers found later can overwrite the attempt through `task_update`.
