import { z } from "zod";
import {
  ArtifactSchema,
  BranchConventionSchema,
  CardapioTaskTypeSchema,
  CardStatusSchema,
  ConfirmationStepSchema,
  EffortSchema,
  EvidenceSchema,
  ExecutionAttemptSchema,
  ExecutionModeSchema,
  HandoffSchema,
  HarnessSchema,
  IsoDateTimeSchema,
  MissionSchema,
  MissionStatusSchema,
  MissionSummarySchema,
  OrigemSchema,
  PrioritySchema,
  ProjectSchema,
  ReviewerSchema,
  SubtaskCreateSchema,
  TaskSchema,
  TaskSummarySchema,
  TaskTypeSchema,
  UsageSchema,
} from "./common.js";

export const MissionListInputSchema = z.object({
  status: MissionStatusSchema.optional(),
});

export const MissionListOutputSchema = z.object({
  missions: z.array(MissionSummarySchema),
});

export const MissionGetInputSchema = z.object({
  mission_id: z.string().min(1),
});

export const MissionGetOutputSchema = z.object({
  mission: MissionSchema,
});

/**
 * Canonical mission_create input.
 * Workspace is resolved from the MCP bearer token — never sent in the body.
 * `objective` and `context` are markdown. Omit either and the other fills it.
 */
export const MissionCreateInputSchema = z.object({
  title: z.string().min(1).max(200),
  objective: z.string().optional(),
  context: z.string().optional(),
  status: MissionStatusSchema.optional(),
});

export const MissionCreateOutputSchema = z.object({
  mission: MissionSchema,
});

const ProjectRefSchema = z
  .string()
  .min(1)
  .describe(
    "Project uuid or its card prefix (e.g. AGB). Resolved in the token workspace; call project_list to see both.",
  );

export const ProjectListInputSchema = z.object({});

export const ProjectListOutputSchema = z.object({
  projects: z.array(ProjectSchema),
});

/**
 * Canonical project_create input.
 * Workspace is resolved from the MCP bearer token — never sent in the body.
 * `id_prefix` is derived from the name when omitted (`Agent Board` → `AGB`
 * style initials) and is unique per workspace.
 */
export const ProjectCreateInputSchema = z.object({
  name: z.string().min(1).max(200),
  repo_url: z.string().url().optional(),
  id_prefix: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Card prefix, 2 to 4 letters or digits (e.g. AGB). Derived from the name when omitted.",
    ),
});

export const ProjectCreateOutputSchema = z.object({
  project: ProjectSchema,
});

export const TaskListInputSchema = z.object({
  project_id: ProjectRefSchema.optional(),
  mission_id: z.string().min(1).optional(),
  status: z.union([CardStatusSchema, z.array(CardStatusSchema)]).optional(),
  priority: PrioritySchema.optional(),
  type: TaskTypeSchema.optional(),
  awaiting_review_by: z.union([z.literal("me"), z.string().min(1)]).optional(),
});

export const TaskListOutputSchema = z.object({
  tasks: z.array(TaskSummarySchema),
});

const TaskIdSchema = z
  .string()
  .min(1)
  .describe(
    "Task uuid or workspace short id (e.g. AGB-5, OVK-5.4). Resolved in the token workspace.",
  );

export const TaskGetInputSchema = z.object({
  task_id: TaskIdSchema,
});

export const TaskGetOutputSchema = z.object({
  task: TaskSchema,
  briefing_markdown: z.string(),
  mission: MissionSchema.nullable(),
  branch_convention: BranchConventionSchema,
});

/**
 * Canonical task_create input (§4.1).
 * Workspace is resolved from the MCP bearer token — never sent in the body.
 * `mission` is the id of an existing mission (from mission_create / mission_list).
 * Missing id → NOT_FOUND. Omitted → card is born loose.
 * `project_id` takes the project uuid or its card prefix (from project_list /
 * project_create).
 */
export const TaskCreateInputSchema = z
  .object({
    mission: z.string().min(1).optional(),
    project_id: ProjectRefSchema,
    title: z.string().min(1).max(200),
    type: TaskTypeSchema,
    o_que: z.string().min(1),
    por_que: z.string().min(1),
    como_confirmo: z.array(ConfirmationStepSchema).min(1),
    priority: PrioritySchema.optional(),
    parent: z.string().min(1).optional(),
    mode: ExecutionModeSchema.default("solo"),
    subtasks: z.array(SubtaskCreateSchema).optional(),
    devolve_para: ReviewerSchema.optional(),
    harness: HarnessSchema.optional(),
    origem: OrigemSchema,
  })
  .superRefine((value, ctx) => {
    if (value.mode === "team" && (!value.subtasks || value.subtasks.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subtasks"],
        message: "mode team exige subtasks com escopo e fronteira próprios",
      });
    }
    if (value.mode === "solo" && value.subtasks && value.subtasks.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subtasks"],
        message: "mode solo cria 1 card — não envie subtasks",
      });
    }
  });

