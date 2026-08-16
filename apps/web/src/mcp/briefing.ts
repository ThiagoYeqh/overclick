import type { BranchConvention, Mission, Task } from "@agent-board/mcp-core";

export function renderBriefingMarkdown(input: {
  task: Task;
  mission: Mission | null;
  branchConvention: BranchConvention;
}): string {
  const { task, mission, branchConvention } = input;
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
    // The briefing must END with the executor contract: in field tests,
    // workers with board tools made zero calls because nothing told them.
    "## Executor contract",
    "",
    "When done, call `task_deliver` with summary, evidence, branch and " +
      "usage `{tokens_in, tokens_out, duration_ms, cost_usd, turns}`. " +
      "Without exact numbers, ESTIMATE and set `estimated: true`. " +
      "Real numbers found later? Correct them with `task_update` passing usage.",
  ].join("\n");
}
