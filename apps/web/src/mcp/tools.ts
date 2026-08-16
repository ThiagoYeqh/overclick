import {
  canNestUnder,
  cardapioEntry,
  derivePrefix,
  executionAttempt,
  factoryCardapioPolicy,
  handoff,
  isValidPrefix,
  mission,
  nextShortId,
  normalizeShortId,
  project,
  task,
  taskComment,
  workspace,
  type ExecutorConfig,
} from "@agent-board/db";
import {
  applyTransition,
  branchConvention,
  err,
  evaluateClaim,
  isMcpCoreError,
  isTelemetryIncomplete,
  MCP_TOOL_NAMES,
  ok,
  recommendHarness,
  toolContracts,
  type CardapioPolicyEntry,
  type CardapioTaskType,
  type CardStatus,
  type EffortLevel,
  type Harness,
  type McpToolName,
  type Result,
  type Reviewer,
  type Task,
  type Usage,
} from "@agent-board/mcp-core";
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { applyExecutorUpdate, isPairInConfig } from "../lib/executors";
import {
  computeInsights,
  filterAttemptsByPeriod,
  loadInsightAttemptRows,
  loadReopenRows,
  usageHonestyNote,
  type InsightsDb,
} from "../lib/insights";
import { renderBriefingMarkdown } from "./briefing";
import {
  decodeExecutor,
  emptyCardCounts,
  encodeExecutor,
  executorsFromWorkspace,
  harnessToDb,
  iso,
  looksLikeUuid,
  mapMission,
  mapProject,
  mapTask,
  originToDb,
  reviewerFromRow,
  reviewerToColumns,
  serializeComoConfirmo,
  type ProjectRow,
  type TaskRow,
} from "./map";
import type { AuthContext, McpDatabase } from "./types";

type Tx = McpDatabase;

export async function invokeTool(
  db: McpDatabase,
  ctx: AuthContext,
  name: McpToolName,
  args: unknown,
): Promise<Result<unknown>> {
  const contract = toolContracts[name];
  const parsed = contract.input.safeParse(args ?? {});
  if (!parsed.success) {
    return err(
      "INVALID_ARGUMENT",
      parsed.error.issues[0]?.message ?? "invalid arguments",
      parsed.error.flatten(),
    );
  }

  let value: unknown;
  try {
    value = await dispatchTool(db, ctx, name, parsed.data);
  } catch (error) {
    // Nothing below this layer may reach the agent raw: a thrown driver error
    // carries the failed SQL in its message.
    if (isMcpCoreError(error)) {
      return { ok: false, error };
    }
    console.error(`[mcp] ${name} threw`, error);
    return err(
      "INTERNAL",
      `Unexpected server error while running ${name}. Check the ids and values you passed and try again; the server logs have the details.`,
    );
  }

  if (value && typeof value === "object" && "ok" in value && (value as Result<unknown>).ok === false) {
    return value as Result<unknown>;
  }

  const output = contract.output.safeParse(value);
  if (!output.success) {
    return err(
      "INVALID_ARGUMENT",
      `invalid response from ${name}: ${output.error.issues[0]?.message ?? "schema"}`,
      output.error.flatten(),
    );
  }
  return ok(output.data);
}

async function dispatchTool(
  db: McpDatabase,
  ctx: AuthContext,
  name: McpToolName,
  data: unknown,
): Promise<unknown> {
  let value: unknown;
  switch (name) {
    case "project_list":
      value = await projectList(db, ctx);
      break;
    case "project_create":
      value = await projectCreate(
        db,
        ctx,
        data as Parameters<typeof projectCreate>[2],
      );
      break;
    case "mission_list":
      value = await missionList(db, ctx, data as Parameters<typeof missionList>[2]);
      break;
    case "mission_get":
      value = await missionGet(db, ctx, data as Parameters<typeof missionGet>[2]);
      break;
    case "mission_create":
      value = await missionCreate(
        db,
        ctx,
        data as Parameters<typeof missionCreate>[2],
      );
      break;
    case "task_list":
      value = await taskList(db, ctx, data as Parameters<typeof taskList>[2]);
      break;
    case "task_get":
      value = await taskGet(db, ctx, data as Parameters<typeof taskGet>[2]);
      break;
    case "task_create":
      value = await taskCreate(db, ctx, data as Parameters<typeof taskCreate>[2]);
      break;
    case "task_claim":
      value = await taskClaim(db, ctx, data as Parameters<typeof taskClaim>[2]);
      break;
    case "task_update":
      value = await taskUpdate(db, ctx, data as Parameters<typeof taskUpdate>[2]);
      break;
    case "task_deliver":
      value = await taskDeliver(db, ctx, data as Parameters<typeof taskDeliver>[2]);
      break;
    case "task_delete":
      value = await taskDelete(db, ctx, data as Parameters<typeof taskDelete>[2]);
      break;
    case "branch_register":
      value = await branchRegister(db, ctx, data as Parameters<typeof branchRegister>[2]);
      break;
    case "harness_recommend":
      value = await harnessRecommend(
        db,
        ctx,
        data as Parameters<typeof harnessRecommend>[2],
      );
      break;
    case "harness_list":
      value = await harnessList(db, ctx);
      break;
    case "harness_set":
      value = await harnessSet(db, ctx, data as Parameters<typeof harnessSet>[2]);
      break;
    case "insights_query":
      value = await insightsQuery(
        db,
        ctx,
        data as Parameters<typeof insightsQuery>[2],
      );
      break;
    case "executors_update":
      value = await executorsUpdate(
        db,
        ctx,
        data as Parameters<typeof executorsUpdate>[2],
      );
      break;
    default: {
      const _never: never = name;
      return err("INVALID_ARGUMENT", `unknown tool: ${String(_never)}`);
    }
  }
  return value;
}

export function isMcpToolName(name: string): name is McpToolName {
  return (MCP_TOOL_NAMES as readonly string[]).includes(name);
}

/** Every message that sends an agent back to the project tools says the same thing. */
const PROJECT_HINT =
  "Call project_list to see the projects in this workspace, or project_create to start one.";

