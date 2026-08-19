# Working through an OverClick board

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

## Hook defaults

`SessionStart` and the post-delivery remote check are enabled by default.
The stop guard and pre-create harness enforcement are installed but default to
off. Enable either in the private OverClick config written by the installer:

```text
enforce_stop=1
enforce_harness=1
```

The stop guard blocks exit while this token owns an executing card. The
pre-create guard blocks a card whose harness does not match the board's live
recommendation. Neither opt-in changes the card contract or grants permission
to deploy.

## Dispatching

When another executor receives a card, send only:

```text
Execute card <ID> on the OverClick board.
```

The claim briefing already carries the contract, mission context, branch
convention, harness, and usage recipe. Put any newly discovered run-wide rule
on the card or mission before dispatching instead of duplicating it in the
prompt.
