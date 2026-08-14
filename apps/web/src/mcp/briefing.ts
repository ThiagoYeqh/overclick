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
  ].join("\n");
}