async function projectList(db: McpDatabase, ctx: AuthContext) {
  const rows = await db
    .select()
    .from(project)
    .where(eq(project.workspaceId, ctx.workspaceId))
    .orderBy(asc(project.createdAt));

  const ids = rows.map((row) => row.id);
  const counts =
    ids.length === 0
      ? []
      : await db
          .select({ projectId: task.projectId, status: task.status, n: count() })
          .from(task)
          .where(inArray(task.projectId, ids))
          .groupBy(task.projectId, task.status);

  const byProject = new Map<string, ReturnType<typeof emptyCardCounts>>();
  for (const row of counts) {
    const tally = byProject.get(row.projectId) ?? emptyCardCounts();
    const n = Number(row.n);
    tally[row.status] += n;
    tally.total += n;
    byProject.set(row.projectId, tally);
  }

  return {
    projects: rows.map((row) =>
      mapProject(row, byProject.get(row.id) ?? emptyCardCounts()),
    ),
  };
}

async function projectCreate(
  db: McpDatabase,
  ctx: AuthContext,
  input: { name: string; repo_url?: string; id_prefix?: string },
) {
  const name = input.name.trim();
  if (!name) {
    return err("INVALID_ARGUMENT", "Project name cannot be empty.");
  }

  const explicit = input.id_prefix?.trim().toUpperCase();
  const prefix = explicit ?? derivePrefix(name);
  if (!prefix) {
    return err(
      "INVALID_ARGUMENT",
      `Could not derive a card prefix from '${name}'. Pass id_prefix explicitly: 2 to 4 letters or digits, for example AGB.`,
    );
  }
  if (!isValidPrefix(prefix)) {
    return err(
      "INVALID_ARGUMENT",
      `Card prefix '${prefix}' is invalid: use 2 to 4 letters or digits, for example AGB.`,
    );
  }

  // The prefix is what every card carries (AGB-1, AGB-2), so a collision would
  // make two projects indistinguishable on the board. Checked here for a clean
  // message, and again by the unique index below for concurrent creates.
  const taken = await findProject(db, ctx.workspaceId, prefix);
  if (taken) {
    return err(
      "INVALID_ARGUMENT",
      `Card prefix '${prefix}' is already used by project '${taken.name}'. Pass a different id_prefix.`,
    );
  }

  let row: ProjectRow | undefined;
  try {
    [row] = await db
      .insert(project)
      .values({
        workspaceId: ctx.workspaceId,
        name,
        repoUrl: input.repo_url?.trim() || null,
        idPrefix: prefix,
        nextNumber: 1,
      })
      .returning();
  } catch (error) {
    if (isPrefixConflict(error)) {
      return err(
        "INVALID_ARGUMENT",
        `Card prefix '${prefix}' was just taken by another project. Pass a different id_prefix.`,
      );
    }
    throw error;
  }
  if (!row) {
    throw new Error("failed to insert project");
  }

  return { project: mapProject(row, emptyCardCounts()) };
}

function isPrefixConflict(error: unknown): boolean {
  const message =
    error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : "";
  return message.includes("project_workspace_prefix");
}

async function missionList(
  db: McpDatabase,
  ctx: AuthContext,
  input: { status?: "ativa" | "pausada" | "concluida" },
) {
  const filters = [eq(mission.workspaceId, ctx.workspaceId)];
  if (input.status) filters.push(eq(mission.status, input.status));

  const rows = await db
    .select()
    .from(mission)
    .where(and(...filters))
    .orderBy(asc(mission.createdAt));

  const ids = rows.map((row) => row.id);
  const counts =
    ids.length === 0
      ? []
      : await db
          .select({ missionId: task.missionId, n: count() })
          .from(task)
          .where(inArray(task.missionId, ids))
          .groupBy(task.missionId);
  const byMission = new Map(counts.map((row) => [row.missionId, Number(row.n)]));

  return {
    missions: rows.map((row) => mapMission(row, byMission.get(row.id) ?? 0)),
  };
}

async function missionGet(
  db: McpDatabase,
  ctx: AuthContext,
  input: { mission_id: string },
) {
  const row = await findMission(db, ctx.workspaceId, input.mission_id);
  if (!row) {
    return err(
      "NOT_FOUND",
      `Mission ${input.mission_id} not found. Call mission_list to see the available missions.`,
    );
  }
  const [counted] = await db
    .select({ n: count() })
    .from(task)
    .where(eq(task.missionId, row.id));
  return { mission: mapMission(row, Number(counted?.n ?? 0)) };
}

async function missionCreate(
  db: McpDatabase,
  ctx: AuthContext,
  input: {
    title: string;
    objective?: string;
    context?: string;
    status?: "ativa" | "pausada" | "concluida";
  },
) {
  const objective = (input.objective ?? input.context ?? "").trim();
  const context = (input.context ?? input.objective ?? "").trim();
  const [row] = await db
    .insert(mission)
    .values({
      workspaceId: ctx.workspaceId,
      title: input.title.trim(),
      objective,
      context,
      status: input.status ?? "ativa",
    })
    .returning();
  if (!row) {
    throw new Error("failed to insert mission");
  }
  return { mission: mapMission(row, 0) };
}

async function taskList(
  db: McpDatabase,
  ctx: AuthContext,
  input: {
    project_id?: string;
    mission_id?: string;
    status?: CardStatus | CardStatus[];
    priority?: Task["priority"];
    type?: Task["type"];
    awaiting_review_by?: "me" | string;
  },
) {
  const filters = [eq(project.workspaceId, ctx.workspaceId)];
  if (input.project_id) {
    const proj = await findProject(db, ctx.workspaceId, input.project_id);
    if (!proj) {
      return err(
        "NOT_FOUND",
        `Project ${input.project_id} not found in this workspace. ${PROJECT_HINT}`,
      );
    }
    filters.push(eq(task.projectId, proj.id));
  }
  if (input.mission_id) {
    if (!looksLikeUuid(input.mission_id)) {
      return err(
        "NOT_FOUND",
        `Mission ${input.mission_id} not found. Call mission_list to see the available missions.`,
      );
    }
    filters.push(eq(task.missionId, input.mission_id));
  }
  if (input.priority) filters.push(eq(task.priority, input.priority));
  if (input.type) filters.push(eq(task.tipo, input.type));

  if (input.awaiting_review_by !== undefined) {
    filters.push(eq(task.status, "feito"));
    if (input.awaiting_review_by === "me") {
      filters.push(eq(task.devolveParaKind, "agent"));
    } else {
      // Only probe the uuid user column with a uuid; anything else is an
      // agent ref and would otherwise blow up as a raw uuid cast error.
      filters.push(
        looksLikeUuid(input.awaiting_review_by)
          ? or(
              eq(task.devolveParaUserId, input.awaiting_review_by),
              eq(task.devolveParaAgentRef, input.awaiting_review_by),
            )!
          : eq(task.devolveParaAgentRef, input.awaiting_review_by),
      );
    }
  } else if (input.status) {
    const statuses = Array.isArray(input.status) ? input.status : [input.status];
    filters.push(inArray(task.status, statuses));
  }

  const rows = await db
    .select({ task, project })
    .from(task)
    .innerJoin(project, eq(task.projectId, project.id))
    .where(and(...filters))
    .orderBy(asc(task.createdAt));

  return {
    tasks: rows.map((row) => {
      const mapped = mapTask(row.task, row.project);
      return {
        id: mapped.id,
        short_id: mapped.short_id,
        title: mapped.title,
        type: mapped.type,
        status: mapped.status,
        revisado: mapped.revisado,
        priority: mapped.priority,
        project_id: mapped.project_id,
        mission_id: mapped.mission_id,
        devolve_para: mapped.devolve_para,
      };
    }),
  };
}

