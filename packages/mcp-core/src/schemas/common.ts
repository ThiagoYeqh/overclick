import { z } from "zod";

export const CardStatusSchema = z.enum([
  "aberto",
  "em_execucao",
  "feito",
  "validado",
]);

export const TaskTypeSchema = z.enum(["feature", "bug", "rfc"]);

export const CardapioTaskTypeSchema = z.enum([
  "bug",
  "feature",
  "rfc",
  "architecture",
  "mechanical",
]);

export const PrioritySchema = z.enum(["urgente", "alta", "media", "baixa"]);

export const EffortSchema = z.enum(["low", "medium", "high"]);

export const ModelTierSchema = z.enum(["top", "mid", "cheap"]);

export const ExecutionModeSchema = z.enum(["solo", "team"]);

export const MissionStatusSchema = z.enum(["ativa", "pausada", "concluida"]);

export const CliNameSchema = z.enum([
  "overclock",
  "claude-code",
  "codex",
  "gemini-cli",
  "cursor",
  "aider",
  "other",
]);

export const ConfirmationStepSchema = z.object({
  step: z.string().min(1),
  expected: z.string().min(1),
});

export const OrigemSchema = z
  .object({
    pane_id: z.string().min(1).optional(),
    session_id: z.string().min(1).optional(),
    agent: z.string().min(1).optional(),
    cli: z.string().min(1).optional(),
    reportado_por: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      Boolean(
        value.pane_id ||
          value.session_id ||
          value.agent ||
          value.cli ||
          value.reportado_por,
      ),
    { message: "origem precisa de ao menos um identificador (pane, session, agent, cli ou reportado_por)" },
  );

export const ReviewerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("human"),
    user_id: z.string().min(1),
  }),
  z.object({
    kind: z.literal("agent"),
    session_id: z.string().min(1),
  }),
  z.object({
    kind: z.literal("workspace_queue"),
  }),
]);

export const DEFAULT_REVIEWER = {
  kind: "workspace_queue",
} as const;

export const HarnessSchema = z.object({
  cli: z.string().min(1).optional(),
  model: z.string().min(1),
  effort: EffortSchema,
});

export const UsageSchema = z.object({
  tokens_in: z.number().int().nonnegative().optional(),
  tokens_out: z.number().int().nonnegative().optional(),
  tokens_cache: z.number().int().nonnegative().optional(),
  cost_usd: z.number().nonnegative().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
  turns: z.number().int().nonnegative().optional(),
});

export const EvidenceSchema = z
  .object({
    text: z.string().min(1).optional(),
    url: z.string().url().optional(),
  })
  .refine((value) => Boolean(value.text || value.url), {
    message: "evidência precisa de text ou url",
  });

export const ArtifactSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rfc_markdown"),
    name: z.string().min(1),
    markdown: z.string().min(1),
  }),
  z.object({
    kind: z.literal("markdown"),
    name: z.string().min(1),
    markdown: z.string().min(1),
  }),
  z.object({
    kind: z.literal("link"),
    name: z.string().min(1),
    url: z.string().url(),
  }),
  z.object({
    kind: z.literal("file"),
    name: z.string().min(1),
    content: z.string().optional(),
    url: z.string().url().optional(),
    mime_type: z.string().optional(),
  }),
]);

export const SubtaskCreateSchema = z.object({
  title: z.string().min(1),
  scope: z.string().min(1),
  boundary: z.string().min(1),
  o_que: z.string().min(1).optional(),
  por_que: z.string().min(1).optional(),
  como_confirmo: z.array(ConfirmationStepSchema).optional(),
  harness: HarnessSchema.optional(),
  devolve_para: ReviewerSchema.optional(),
});

export const BranchConventionSchema = z.object({
  branch: z.string().min(1),
  commit_prefix: z.string().min(1),
});

export const IsoDateTimeSchema = z.string().datetime();

export const MissionSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: MissionStatusSchema,
  task_count: z.number().int().nonnegative().optional(),
});

export const MissionSchema = MissionSummarySchema.extend({
  objective: z.string(),
  context: z.string(),
});

export const TaskSummarySchema = z.object({
  id: z.string().min(1),
  short_id: z.string().min(1),
  title: z.string().min(1),
  type: TaskTypeSchema,
  status: CardStatusSchema,
  revisado: z.boolean(),
  priority: PrioritySchema,
  project_id: z.string().min(1),
  mission_id: z.string().min(1).nullable(),
  devolve_para: ReviewerSchema,
});

export const TaskSchema = TaskSummarySchema.extend({
  workspace_id: z.string().min(1),
  parent_id: z.string().min(1).nullable(),
  o_que: z.string(),
  por_que: z.string(),
  como_confirmo: z.array(ConfirmationStepSchema),
  harness: HarnessSchema.nullable(),
  origem: OrigemSchema,
  mode: ExecutionModeSchema,
  branch: z.string().min(1).nullable(),
  pull_request_url: z.string().url().nullable(),
  reopen_comment: z.string().nullable(),
  claimed_by: z.string().nullable(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
});

export const ExecutionAttemptSchema = z.object({
  id: z.string().min(1),
  task_id: z.string().min(1),
  executor: z.object({
    token_id: z.string().min(1).optional(),
    cli: z.string().optional(),
    model: z.string().optional(),
    agent: z.string().optional(),
    session_id: z.string().optional(),
  }),
  started_at: IsoDateTimeSchema,
  finished_at: IsoDateTimeSchema.nullable(),
  usage: UsageSchema.nullable(),
  result: z.enum(["success", "failure", "abandoned"]).nullable(),
});

export const HandoffSchema = z.object({
  id: z.string().min(1),
  task_id: z.string().min(1),
  attempt_id: z.string().min(1).optional(),
  summary: z.string().min(1),
  evidence: z.array(EvidenceSchema),
  artifacts: z.array(ArtifactSchema),
  branch: z.string().min(1).nullable(),
  pull_request_url: z.string().url().nullable(),
  usage: UsageSchema.nullable(),
  telemetry_incomplete: z.boolean(),
  created_at: IsoDateTimeSchema,
});

export type CardStatus = z.infer<typeof CardStatusSchema>;
export type TaskType = z.infer<typeof TaskTypeSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type Effort = z.infer<typeof EffortSchema>;
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;
export type ConfirmationStep = z.infer<typeof ConfirmationStepSchema>;
export type Origem = z.infer<typeof OrigemSchema>;
export type Reviewer = z.infer<typeof ReviewerSchema>;
export type Harness = z.infer<typeof HarnessSchema>;
export type Usage = z.infer<typeof UsageSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;
export type SubtaskCreate = z.infer<typeof SubtaskCreateSchema>;
export type Mission = z.infer<typeof MissionSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type ExecutionAttempt = z.infer<typeof ExecutionAttemptSchema>;
export type Handoff = z.infer<typeof HandoffSchema>;
export type BranchConvention = z.infer<typeof BranchConventionSchema>;

export function isTelemetryIncomplete(usage?: Usage | null): boolean {
  if (!usage) {
    return true;
  }
  return (
    usage.tokens_in === undefined ||
    usage.tokens_out === undefined ||
    usage.cost_usd === undefined ||
    usage.duration_ms === undefined ||
    usage.turns === undefined
  );
}

export function branchConvention(
  shortId: string,
  title: string,
): BranchConvention {
  const slug = title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return {
    branch: `${shortId.toLowerCase()}-${slug}`,
    commit_prefix: `[${shortId.toUpperCase()}]`,
  };
}
