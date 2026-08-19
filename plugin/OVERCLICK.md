# Working through an OverClick board

> The board's MCP server is `overclick` (tools `mcp__overclick__*`); `overclock`
> is the IDE — one letter apart, different systems. Never guess the prefix.

OverClick is the task board where people decide and validate work and agents
execute it. The board stores the contract and the evidence; the actual work
happens in the repository or system named by the card.

## Non-negotiable loop

Every work activity needs a card before execution. This includes plans, specs,
bugs, features, refactors, and deployments.

1. Call `project_list` and use the project whose repository matches the work.
   Create the project only when no matching project exists.
2. Search before creating a card. For work with more than one card, create or
   select a mission and attach every card to it.
3. Before `task_create`, call `harness_recommend` for the work type. Put the
   returned CLI, model, and effort on the card rather than copying a fixed
   policy into prompts or documentation.
4. Call `task_claim` before touching the work. Declare the real CLI, exact
   model, and current session identifier. The returned briefing is the
   self-contained execution contract.
5. Follow the card's confirmation steps. Register the prescribed branch with
   `branch_register` before editing when the work lives in Git.
6. Commit and push the branch before `task_deliver`. Cite the full commit ID in
   delivery evidence so the remote-check hook can confirm it.
7. Run the usage recipe from the claim briefing and send the measured usage in
   `task_deliver`, together with a truthful summary, evidence, branch, and the
   first verification command or location.
8. Stop at `feito`. Only a human marks the work `validado`.

Never silently replace a requested execution mechanism. If the card cannot be
finished, call `task_release` with the real reason. For a dead executor or an
exhausted model context, create a continuation with `supersedes` and
`inherit: true`; this closes the old attempt while retaining its measured cost.
Use `task_heartbeat` during long runs.

## Mission orchestration telemetry

A mission's planning and dispatch work is measured separately from card
execution. It belongs to one `mission_attempt`, not to a synthetic card. If you
are the mission orchestrator, follow this cycle:

1. At mission start, call `mission_attempt_start` with the `mission_id`, an
   optional primary `project_id`, the effective CLI/model/session, and the
   transcript reference. Save the returned `attempt_id`, sequence `0`, and the
   server start time; this starts the measurement window.
2. After every dispatch round—including a round that created no card—call
   `mission_report_usage` with `checkpoint: "rodada"`. Send a cumulative
   snapshot from the attempt start, never a delta. Increase `sequence` for
   each new snapshot; retrying the same payload and sequence is safe.
3. When the mission closes, send one final report with
   `checkpoint: "final"` and `result: "success"` or `"abandoned"`. The final
   snapshot is required for successful orchestration to enter trusted totals;
   an abandoned attempt remains auditable but stays out of those totals.
4. Report usage per model with `segments`, plus active `duration_ms`, `turns`,
   and `estimated`:

   ```json
   {
     "mission_id": "<mission>",
     "attempt_id": "<attempt>",
     "sequence": 2,
     "checkpoint": "rodada",
     "usage": {
       "segments": [
         {"model": "gpt-5.6-sol", "input": 70000, "output": 8000, "cache_read": 15000, "cache_write": 0}
       ],
       "duration_ms": 370000,
       "turns": 5,
       "estimated": false
     }
   }
   ```

   If the CLI does not expose exact counters, never send zero to mean “I do
   not know”. Use an honest estimate with `estimated: true`; if no honest
   estimate exists, leave usage unreported so the board can show `not reported`.
   `unpriced` means a segment has no price, while `estimated` qualifies an
   approximation; neither state is silently converted to `$0`.

If the orchestrator's session also executes a card, declare the shared session
and keep the scopes distinct. The board marks overlapping usage as `suspect`
instead of counting the same session twice. Card deliveries report only that
card's execution; planning and dispatch tokens belong to the mission attempt.
A mission attempt has no card branch, PR, reviewer, or `task_deliver` of its
own. Only the human validates the resulting card work and mission outcome.