async function taskGet(
  db: McpDatabase,
  ctx: AuthContext,
  input: { task_id: string },
) {
  const found = await findTask(db, ctx.workspaceId, input.task_id);
  if (!found) {
    return err(
      "NOT_FOUND",
      `Task ${input.task_id} not found in this workspace. Call task_list to see the available cards.`,
    );
  }
  return assembleTaskPayload(db, found.row, found.proj);
}

async function taskCreate(
  db: McpDatabase,
  ctx: AuthContext,
  input: {
    mission?: string;
    project_id: string;
    title: string;
    type: Task["type"];
    o_que: string;
    por_que: string;
    como_confirmo: Task["como_confirmo"];
    priority?: Task["priority"];
    parent?: string;
    mode: "solo" | "team";
    subtasks?: Array<{
      title: string;
      scope: string;
      boundary: string;
      o_que?: string;
      por_que?: string;
      como_confirmo?: Task["como_confirmo"];
      harness?: Harness;
      devolve_para?: Reviewer;
    }>;
    devolve_para?: Reviewer;
    harness?: Harness;
    origem: Task["origem"];
  },
) {
  const proj = await findProject(db, ctx.workspaceId, input.project_id);
  if (!proj) {
    return err(
      "NOT_FOUND",
      `Project ${input.project_id} not found in this workspace. ${PROJECT_HINT}`,
    );
  }

  let missionId: string | null = null;
  if (input.mission) {
    const miss = await findMission(db, ctx.workspaceId, input.mission);
    if (!miss) {
      return err(
        "NOT_FOUND",
        `Mission ${input.mission} not found. Call mission_list to see the available missions or mission_create to start one.`,
      );
    }
    missionId = miss.id;
  }

  let parentRow: TaskRow | null = null;
  if (input.parent) {
    const parent = await findTask(db, ctx.workspaceId, input.parent);
    if (!parent) {
      return err(
        "NOT_FOUND",
        `Parent task ${input.parent} not found in this workspace. Call task_list to see the available cards.`,
      );
    }
    if (!canNestUnder({ parentId: parent.row.parentId })) {
      return err(
        "INVALID_ARGUMENT",
        "Subtasks only nest one level deep and this parent is already a subtask. Use its parent card instead.",
      );
    }
    parentRow = parent.row;
  }

  const rec = await recommendFor(db, ctx.workspaceId, input.type, input.harness);
  if (!rec.ok) return rec;

  const reviewer = reviewerToColumns(input.devolve_para);
  const harness = harnessToDb(rec.value.harness);

  return db.transaction(async (tx) => {
    const shortId = parentRow
      ? await nextChildShortId(tx, parentRow)
      : await allocateShortId(tx, proj);

    const subtasks = input.mode === "team" ? (input.subtasks ?? []) : [];
    const plano =
      subtasks.length > 0
        ? [
            "",
            "## Plano",
            ...subtasks.map(
              (item, index) =>
                `- ${shortId}.${index + 1} ${item.title} — ${item.scope} (fronteira: ${item.boundary})`,
            ),
          ].join("\n")
        : "";

    const [created] = await tx
      .insert(task)
      .values({
        projectId: proj.id,
        missionId,
        parentId: parentRow?.id ?? null,
        shortId,
        title: input.title,
        oQue: `${input.o_que}${plano}`,
        porQue: input.por_que,
        comoConfirmo: serializeComoConfirmo(input.como_confirmo),
        tipo: input.type,
        status: "aberto",
        priority: input.priority ?? "media",
        ...reviewer,
        harness,
        origin: originToDb(input.origem),
        mode: input.mode,
      })
      .returning();
    if (!created) {
      throw new Error("failed to insert task");
    }

    const children: TaskRow[] = [];
    for (const [index, item] of subtasks.entries()) {
      const childRec = item.harness
        ? await recommendFor(db, ctx.workspaceId, input.type, item.harness)
        : rec;
      if (!childRec.ok) throw childRec.error;

      const [child] = await tx
        .insert(task)
        .values({
          projectId: proj.id,
          missionId,
          parentId: created.id,
          shortId: `${shortId}.${index + 1}`,
          title: item.title,
          oQue: item.o_que ?? item.scope,
          porQue: item.por_que ?? input.por_que,
          comoConfirmo: serializeComoConfirmo(
            item.como_confirmo ?? input.como_confirmo,
          ),
          tipo: input.type,
          status: "aberto",
          priority: input.priority ?? "media",
          ...reviewerToColumns(item.devolve_para ?? input.devolve_para),
          harness: harnessToDb(childRec.value.harness),
          origin: originToDb(input.origem),
          mode: "solo",
        })
        .returning();
      if (!child) throw new Error("failed to insert subtask");
      children.push(child);
    }

    return {
      task: mapTask(created, proj),
      subtasks: children.map((child) => mapTask(child, proj)),
    };
  });
}