export const TaskCreateOutputSchema = z.object({
  task: TaskSchema,
  subtasks: z.array(TaskSchema),
});

export const TaskClaimInputSchema = z.object({
  task_id: TaskIdSchema,
  force: z.boolean().optional(),
  executor: z
    .object({
      cli: z.string().optional(),
      model: z.string().optional(),
      agent: z.string().optional(),
      session_id: z.string().optional(),
    })
    .optional(),
});

export const HarnessDivergenceSchema = z.object({
  recommended: HarnessSchema,
  actual: HarnessSchema.partial(),
  warning: z.string().min(1),
});

export const TaskClaimOutputSchema = z.object({
  task: TaskSchema,
  attempt: ExecutionAttemptSchema,
  briefing_markdown: z.string(),
  branch_convention: BranchConventionSchema,
  harness_divergence: HarnessDivergenceSchema.optional(),
});

export const TaskUpdateInputSchema = z
  .object({
    task_id: TaskIdSchema,
    comment: z.string().min(1).optional(),
    progress: z.string().min(1).optional(),
    revisado: z.boolean().optional(),
    /** Reclassifies the card. Validated against the configured executors. */
    harness: HarnessSchema.optional(),
    /**
     * Reports or corrects usage after the fact: fills or overwrites the
     * latest attempt's usage, even on a delivered card. Real numbers found
     * later belong here, never in a comment.
     */
    usage: UsageSchema.optional(),
    /**
     * Boot-failure trace: the planned executor never started (CLI missing,
     * crash on boot). An orchestrator posts what happened and the card
     * timeline records it as a typed spawn failure entry.
     */
    spawn_failure: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      value.comment !== undefined ||
      value.progress !== undefined ||
      value.revisado !== undefined ||
      value.harness !== undefined ||
      value.usage !== undefined ||
      value.spawn_failure !== undefined,
    {
      message:
        "provide comment, progress, revisado, harness, usage or spawn_failure",
    },
  );

export const TaskUpdateOutputSchema = z.object({
  task: TaskSchema,
  /** Present when a usage block was applied to the latest attempt. */
  usage_recorded: z.boolean().optional(),
});

export const TaskDeliverInputSchema = z.object({
  task_id: TaskIdSchema,
  summary: z.string().min(1),
  /**
   * Lay validation entry point: a URL, command or screenshot reference the
   * reviewer opens first ("For checking, open..."). Shown on top of the
   * validation panel in the board's Done detail.
   */
  how_to_verify: z.string().min(1).optional(),
  evidence: z.array(EvidenceSchema).default([]),
  artifacts: z.array(ArtifactSchema).default([]),
  branch: z.string().min(1).optional(),
  pull_request_url: z.string().url().optional(),
  /**
   * Required by contract: report exact numbers when the harness exposes
   * them, otherwise ESTIMATE tokens, turns and cost and set estimated: true.
   * The schema still accepts a missing block so a delivery is never lost,
   * but the response then carries usage_warning and the card shows
   * "usage not reported". Duration is measured server-side regardless.
   */
  usage: UsageSchema.optional(),
});

export const TaskDeliverOutputSchema = z.object({
  task: TaskSchema,
  handoff: HandoffSchema,
  telemetry_incomplete: z.boolean(),
  /** Actionable warning returned when the delivery came without usage. */
  usage_warning: z.string().optional(),
  routed_to: ReviewerSchema,
});

/**
 * task_delete is a hard delete by owner decision: the card row is removed and the
 * database cascades over execution_attempts, handoffs, comments and subtasks.
 * There is no archive flag and no undo.
 */
export const TaskDeleteInputSchema = z.object({
  task_id: TaskIdSchema,
});

export const TaskDeleteOutputSchema = z.object({
  deleted: z.literal(true),
  task_id: z.string().min(1),
  short_id: z.string().min(1),
  attempts_deleted: z.number().int().min(0),
  handoffs_deleted: z.number().int().min(0),
});

export const BranchRegisterInputSchema = z.object({
  task_id: TaskIdSchema,
  branch: z.string().min(1),
});

export const BranchRegisterOutputSchema = z.object({
  task: TaskSchema,
});

export const HarnessRecommendInputSchema = z.object({
  type: CardapioTaskTypeSchema,
});

export const HarnessRecommendOutputSchema = z.object({
  harness: z.object({
    cli: z.string().min(1).nullable(),
    model: z.string().min(1).nullable(),
    effort: EffortSchema,
  }),
  model_tier: z.enum(["top", "mid", "cheap"]),
  available: z.boolean(),
  source: z.enum(["cardapio", "explicit"]),
  matched_executor: z
    .object({
      id: z.string(),
      cli: z.string(),
      model: z.string(),
    })
    .nullable(),
  divergence: z.string().optional(),
});

export const CardapioPolicyEntrySchema = z.object({
  type: z.string().min(1),
  cli: z.string().min(1).nullable(),
  model: z.string().min(1).nullable(),
  effort: EffortSchema,
  /**
   * Who wrote this line last and when: an email when it came from Settings,
   * the token label when it came from harness_set. Null on a factory default
   * nobody has touched yet.
   */
  updated_by: z.string().min(1).nullable().optional(),
  updated_at: IsoDateTimeSchema.nullable().optional(),
});

/**
 * Writes one policy line. Guarded by the token's manage flag: a worker token
 * gets PERMISSION_DENIED instead of promoting itself to a better model.
 * `cli` null or omitted means no preference; the model still has to exist on
 * one of the workspace's enabled executors.
 */
export const HarnessSetInputSchema = z.object({
  type: CardapioTaskTypeSchema,
  cli: z.string().min(1).nullable().optional(),
  model: z.string().min(1),
  effort: EffortSchema,
});

export const HarnessSetOutputSchema = z.object({
  policy: CardapioPolicyEntrySchema,
});

export const ConfiguredExecutorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean(),
  /** Checked models: what a card harness may actually ask for. */
  models: z.array(z.string()),
  /** Editable model list the board's selects offer for this CLI. */
  catalog: z.array(z.string()).optional(),
});