## Card contract

A card states what changes from the user's point of view, why that matters, and
binary confirmation steps with expected outcomes. Include its origin. A vague
card is not ready to execute.

Do not create a duplicate when `task_search` finds the same work. Do not hide a
failed check in delivery evidence. A merge is not human validation.

## Runtime routing

Board configuration is the source of truth for model routing. Use
`harness_recommend` for a new card and `harness_list` only when the full current
menu is relevant. Do not embed private model menus, people's names, internal
instance addresses, or organization-specific policies in this package.

## Commands

- `/overclick:board` shows open work and claims owned by the current token.
- `/overclick:claim <id>` claims one card and returns its briefing.
- `/overclick:card <id>` opens the self-contained card.
- `/overclick:deliver` verifies, pushes, measures usage, and delivers the
  current card.
- `/overclick:release <tag>` stamps the current card with an exact release tag.

## Updating the plugin

Re-run `install.sh`. It keeps its own persistent checkout of this package and
fetches the latest version from there before reinstalling; there is no
separate update command.

## Hook defaults

`SessionStart`, the post-delivery remote check, and local claim-marker updates
are enabled by default on clients with hook support. The stop guard, pre-create
harness enforcement, and claim guard are installed but default to off. Enable
the blocking guards in the private OverClick config written by the installer:

```text
enforce_stop=1
enforce_harness=1
enforce_claim=1
```

The stop guard blocks exit while this token owns an executing card. The
pre-create guard blocks a card whose harness does not match the board's live
recommendation. The claim guard lets reads and investigation pass, but requires
an active claim before `Edit`, `Write`, or a mutating `Bash` command. A successful
`task_claim` writes the card ID and claim time to `.overclick/claim.json` for a
fast local check; `task_deliver` and `task_release` remove it. When that marker is
missing, a pending mutation checks the board before it blocks with
`claima um card no board antes: task_claim {id}`. Neither opt-in changes the card
contract or grants permission to deploy.

Codex does not have a supported client-side equivalent for the claim guard, so
the installer does not add this rule to Codex. Its coverage remains server-side:
claim leases expire when abandoned, and the delivery verification introduced by
OCL-23 rejects unverifiable delivery evidence. This limitation is why the guard
must not be described as universal enforcement.

The motivating incident happened on 2026-08-19: a Kimi worker executed OCL-37
without claiming it, leaving the card `aberto` while real work was already in
progress and therefore invisible to the board.

## Dispatching

Listing to scan the queue is the default: `task_list` rows carry only the
operational minimum (short_id, title, type, status, priority, cost). To
dispatch, add `include: ["harness"]` to the same call to get the planned CLI,
model, and effort with the row — that one call is still enough to dispatch.
Do not call `task_get` just to choose an executor; the executor receives the
full contract when it claims the card. Other groups exist for less common
needs: `include: ["ids"]` for uuids, `["refs"]` for mission_id/project_id/
branch/claimed_by, `["delivery"]` for commit/delivery flags/revisado/
devolve_para, or `["all"]` for every group at once. Same `include` semantics
apply to `task_search`.

When another executor receives a card, send only:

```text
Execute card <ID> on the OverClick board.
```

The claim briefing already carries the contract, mission context, branch
convention, harness, and usage recipe. Put any newly discovered run-wide rule
on the card or mission before dispatching instead of duplicating it in the
prompt.

## Shared markdown is a live document

When changing one section or list line of a project context or mission
objective, call `project_update`/`mission_update` with `context_ops` (or
`objective_ops`); never resend the whole blob for a one-line change. The board
applies granular operations to the current value, preserving concurrent edits.
Send `context`/`objective` only for an intentional full rewrite, optionally
guarded with `expected_len` or `expected_hash`.

## Protected main

When the project repository protects its default branch, deliver on the card
branch and open a pull request; send `pull_request_url` in `task_deliver`. The
orchestrator (with the owner's approval) merges — never push to the protected
branch directly.