async function taskClaim(
  db: McpDatabase,
  ctx: AuthContext,
  input: {
    task_id: string;
    force?: boolean;
    executor?: {
      cli?: string;
      model?: string;
      agent?: string;
      session_id?: string;
    };
  },
) {
  const claimed = await db.transaction(async (tx) => {
    const found = await findTask(tx, ctx.workspaceId, input.task_id, true);
    if (!found) {
      return err(
      "NOT_FOUND",
      `Task ${input.task_id} not found in this workspace. Call task_list to see the available cards.`,
    );
    }

    const reopenComment = await latestReopenComment(tx, found.row);
    const evaluated = evaluateClaim(
      {
        id: found.row.id,
        status: found.row.status,
        revisado: found.row.revisado,
        reopen_comment: reopenComment,
        claimed_by: found.row.claimedByTokenId,
        attempt_id: null,
      },
      {
        task_id: found.row.id,
        force: input.force,
        actor: {
          token_id: ctx.tokenId,
          token_revoked: false,
          executor: input.executor,
        },
      },
    );
    if (!evaluated.ok) return evaluated;

    const [updated] = await tx
      .update(task)
      .set({
        status: "em_execucao",
        claimedAt: new Date(),
        claimedByTokenId: ctx.tokenId,
        claimedByExecutor:
          input.executor?.cli ?? input.executor?.agent ?? ctx.tokenLabel,
      })
      .where(
        and(
          eq(task.id, found.row.id),
          eq(task.status, evaluated.value.cas.expected_status),
        ),
      )
      .returning();
    if (!updated) {
      return err(
        "ALREADY_CLAIMED",
        "Another executor took the card first. Call task_get to see its current status.",
      );
    }

    if (input.force) {
      await tx
        .update(executionAttempt)
        .set({ finishedAt: new Date(), result: "abandoned" })
        .where(
          and(
            eq(executionAttempt.taskId, updated.id),
            isNull(executionAttempt.finishedAt),
          ),
        );
    }

    const [attempt] = await tx
      .insert(executionAttempt)
      .values({
        taskId: updated.id,
        executor: encodeExecutor({
          token_id: ctx.tokenId,
          cli: input.executor?.cli,
          agent: input.executor?.agent,
          session_id: input.executor?.session_id,
        }),
        model: input.executor?.model ?? null,
      })
      .returning();
    if (!attempt) throw new Error("failed to insert execution_attempt");

    return ok({ updated, proj: found.proj, attempt, reopenComment });
  });

  if (!claimed.ok) return claimed;

  await recordSeenExecutor(db, ctx.workspaceId, {
    cli: input.executor?.cli,
    model: input.executor?.model,
  });

  const payload = await assembleTaskPayload(
    db,
    claimed.value.updated,
    claimed.value.proj,
    claimed.value.reopenComment,
  );
  if (!payload || ("ok" in payload && payload.ok === false)) return payload;

  const recommended = payload.task.harness;
  const actual = input.executor ?? {};
  const divergence =
    recommended &&
    actual.model &&
    actual.model.trim().toLowerCase() !== recommended.model.trim().toLowerCase()
      ? {
          recommended,
          actual,
          warning: `Executor differs from the card harness: the card plans ${recommended.model} · ${recommended.effort}, the claim came with ${actual.model}.`,
        }
      : undefined;

  if (divergence) {
    // The swap survives the session: the card timeline records planned vs
    // actual automatically, whoever reads the board later sees what ran.
    const planned = [
      recommended?.cli ? `${recommended.cli} · ` : "",
      recommended?.model,
      ` · ${recommended?.effort}`,
    ].join("");
    const cameWith = [actual.cli ? `${actual.cli} · ` : "", actual.model].join("");
    await db.insert(taskComment).values({
      taskId: claimed.value.updated.id,
      authorAgentRef: ctx.tokenLabel,
      kind: "executor_swap",
      body: `planned ${planned}, actual ${cameWith}`,
    });
  }

  return {
    task: payload.task,
    attempt: {
      id: claimed.value.attempt.id,
      task_id: claimed.value.attempt.taskId,
      executor: decodeExecutor(
        claimed.value.attempt.executor,
        claimed.value.attempt.model,
      ),
      started_at: iso(claimed.value.attempt.startedAt),
      finished_at: claimed.value.attempt.finishedAt
        ? iso(claimed.value.attempt.finishedAt)
        : null,
      usage: null,
      result: null,
    },
    briefing_markdown: payload.briefing_markdown,
    branch_convention: payload.branch_convention,
    ...(divergence ? { harness_divergence: divergence } : {}),
  };
}

/**
 * Learns executors from real connections: a claim or deliver whose cli/model
 * pair is outside the active workspace config records the occurrence, and
 * Settings offers it as a one-click suggestion.
 */
async function recordSeenExecutor(
  db: McpDatabase,
  workspaceId: string,
  executor: { cli?: string; model?: string },
): Promise<void> {
  const cli = executor.cli?.trim();
  const model = executor.model?.trim();
  if (!cli || !model) return;

  const [ws] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  if (!ws) return;
  if (isPairInConfig(ws.executors, cli, model)) return;

  const now = new Date().toISOString();
  const seen = [...ws.seenExecutors];
  const match = seen.find(
    (s) =>
      s.cli.trim().toLowerCase() === cli.toLowerCase() &&
      s.model.trim().toLowerCase() === model.toLowerCase(),
  );
  if (match) {
    match.lastSeenAt = now;
    match.count += 1;
  } else {
    seen.push({ cli, model, firstSeenAt: now, lastSeenAt: now, count: 1 });
  }
  await db
    .update(workspace)
    .set({ seenExecutors: seen })
    .where(eq(workspace.id, workspaceId));
}

async function taskUpdate(
  db: McpDatabase,
  ctx: AuthContext,
  input: {
    task_id: string;
    comment?: string;
    progress?: string;
    revisado?: boolean;
    harness?: Harness;
    usage?: Usage;
    spawn_failure?: string;
  },
) {
  const found = await findTask(db, ctx.workspaceId, input.task_id);
  if (!found) {
    return err(
      "NOT_FOUND",
      `Task ${input.task_id} not found in this workspace. Call task_list to see the available cards.`,
    );
  }

  let nextRow = found.row;
  if (input.harness) {
    const resolved = await resolveHarnessAgainstExecutors(
      db,
      ctx.workspaceId,
      input.harness,
    );
    if (!resolved.ok) return resolved;
    const [updated] = await db
      .update(task)
      .set({ harness: harnessToDb(resolved.value) })
      .where(eq(task.id, nextRow.id))
      .returning();
    if (updated) nextRow = updated;
  }
  if (input.revisado === true) {
    const transition = applyTransition(
      {
        status: found.row.status,
        revisado: found.row.revisado,
        reopen_comment: await latestReopenComment(db, found.row),
      },
      { type: "mark_revisado" },
    );
    if (!transition.ok) return transition;
    const [updated] = await db
      .update(task)
      .set({ revisado: true })
      .where(eq(task.id, found.row.id))
      .returning();
    if (updated) nextRow = updated;
  }

  // Usage can arrive (or be corrected) after deliver: real numbers found
  // later fill or overwrite the latest attempt instead of dying in a comment.
  let usageRecorded = false;
  if (input.usage) {
    const applied = await applyUsageToLatestAttempt(db, nextRow, input.usage);
    if (!applied.ok) return applied;
    nextRow = applied.value;
    usageRecorded = true;
  }

  const bodies = [input.comment, input.progress ? `progresso: ${input.progress}` : null]
    .filter((value): value is string => Boolean(value));
  for (const body of bodies) {
    await db.insert(taskComment).values({
      taskId: nextRow.id,
      authorAgentRef: ctx.tokenLabel,
      body,
    });
  }

  if (input.spawn_failure) {
    // Boot-failure trace from an orchestrator: the planned executor never
    // started. Typed so the card detail labels it, with the planned harness
    // captured at post time.
    const planned = nextRow.harness
      ? ` (planned ${[nextRow.harness.cli, nextRow.harness.model ?? nextRow.harness.modelTier]
          .filter(Boolean)
          .join(" · ")} · ${nextRow.harness.effort})`
      : "";
    await db.insert(taskComment).values({
      taskId: nextRow.id,
      authorAgentRef: ctx.tokenLabel,
      kind: "spawn_failure",
      body: `${input.spawn_failure}${planned}`,
    });
  }

  return {
    task: mapTask(nextRow, found.proj, {
      reopenComment: await latestReopenComment(db, nextRow),
    }),
    ...(usageRecorded ? { usage_recorded: true } : {}),
  };
}

