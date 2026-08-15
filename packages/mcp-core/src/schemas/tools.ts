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
  MissionSchema,
  MissionStatusSchema,
  MissionSummarySchema,
  OrigemSchema,
  PrioritySchema,
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

export const TaskListInputSchema = z.object({
  project_id: z.string().min(1).optional(),
  mission_id: z.string().min(1).optional(),
  status: z.union([CardStatusSchema, z.array(CardStatusSchema)]).optional(),
  priority: PrioritySchema.optional(),
  type: TaskTypeSchema.optional(),
  awaiting_review_by: z.union([z.literal("me"), z.string().min(1)]).optional(),
});

export const TaskListOutputSchema = z.object({
  tasks: z.array(TaskSummarySchema),
});

export const TaskGetInputSchema = z.object({
  task_id: z.string().min(1),
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
 */
export const TaskCreateInputSchema = z
  .object({
    mission: z.string().min(1).optional(),
    project_id: z.string().min(1),
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
  task_id: z.string().min(1),
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
    task_id: z.string().min(1),
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
  })
  .refine(
    (value) =>
      value.comment !== undefined ||
      value.progress !== undefined ||
      value.revisado !== undefined ||
      value.harness !== undefined ||
      value.usage !== undefined,
    { message: "informe comment, progress, revisado, harness ou usage" },
  );

export const TaskUpdateOutputSchema = z.object({
  task: TaskSchema,
  /** Present when a usage block was applied to the latest attempt. */
  usage_recorded: z.boolean().optional(),
});

export const TaskDeliverInputSchema = z.object({
  task_id: z.string().min(1),
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
  task_id: z.string().min(1),
});

export const TaskDeleteOutputSchema = z.object({
  deleted: z.literal(true),
  task_id: z.string().min(1),
  short_id: z.string().min(1),
  attempts_deleted: z.number().int().min(0),
  handoffs_deleted: z.number().int().min(0),
});

export const BranchRegisterInputSchema = z.object({
  task_id: z.string().min(1),
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
});

export const HarnessListInputSchema = z.object({});

export const HarnessListOutputSchema = z.object({
  policy: z.array(CardapioPolicyEntrySchema),
  executors: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      enabled: z.boolean(),
      models: z.array(z.string()),
    }),
  ),
});

export const MCP_TOOL_NAMES = [
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
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export const toolContracts = {
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
