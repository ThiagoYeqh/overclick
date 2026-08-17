import type { UsageRecipe } from "@agent-board/db";
import type { BranchConvention, Mission, Task } from "@agent-board/mcp-core";

/**
 * How this executor measures the run it just did, taken from the board's
 * recipe for its CLI. It goes at the very end of the briefing, right before
 * the delivery contract, because that is the moment the agent needs it.
 */
function renderRecipe(recipe: UsageRecipe): string[] {
  const block = recipe.command
    ? ["```bash", recipe.command, "```"]
    : ["(no command for this CLI yet)"];
  return [
    `## Measuring this run — ${recipe.label}`,
    "",
    recipe.instructions,
    "",
    ...block,
    "",
  ];
}

export function renderBriefingMarkdown(input: {
  task: Task;
  mission: Mission | null;
  branchConvention: BranchConvention;
  /** Recipe for the CLI running the card; omitted when none could be resolved. */
  recipe?: UsageRecipe | null;
}): string {
  const { task, mission, branchConvention, recipe } = input;
  const steps = task.como_confirmo
    .map((step, index) => `${index + 1}. ${step.step} → ${step.expected}`)
    .join("\n");

  const harness = task.harness
    ? [
        task.harness.cli ? `- CLI: ${task.harness.cli}` : null,
        `- modelo: ${task.harness.model}`,
        `- effort: ${task.harness.effort}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "- (sem harness recomendado — cardápio sem executor compatível)";

  const missionBlock = mission
    ? [
        `## Missão — ${mission.title}`,
        "",
        mission.objective,
        mission.context && mission.context !== mission.objective
          ? `\n${mission.context}`
          : "",
      ].join("\n")
    : "## Missão\n\n(card solto — sem missão atribuída)";

  const reopen = task.reopen_comment
    ? `\n## Comentário da reabertura\n\n${task.reopen_comment}\n`
    : "";

  return [
    `# ${task.short_id} — ${task.title}`,
    "",
    `**Tipo:** ${task.type} · **Prioridade:** ${task.priority} · **Status:** ${task.status.replace("_", " ")}`,
    "",
    "## O quê",
    "",
    task.o_que,
    "",
    "## Por quê",
    "",
    task.por_que,
    "",
    "## Como confirmo",
    "",
    steps || "(sem roteiro)",
    "",
    "## Harness",
    "",
    harness,
    "",
    missionBlock,
    "",
    "## Convenção Git",
    "",
    `- branch: \`${branchConvention.branch}\``,
    `- commit/PR: \`${branchConvention.commit_prefix}\``,
    reopen,
    "",
    // The briefing must END with the recipe and the executor contract: in
    // field tests, workers with board tools made zero calls because nothing
    // told them how to measure themselves or what to send.
    ...(recipe ? renderRecipe(recipe) : []),
    "## Executor contract",
    "",
    "When done, call `task_deliver` with summary, evidence, branch and " +
      "usage. Send usage as `segments`, one per model that ran: " +
      "`{segments: [{model, input, output, cache_read, cache_write}], " +
      "duration_ms, turns}` — the command above prints exactly that shape. " +
      "Without exact numbers, ESTIMATE and set `estimated: true`. " +
      "Real numbers found later? Correct them with `task_update` passing usage.\n\n" +
      "Send `transcript: {path}` too, with the transcript the command read. " +
      "The board stores the reference only, never the content: the file stays " +
      "on your machine, and the card gets a way back to this session for " +
      "auditing it, resuming it, or recomputing usage later.",
  ].join("\n");
}