/**
 * Applies a usage block to the task's most recent attempt, merging over what
 * is already there, syncing the latest handoff and recomputing the card's
 * telemetry-incomplete flag.
 */
async function applyUsageToLatestAttempt(
  db: McpDatabase,
  row: TaskRow,
  usage: Usage,
): Promise<Result<TaskRow>> {
  const [attempt] = await db
    .select()
    .from(executionAttempt)
    .where(eq(executionAttempt.taskId, row.id))
    .orderBy(desc(executionAttempt.startedAt))
    .limit(1);
  if (!attempt) {
    return err(
      "INVALID_ARGUMENT",
      "No execution attempt to receive usage. Call task_claim before reporting usage.",
    );
  }

  const merged: Usage = {
    tokens_in: usage.tokens_in ?? attempt.tokensIn ?? undefined,
    tokens_out: usage.tokens_out ?? attempt.tokensOut ?? undefined,
    tokens_cache: usage.tokens_cache ?? attempt.tokensCache ?? undefined,
    cost_usd:
      usage.cost_usd ??
      (attempt.costUsd != null ? Number(attempt.costUsd) : undefined),
    duration_ms: usage.duration_ms ?? attempt.durationMs ?? undefined,
    turns: usage.turns ?? attempt.turns ?? undefined,
    estimated: usage.estimated ?? false,
  };

  await db
    .update(executionAttempt)
    .set({
      tokensIn: merged.tokens_in,
      tokensOut: merged.tokens_out,
      tokensCache: merged.tokens_cache,
      costUsd: merged.cost_usd !== undefined ? String(merged.cost_usd) : null,
      durationMs: merged.duration_ms,
      turns: merged.turns,
      usageEstimated: merged.estimated ?? false,
    })
    .where(eq(executionAttempt.id, attempt.id));

  const [latestHandoff] = await db
    .select()
    .from(handoff)
    .where(eq(handoff.taskId, row.id))
    .orderBy(desc(handoff.createdAt))
    .limit(1);
  if (latestHandoff) {
    await db
      .update(handoff)
      .set({ usage: merged })
      .where(eq(handoff.id, latestHandoff.id));
  }

  const [updated] = await db
    .update(task)
    .set({ telemetryIncomplete: isTelemetryIncomplete(merged) })
    .where(eq(task.id, row.id))
    .returning();
  return ok(updated ?? row);
}

/**
 * Resolves a caller-provided harness against the workspace's enabled
 * executors: the model must exist on one of them, and when a CLI is named it
 * must be that CLI. Returns the harness with the CLI filled from the match.
 */
async function resolveHarnessAgainstExecutors(
  db: McpDatabase,
  workspaceId: string,
  input: Harness,
): Promise<Result<{ cli: string | null; model: string; effort: Harness["effort"] }>> {
  const [ws] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  if (!ws) {
    return err(
      "NOT_FOUND",
      "The workspace for this token no longer exists. Generate a new token in the board Settings.",
    );
  }
  const executors = executorsFromWorkspace(ws.executors);
  const needleModel = input.model.trim().toLowerCase();
  const needleCli = input.cli?.trim().toLowerCase();

  const candidates = needleCli
    ? executors.filter(
        (item) =>
          item.id.trim().toLowerCase() === needleCli ||
          item.cli.trim().toLowerCase() === needleCli,
      )
    : executors;
  if (needleCli && candidates.length === 0) {
    return err(
      "INVALID_ARGUMENT",
      `CLI '${input.cli}' is not among the configured executors. Call harness_list to see them.`,
    );
  }
  const matched = candidates.find((item) =>
    item.models.some((model) => model.trim().toLowerCase() === needleModel),
  );
  if (!matched) {
    return err(
      "INVALID_ARGUMENT",
      needleCli
        ? `Model '${input.model}' is not configured on executor '${input.cli}'. Call harness_list to see the available models.`
        : `Model '${input.model}' is not among the configured executors. Call harness_list to see the available models.`,
    );
  }
  return ok({
    cli: input.cli ?? matched.cli,
    model: input.model,
    effort: input.effort,
  });
}

