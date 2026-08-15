# MCP · OverClick

The board exposes the 12 MVP tools over **streamable HTTP**, served by the same app process.

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
| `task_list` | the queue (project, status, priority, `awaiting_review_by`) |
| `task_get` | self-contained md briefing (contract + harness + mission + branch) |
| `task_create` | creates the card (declared mission, `mode` solo\|team, origin) |
| `task_claim` | status → `in_progress`; a second claim → `ALREADY_CLAIMED` |
| `task_update` | progress, comment, or the `reviewed` mark |
| `task_deliver` | result + usage; status → `done`; routed to the card's reviewer |
| `task_delete` | hard delete: removes the card plus attempts, handoffs and subtasks (irreversible) |
| `branch_register` | records the branch on the card |
| `harness_recommend` | policy lookup (activity type → CLI · model · effort) |
| `harness_list` | the whole policy + configured executors |

`task_claim` and `task_get` return the briefing. The executor needs no other source of
context.