/**
 * One model's price, in US dollars per million tokens. `cache_per_mtok`
 * prices the `tokens_cache` counter of the usage contract. `seeded_at` is the
 * date the public price was captured, and is null on a row a human edited.
 */
export const ModelPriceSchema = z.object({
  model: z.string().min(1),
  label: z.string().min(1),
  input_per_mtok: z.number().nonnegative(),
  output_per_mtok: z.number().nonnegative(),
  cache_per_mtok: z.number().nonnegative(),
  source: z.enum(["seed", "custom"]),
  seeded_at: z.string().nullable(),
  updated_by: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export const HarnessListInputSchema = z.object({});

export const HarnessListOutputSchema = z.object({
  policy: z.array(CardapioPolicyEntrySchema),
  executors: z.array(ConfiguredExecutorSchema),
  /**
   * The board's price table, so an orchestrator can reason about cost before
   * it picks a harness. A model that is absent has no price on this board and
   * its cost will only ever be what the agent reports.
   */
  prices: z.array(ModelPriceSchema),
});

/**
 * Adds or removes CLIs and models in the workspace executor config, in the
 * same shape the Settings grid saves. Guarded by the token's manage flag.
 * Adding models turns the CLI on unless `enabled: false` says otherwise: an
 * unchecked model is invisible to the policy selects and to card harnesses.
 * `remove: true` drops the whole CLI and cannot be combined with the others.
 */
export const ExecutorsUpdateInputSchema = z
  .object({
    cli: z
      .string()
      .min(1)
      .describe(
        "Executor id (claude-code, codex, ...) or the binary name an agent sends (claude, gemini). Resolved to the board's id.",
      ),
    label: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    add_models: z.array(z.string().min(1)).optional(),
    remove_models: z.array(z.string().min(1)).optional(),
    remove: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.remove &&
      (value.enabled !== undefined ||
        value.add_models?.length ||
        value.remove_models?.length ||
        value.label)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["remove"],
        message:
          "remove drops the whole executor; send it alone, without label, enabled, add_models or remove_models",
      });
    }
    if (
      !value.remove &&
      value.enabled === undefined &&
      !value.add_models?.length &&
      !value.remove_models?.length &&
      !value.label
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cli"],
        message:
          "provide at least one of label, enabled, add_models, remove_models or remove",
      });
    }
  });

export const ExecutorsUpdateOutputSchema = z.object({
  /** The whole config after the change, the shape Settings reads. */
  executors: z.array(ConfiguredExecutorSchema),
  /** Id the cli resolved to, which may differ from what was sent. */
  updated: z.string().min(1),
  removed: z.boolean(),
  /**
   * Policy lines left pointing at a cli/model this change took away. The write
   * still happened; this says what to fix with harness_set.
   */
  policy_warnings: z.array(z.string()).optional(),
});