async function taskDeliver(
  db: McpDatabase,
  ctx: AuthContext,
  input: {
    task_id: string;
    summary: string;
    how_to_verify?: string;
    evidence: Array<{ text?: string; url?: string }>;
    artifacts: unknown[];
    branch?: string;
    pull_request_url?: string;
    usage?: Usage;
  },
) {
  const persisted = await db.transaction(async (tx) => {
    const found = await findTask(tx, ctx.workspaceId, input.task_id, true);
    if (!found) {
      return err(
      "NOT_FOUND",
      `Task ${input.task_id} not found in this workspace. Call task_list to see the available cards.`,
    );
    }

    const transition = applyTransition(
      {
        status: found.row.status,
        revisado: found.row.revisado,
        reopen_comment: await latestReopenComment(tx, found.row),
      },
      { type: "handoff" },
    );
    if (!transition.ok) return transition;

    const incomplete = isTelemetryIncomplete(input.usage);
    const [openAttempt] = await tx
      .select()
      .from(executionAttempt)
      .where(
        and(
          eq(executionAttempt.taskId, found.row.id),
          isNull(executionAttempt.finishedAt),
        ),
      )
      .orderBy(desc(executionAttempt.startedAt))
      .limit(1);

    if (openAttempt) {
      const finishedAt = new Date();
      await tx
        .update(executionAttempt)
        .set({
          finishedAt,
          result: "success",
          tokensIn: input.usage?.tokens_in,
          tokensOut: input.usage?.tokens_out,
          tokensCache: input.usage?.tokens_cache,
          costUsd:
            input.usage?.cost_usd !== undefined
              ? String(input.usage.cost_usd)
              : null,
          durationMs: input.usage?.duration_ms,
          // Telemetry that does not depend on agent goodwill: the server
          // measures claim → deliver itself, whatever the agent reports.
          serverDurationMs: Math.max(
            0,
            finishedAt.getTime() - openAttempt.startedAt.getTime(),
          ),
          turns: input.usage?.turns,
          usageEstimated: input.usage?.estimated ?? false,
        })
        .where(eq(executionAttempt.id, openAttempt.id));
    }

    const [saved] = await tx
      .insert(handoff)
      .values({
        taskId: found.row.id,
        attemptId: openAttempt?.id ?? null,
        summary: input.summary,
        howToVerify: input.how_to_verify ?? null,
        evidences: input.evidence as never,
        artifacts: input.artifacts as never,
        branch: input.branch ?? found.row.branch,
        prUrl: input.pull_request_url ?? found.row.prUrl,
        usage: input.usage ?? null,
      })
      .returning();
    if (!saved) throw new Error("failed to insert handoff");

    const [updated] = await tx
      .update(task)
      .set({
        status: transition.value.status,
        revisado: transition.value.revisado,
        branch: input.branch ?? found.row.branch,
        prUrl: input.pull_request_url ?? found.row.prUrl,
        telemetryIncomplete: incomplete,
        // A fresh delivery restarts lay validation from zero.
        validationTicks: [],
      })
      .where(eq(task.id, found.row.id))
      .returning();
    if (!updated) throw new Error("failed to update task on handoff");

    return ok({
      updated,
      proj: found.proj,
      saved,
      incomplete,
      routedTo: reviewerFromRow(updated),
      attemptExecutor: openAttempt
        ? decodeExecutor(openAttempt.executor, openAttempt.model)
        : null,
    });
  });

  if (!persisted.ok) return persisted;

  if (persisted.value.attemptExecutor) {
    await recordSeenExecutor(db, ctx.workspaceId, persisted.value.attemptExecutor);
  }

  return {
    task: mapTask(persisted.value.updated, persisted.value.proj),
    handoff: {
      id: persisted.value.saved.id,
      task_id: persisted.value.saved.taskId,
      attempt_id: persisted.value.saved.attemptId ?? undefined,
      summary: persisted.value.saved.summary,
      how_to_verify: persisted.value.saved.howToVerify,
      evidence: input.evidence,
      artifacts: input.artifacts,
      branch: persisted.value.saved.branch,
      pull_request_url:
        persisted.value.saved.prUrl && /^https?:\/\//.test(persisted.value.saved.prUrl)
          ? persisted.value.saved.prUrl
          : null,
      usage: input.usage ?? null,
      telemetry_incomplete: persisted.value.incomplete,
      created_at: iso(persisted.value.saved.createdAt),
    },
    telemetry_incomplete: persisted.value.incomplete,
    ...(input.usage
      ? {}
      : {
          usage_warning:
            "card will show usage not reported — send usage via task_update at any time",
        }),
    routed_to: persisted.value.routedTo,
  };
}

async function taskDelete(
  db: McpDatabase,
  ctx: AuthContext,
  input: { task_id: string },
) {
  return db.transaction(async (tx) => {
    const found = await findTask(tx, ctx.workspaceId, input.task_id, true);
    if (!found) {
      return err(
      "NOT_FOUND",
      `Task ${input.task_id} not found in this workspace. Call task_list to see the available cards.`,
    );
    }

    const children = await tx
      .select({ id: task.id })
      .from(task)
      .where(eq(task.parentId, found.row.id));
    const ids = [found.row.id, ...children.map((child) => child.id)];

    const [attempts] = await tx
      .select({ n: count() })
      .from(executionAttempt)
      .where(inArray(executionAttempt.taskId, ids));
    const [handoffs] = await tx
      .select({ n: count() })
      .from(handoff)
      .where(inArray(handoff.taskId, ids));

    // Hard delete by owner decision: attempts, handoffs, comments and subtasks
    // go with the card via FK cascade. No archive, no undo.
    await tx.delete(task).where(eq(task.id, found.row.id));

    return {
      deleted: true as const,
      task_id: found.row.id,
      short_id: found.row.shortId,
      attempts_deleted: Number(attempts?.n ?? 0),
      handoffs_deleted: Number(handoffs?.n ?? 0),
    };
  });
}

async function branchRegister(
  db: McpDatabase,
  ctx: AuthContext,
  input: { task_id: string; branch: string },
) {
  const found = await findTask(db, ctx.workspaceId, input.task_id);
  if (!found) {
    return err(
      "NOT_FOUND",
      `Task ${input.task_id} not found in this workspace. Call task_list to see the available cards.`,
    );
  }
  const [updated] = await db
    .update(task)
    .set({ branch: input.branch })
    .where(eq(task.id, found.row.id))
    .returning();
  return {
    task: mapTask(updated ?? found.row, found.proj, {
      reopenComment: await latestReopenComment(db, found.row),
    }),
  };
}

async function harnessRecommend(
  db: McpDatabase,
  ctx: AuthContext,
  input: { type: CardapioTaskType },
) {
  const rec = await recommendFor(db, ctx.workspaceId, input.type);
  if (!rec.ok) return rec;
  return rec.value;
}

async function harnessList(db: McpDatabase, ctx: AuthContext) {
  const [ws] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.id, ctx.workspaceId))
    .limit(1);
  if (!ws) {
    return err(
      "NOT_FOUND",
      "The workspace for this token no longer exists. Generate a new token in the board Settings.",
    );
  }
  const policy = await loadPolicy(db, ctx.workspaceId);
  return {
    policy: policy.length > 0 ? policy : factoryCardapioPolicy(),
    executors: ws.executors,
  };
}

/**
 * Writes one line of the harness policy. Gated on the token's manage flag:
 * the point of the flag is that a worker token cannot promote itself to a
 * better model between two claims.
 */
