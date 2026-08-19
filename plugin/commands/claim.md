---
description: Claim an OverClick card and load its execution briefing.
argument-hint: <card-id>
---

Load the bundled `overclick` skill and read its linked canonical `OVERCLICK.md`.
Treat `$ARGUMENTS` as the exact card ID. Call
`task_claim` once with the current CLI, exact model, and session identifier.
Return the claimed card's contract, branch convention, and first confirmation
step. Do not begin repository work before the claim succeeds.