/**
 * Usage totals over a set of finished attempts. `estimated` and `missing` are
 * counts of attempts, not money: they say how much of the sum to trust. The
 * board never silently folds a guess or a blank into a number.
 */
export const UsageTotalsSchema = z.object({
  cost_usd: z.number(),
  /** Attempts whose cost the board computed from the price table. */
  cost_computed: z.number().int().nonnegative(),
  /** Attempts that contributed the cost figure the agent sent. */
  cost_reported: z.number().int().nonnegative(),
  /** Same, where the agent flagged its own numbers as an estimate. */
  cost_estimated: z.number().int().nonnegative(),
  /** Attempts with tokens the board could not price: no row for the model. */
  cost_unpriced: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  duration_ms: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
  /** Attempts whose executor flagged the numbers as an estimate. */
  estimated: z.number().int().nonnegative(),
  /** Attempts that finished reporting no usage at all. */
  missing: z.number().int().nonnegative(),
});

export const InsightGroupSchema = UsageTotalsSchema.extend({
  key: z.string().min(1),
  /** null when the dimension is absent: card without mission, model not reported. */
  label: z.string().nullable(),
  /**
   * Only on group_by=model: attempts in this group that also ran another
   * model. Their tokens are split per segment, but the board has no way to
   * know how the wall clock split, so the whole duration lands in every model
   * the run touched. Non-zero means the durations across models overlap and do
   * not add up to the total.
   */
  shared_attempts: z.number().int().nonnegative().optional(),
});

export const InsightCardSchema = z.object({
  task_id: z.string().min(1),
  short_id: z.string().min(1),
  title: z.string(),
  project: z.string(),
  mission: z.string().nullable(),
  models: z.array(z.string()),
  /** null when no attempt on the card has a cost. Not the same as $0. */
  cost_usd: z.number().nullable(),
  /** Where that figure came from; "mixed" when the attempts disagree. */
  cost_source: z.enum(["computed", "reported", "estimated", "mixed"]).nullable(),
  tokens: z.number().int().nonnegative(),
  duration_ms: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
  estimated: z.boolean(),
  missing: z.boolean(),
});

export const ModelReopenSchema = z.object({
  model: z.string().nullable(),
  deliveries: z.number().int().nonnegative(),
  reopened: z.number().int().nonnegative(),
  /** reopened / deliveries, 0..1. */
  rate: z.number(),
});

/**
 * The aggregate questions the Insights page answers, over MCP. Same rows, same
 * aggregation: only finished attempts count, example cards stay out, and the
 * period narrows attempts by when they finished (reopens are not narrowed, so
 * a delivery reopened later still counts as reopened).
 */
export const InsightsQueryInputSchema = z.object({
  group_by: z
    .enum(["project", "mission", "model", "card"])
    .optional()
    .describe("Omit for totals and the reopen rate only."),
  since: z
    .string()
    .datetime()
    .optional()
    .describe("ISO timestamp; attempts that finished before it are excluded."),
  until: z
    .string()
    .datetime()
    .optional()
    .describe("ISO timestamp; attempts that finished after it are excluded."),
});

export const InsightsQueryOutputSchema = z.object({
  period: z.object({
    since: IsoDateTimeSchema.nullable(),
    until: IsoDateTimeSchema.nullable(),
  }),
  totals: UsageTotalsSchema,
  /** Plain-language honesty note, the same one the Insights page prints. */
  note: z.string().min(1),
  /** Where the dollars came from: "3 computed · 1 agent reported". */
  cost_note: z.string().min(1),
  /** Present when group_by is project, mission or model. Cost descending. */
  groups: z.array(InsightGroupSchema).optional(),
  /** Present when group_by is card. */
  cards: z.array(InsightCardSchema).optional(),
  /** Reopened rate per model, highest first. */
  reopened_by_model: z.array(ModelReopenSchema),
});