async function harnessSet(
  db: McpDatabase,
  ctx: AuthContext,
  input: {
    type: CardapioTaskType;
    cli?: string | null;
    model: string;
    effort: EffortLevel;
  },
) {
  const denied = requireManage(ctx, "harness_set");
  if (denied) return denied;

  const resolved = await resolveHarnessAgainstExecutors(db, ctx.workspaceId, {
    ...(input.cli ? { cli: input.cli } : {}),
    model: input.model,
    effort: input.effort,
  });
  if (!resolved.ok) return resolved;

  // A null cli stays null: "no preference" is a real policy choice, and the
  // executor match above already proved the model is available somewhere.
  const cli = input.cli?.trim() || null;
  const updatedAt = new Date();

  const [row] = await db
    .insert(cardapioEntry)
    .values({
      workspaceId: ctx.workspaceId,
      activityType: input.type,
      cli,
      model: input.model,
      effort: input.effort,
      updatedBy: ctx.tokenLabel,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [cardapioEntry.workspaceId, cardapioEntry.activityType],
      set: {
        cli,
        model: input.model,
        effort: input.effort,
        updatedBy: ctx.tokenLabel,
        updatedAt,
      },
    })
    .returning();
  if (!row) throw new Error("failed to write cardapio entry");

  return { policy: policyEntryFromRow(row) };
}

/**
 * The aggregate questions the Insights page answers, over MCP. Deliberately
 * the same two loaders and the same pure aggregation the page calls, so an
 * agent and a human reading the screen can never disagree about a number.
 */
async function insightsQuery(
  db: McpDatabase,
  ctx: AuthContext,
  input: {
    group_by?: "project" | "mission" | "model" | "card";
    since?: string;
    until?: string;
  },
) {
  const since = input.since ? new Date(input.since) : undefined;
  const until = input.until ? new Date(input.until) : undefined;
  if (since && until && since.getTime() > until.getTime()) {
    return err(
      "INVALID_ARGUMENT",
      "The period is inverted: since is later than until.",
    );
  }

  const [attemptRows, reopenRows] = await Promise.all([
    loadInsightAttemptRows(db as InsightsDb, ctx.workspaceId),
    loadReopenRows(db as InsightsDb, ctx.workspaceId),
  ]);
  const insights = computeInsights(
    filterAttemptsByPeriod(attemptRows, { since, until }),
    reopenRows,
  );

  const totals = {
    cost_usd: insights.totals.costUsd,
    tokens: insights.totals.tokens,
    duration_ms: insights.totals.durationMs,
    attempts: insights.totals.attempts,
    estimated: insights.totals.estimated,
    missing: insights.totals.missing,
  };

  const groupsFor = (rows: typeof insights.byProject) =>
    rows.map((row) => ({
      key: row.key,
      label: row.label,
      cost_usd: row.costUsd,
      tokens: row.tokens,
      duration_ms: row.durationMs,
      attempts: row.attempts,
      estimated: row.estimated,
      missing: row.missing,
    }));

  let grouped: Record<string, unknown> = {};
  if (input.group_by === "project") grouped = { groups: groupsFor(insights.byProject) };
  if (input.group_by === "mission") grouped = { groups: groupsFor(insights.byMission) };
  if (input.group_by === "model") grouped = { groups: groupsFor(insights.byModel) };
  if (input.group_by === "card") {
    grouped = {
      cards: insights.perCard.map((card) => ({
        task_id: card.taskId,
        short_id: card.shortId,
        title: card.title,
        project: card.projectName,
        mission: card.missionTitle,
        models: card.models,
        // Kept nullable on purpose: no reported cost is not a cost of zero.
        cost_usd: card.costUsd,
        tokens: card.tokens,
        duration_ms: card.durationMs,
        attempts: card.attempts,
        estimated: card.estimated,
        missing: card.missing,
      })),
    };
  }

  return {
    period: {
      since: since ? iso(since) : null,
      until: until ? iso(until) : null,
    },
    totals,
    note: usageHonestyNote(insights.totals),
    ...grouped,
    reopened_by_model: insights.reopensByModel.map((row) => ({
      model: row.model,
      deliveries: row.deliveries,
      reopened: row.reopened,
      rate: row.rate,
    })),
  };
}

/**
 * Adds or removes CLIs and models in the workspace executor config, writing
 * the same shape the Settings grid saves so both screens read one source.
 * Behind the manage flag: executors decide what a card is allowed to run on.
 */
async function executorsUpdate(
  db: McpDatabase,
  ctx: AuthContext,
  input: {
    cli: string;
    label?: string;
    enabled?: boolean;
    add_models?: string[];
    remove_models?: string[];
    remove?: boolean;
  },
) {
  const denied = requireManage(ctx, "executors_update");
  if (denied) return denied;

  const [ws] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.id, ctx.workspaceId))
    .limit(1);
  if (!ws) {
    return err(
      "NOT_FOUND",
      "The workspace for this token no longer exists. Generate a new token in the board Settings.",
    );
  }

  const applied = applyExecutorUpdate(ws.executors, input);
  if (applied.removed && applied.config.length === ws.executors.length) {
    return err(
      "NOT_FOUND",
      `Executor '${input.cli}' is not in this workspace config. Call harness_list to see the configured executors.`,
    );
  }

  // A removal can orphan a policy line, exactly as it can from Settings. The
  // write stands; the agent gets told what harness_set has to fix. Only what
  // THIS call broke is reported: a board whose policy was already pointing at
  // models it does not have would otherwise warn on every unrelated edit.
  const policy = await loadPolicy(db, ctx.workspaceId);
  const before = new Set(orphanedPolicyTypes(policy, ws.executors));
  const warnings = orphanedPolicyTypes(policy, applied.config)
    .filter((type) => !before.has(type))
    .map((type) => {
      const line = policy.find((row) => row.type === type);
      return `policy line '${type}' points at ${[line?.cli, line?.model]
        .filter(Boolean)
        .join(" · ")}, which is no longer configured. Fix it with harness_set.`;
    });

  await db
    .update(workspace)
    .set({ executors: applied.config as ExecutorConfig[] })
    .where(eq(workspace.id, ctx.workspaceId));

  return {
    executors: applied.config,
    updated: applied.targetId,
    removed: applied.removed,
    ...(warnings.length > 0 ? { policy_warnings: warnings } : {}),
  };
}

/** Activity types whose policy model no longer exists on an enabled executor. */
function orphanedPolicyTypes(
  policy: CardapioPolicyEntry[],
  config: readonly { id: string; enabled: boolean; models: string[] }[],
): string[] {
  const orphaned: string[] = [];
  for (const line of policy) {
    const model = line.model?.trim();
    if (!model) continue;
    // With a cli the pair has to exist on it; without one, any enabled
    // executor offering the model is enough. Same rule recommendHarness uses.
    const available = line.cli
      ? isPairInConfig(config, line.cli, model)
      : config.some(
          (row) =>
            row.enabled &&
            row.models.some((m) => m.trim().toLowerCase() === model.toLowerCase()),
        );
    if (!available) orphaned.push(line.type);
  }
  return orphaned;
}

function requireManage(
  ctx: AuthContext,
  tool: string,
): Result<never> | null {
  if (ctx.canManage) return null;
  return err(
    "PERMISSION_DENIED",
    `This token cannot change the workspace configuration, so ${tool} is refused. Ask the owner to tick "can manage the workspace" for it in Settings › MCP tokens, or use a token that already has it.`,
  );
}

function policyEntryFromRow(
  row: typeof cardapioEntry.$inferSelect,
): CardapioPolicyEntry & { updated_by: string | null; updated_at: string } {
  return {
    type: row.activityType,
    cli: row.cli,
    model: row.model,
    effort: row.effort as EffortLevel,
    updated_by: row.updatedBy,
    updated_at: iso(row.updatedAt),
  };
}

async function loadPolicy(
  db: McpDatabase,
  workspaceId: string,
): Promise<CardapioPolicyEntry[]> {
  const rows = await db
    .select()
    .from(cardapioEntry)
    .where(eq(cardapioEntry.workspaceId, workspaceId));
  return rows.map((row) => policyEntryFromRow(row));
}

async function recommendFor(
  db: McpDatabase,
  workspaceId: string,
  type: CardapioTaskType,
  explicit?: Harness,
) {
  const [ws] = await db
    .select()
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1);
  if (!ws) {
    return err(
      "NOT_FOUND",
      "The workspace for this token no longer exists. Generate a new token in the board Settings.",
    );
  }
  const policy = await loadPolicy(db, workspaceId);
  return recommendHarness({
    type,
    executors: executorsFromWorkspace(ws.executors),
    policy,
    ...(explicit
      ? {
          explicit: {
            model: explicit.model,
            effort: explicit.effort,
            ...(explicit.cli ? { cli: explicit.cli } : {}),
          },
        }
      : {}),
  });
}

async function assembleTaskPayload(
  db: McpDatabase,
  row: TaskRow,
  proj: ProjectRow,
  reopenComment?: string | null,
) {
  const comment =
    reopenComment !== undefined
      ? reopenComment
      : await latestReopenComment(db, row);
  const mapped = mapTask(row, proj, { reopenComment: comment });
  let missionPayload = null;
  if (row.missionId) {
    const miss = await findMission(db, proj.workspaceId, row.missionId);
    if (miss) missionPayload = mapMission(miss);
  }
  const convention = branchConvention(mapped.short_id, mapped.title);
  return {
    task: mapped,
    briefing_markdown: renderBriefingMarkdown({
      task: mapped,
      mission: missionPayload,
      branchConvention: convention,
    }),
    mission: missionPayload,
    branch_convention: convention,
  };
}

/**
 * Resolves a project by uuid or by its card prefix (AGB), case-insensitively
 * and only inside the token's workspace. A non-uuid ref never reaches the
 * driver as a uuid: the cast error would surface as a raw "Failed query".
 */
async function findProject(
  db: Tx,
  workspaceId: string,
  projectRef: string,
): Promise<ProjectRow | null> {
  const ref = projectRef.trim();
  if (!ref) return null;
  const identity = looksLikeUuid(ref)
    ? eq(project.id, ref)
    : sql`upper(${project.idPrefix}) = ${ref.toUpperCase()}`;

  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.workspaceId, workspaceId), identity))
    .limit(1);
  return row ?? null;
}

async function findMission(
  db: Tx,
  workspaceId: string,
  missionRef: string,
) {
  // task_create.mission and mission_get take an existing mission id.
  // A missing or unknown id is a clean NOT_FOUND — we never match by title
  // and never invent a mission on the fly.
  if (!looksLikeUuid(missionRef)) {
    return null;
  }
  const [row] = await db
    .select()
    .from(mission)
    .where(and(eq(mission.workspaceId, workspaceId), eq(mission.id, missionRef)))
    .limit(1);
  return row ?? null;
}

async function findTask(
  db: Tx,
  workspaceId: string,
  taskRef: string,
  lock = false,
): Promise<{ row: TaskRow; proj: ProjectRow } | null> {
  const ref = taskRef.trim();
  // Uuid or short id (AGB-5, OVK-5.4). Short ids are matched
  // case-insensitively and only inside the token's workspace.
  const identity = looksLikeUuid(ref)
    ? eq(task.id, ref)
    : sql`upper(${task.shortId}) = ${normalizeShortId(ref)}`;

  const query = db
    .select({ task, project })
    .from(task)
    .innerJoin(project, eq(task.projectId, project.id))
    .where(and(eq(project.workspaceId, workspaceId), identity))
    .limit(1);

  const rows = lock
    ? await query.for("update")
    : await query;
  const found = rows[0];
  return found ? { row: found.task, proj: found.project } : null;
}

async function allocateShortId(tx: Tx, proj: ProjectRow): Promise<string> {
  const [locked] = await tx
    .select()
    .from(project)
    .where(eq(project.id, proj.id))
    .for("update");
  const current = locked ?? proj;
  const allocated = nextShortId(current.idPrefix, current.nextNumber);
  await tx
    .update(project)
    .set({ nextNumber: allocated.nextNumber })
    .where(eq(project.id, proj.id));
  return allocated.shortId;
}

async function nextChildShortId(tx: Tx, parent: TaskRow): Promise<string> {
  const [counted] = await tx
    .select({ n: count() })
    .from(task)
    .where(eq(task.parentId, parent.id));
  return `${parent.shortId}.${Number(counted?.n ?? 0) + 1}`;
}

async function latestReopenComment(
  db: Tx,
  row: TaskRow,
): Promise<string | null> {
  if (row.status !== "aberto") return null;
  // Only prose comments qualify: typed timeline entries (executor_swap,
  // spawn_failure) are traces, not reopen instructions for the next claim.
  const [comment] = await db
    .select()
    .from(taskComment)
    .where(and(eq(taskComment.taskId, row.id), eq(taskComment.kind, "comment")))
    .orderBy(desc(taskComment.createdAt))
    .limit(1);
  return comment?.body ?? null;
}