export const MCP_TOOL_NAMES = [
  "project_list",
  "project_create",
  "mission_list",
  "mission_get",
  "mission_create",
  "task_list",
  "task_get",
  "task_create",
  "task_claim",
  "task_update",
  "task_deliver",
  "task_delete",
  "branch_register",
  "harness_recommend",
  "harness_list",
  "harness_set",
  "executors_update",
  "insights_query",
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export const toolContracts = {
  project_list: {
    input: ProjectListInputSchema,
    output: ProjectListOutputSchema,
  },
  project_create: {
    input: ProjectCreateInputSchema,
    output: ProjectCreateOutputSchema,
  },
  mission_list: {
    input: MissionListInputSchema,
    output: MissionListOutputSchema,
  },
  mission_get: {
    input: MissionGetInputSchema,
    output: MissionGetOutputSchema,
  },
  mission_create: {
    input: MissionCreateInputSchema,
    output: MissionCreateOutputSchema,
  },
  task_list: {
    input: TaskListInputSchema,
    output: TaskListOutputSchema,
  },
  task_get: {
    input: TaskGetInputSchema,
    output: TaskGetOutputSchema,
  },
  task_create: {
    input: TaskCreateInputSchema,
    output: TaskCreateOutputSchema,
  },
  task_claim: {
    input: TaskClaimInputSchema,
    output: TaskClaimOutputSchema,
  },
  task_update: {
    input: TaskUpdateInputSchema,
    output: TaskUpdateOutputSchema,
  },
  task_deliver: {
    input: TaskDeliverInputSchema,
    output: TaskDeliverOutputSchema,
  },
  task_delete: {
    input: TaskDeleteInputSchema,
    output: TaskDeleteOutputSchema,
  },
  branch_register: {
    input: BranchRegisterInputSchema,
    output: BranchRegisterOutputSchema,
  },
  harness_recommend: {
    input: HarnessRecommendInputSchema,
    output: HarnessRecommendOutputSchema,
  },
  harness_list: {
    input: HarnessListInputSchema,
    output: HarnessListOutputSchema,
  },
  harness_set: {
    input: HarnessSetInputSchema,
    output: HarnessSetOutputSchema,
  },
  executors_update: {
    input: ExecutorsUpdateInputSchema,
    output: ExecutorsUpdateOutputSchema,
  },
  insights_query: {
    input: InsightsQueryInputSchema,
    output: InsightsQueryOutputSchema,
  },
} as const;

export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>;
export type TaskCreateOutput = z.infer<typeof TaskCreateOutputSchema>;
export type TaskClaimInput = z.infer<typeof TaskClaimInputSchema>;
export type TaskClaimOutput = z.infer<typeof TaskClaimOutputSchema>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateInputSchema>;
export type TaskDeliverInput = z.infer<typeof TaskDeliverInputSchema>;
export type TaskDeliverOutput = z.infer<typeof TaskDeliverOutputSchema>;
export type TaskDeleteInput = z.infer<typeof TaskDeleteInputSchema>;
export type TaskDeleteOutput = z.infer<typeof TaskDeleteOutputSchema>;
export type MissionListInput = z.infer<typeof MissionListInputSchema>;
export type MissionGetInput = z.infer<typeof MissionGetInputSchema>;
export type MissionCreateInput = z.infer<typeof MissionCreateInputSchema>;
export type MissionCreateOutput = z.infer<typeof MissionCreateOutputSchema>;
export type TaskListInput = z.infer<typeof TaskListInputSchema>;
export type TaskGetInput = z.infer<typeof TaskGetInputSchema>;
export type BranchRegisterInput = z.infer<typeof BranchRegisterInputSchema>;
export type HarnessRecommendInput = z.infer<typeof HarnessRecommendInputSchema>;
export type HarnessListInput = z.infer<typeof HarnessListInputSchema>;
export type HarnessListOutput = z.infer<typeof HarnessListOutputSchema>;
export type CardapioPolicyEntryContract = z.infer<typeof CardapioPolicyEntrySchema>;
export type ConfiguredExecutorContract = z.infer<typeof ConfiguredExecutorSchema>;
export type ModelPriceContract = z.infer<typeof ModelPriceSchema>;
export type ExecutorsUpdateInput = z.infer<typeof ExecutorsUpdateInputSchema>;
export type ExecutorsUpdateOutput = z.infer<typeof ExecutorsUpdateOutputSchema>;
export type InsightsQueryInput = z.infer<typeof InsightsQueryInputSchema>;
export type InsightsQueryOutput = z.infer<typeof InsightsQueryOutputSchema>;
export type InsightGroupContract = z.infer<typeof InsightGroupSchema>;
export type InsightCardContract = z.infer<typeof InsightCardSchema>;
export type HarnessSetInput = z.infer<typeof HarnessSetInputSchema>;
export type HarnessSetOutput = z.infer<typeof HarnessSetOutputSchema>;
export type ProjectListInput = z.infer<typeof ProjectListInputSchema>;
export type ProjectListOutput = z.infer<typeof ProjectListOutputSchema>;
export type ProjectCreateInput = z.infer<typeof ProjectCreateInputSchema>;
export type ProjectCreateOutput = z.infer<typeof ProjectCreateOutputSchema>;
