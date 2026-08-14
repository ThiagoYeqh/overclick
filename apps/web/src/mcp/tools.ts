import {
  canNestUnder,
  cardapioEntry,
  executionAttempt,
  factoryCardapioPolicy,
  handoff,
  mission,
  nextShortId,
  project,
  task,
  taskComment,
  workspace,
} from "@agent-board/db";
import {
  applyTransition,
  branchConvention,
  err,
  evaluateClaim,
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
import { and, asc, count, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { renderBriefingMarkdown } from "./briefing";
import {
  decodeExecutor,
  encodeExecutor,
  executorsFromWorkspace,
  harnessToDb,
  iso,
  looksLikeUuid,
  mapMission,
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
      parsed.error.issues[0]?.message ?? "argumentos inválidos",
      parsed.error.flatten(),
    );
  }

  let value: unknown;
  switch (name) {
    case "mission_list":
      value = await missionList(db, ctx, parsed.data as Parameters<typeof missionList>[2]);
      break;
    case "mission_get":
      value = await missionGet(db, ctx, parsed.data as Parameters<typeof missionGet>[2]);
      break;
    case "task_list":
      value = await taskList(db, ctx, parsed.data as Parameters<typeof taskList>[2]);
      break;
    case "task_get":
      value = await taskGet(db, ctx, parsed.data as Parameters<typeof taskGet>[2]);
      break;
    case "task_create":
      value = await taskCreate(db, ctx, parsed.data as Parameters<typeof taskCreate>[2]);
      break;
    case "task_claim":
      value = await taskClaim(db, ctx, parsed.data as Parameters<typeof taskClaim>[2]);
      break;
    case "task_update":
      value = await taskUpdate(db, ctx, parsed.data as Parameters<typeof taskUpdate>[2]);
      break;
    case "handoff_submit":
      value = await handoffSubmit(db, ctx, parsed.data as Parameters<typeof handoffSubmit>[2]);
      break;
    case "branch_register":
      value = await branchRegister(db, ctx, parsed.data as Parameters<typeof branchRegister>[2]);
      break;
    case "harness_recommend":
      value = await harnessRecommend(
        db,
        ctx,
        parsed.data as Parameters<typeof harnessRecommend>[2],
      );
      break;
    case "harness_list":
      value = await harnessList(db, ctx);
      break;
    default: {
      const _never: never = name;
      return err("INVALID_ARGUMENT", `tool desconhecida: ${String(_never)}`);
    }
  }

  if (value && typeof value === "object" && "ok" in value && (value as Result<unknown>).ok === false) {
    return value as Result<unknown>;
  }

  const output = contract.output.safeParse(value);
  if (!output.success) {
    return err(
      "INVALID_ARGUMENT",
      `resposta inválida de ${name}: ${output.error.issues[0]?.message ?? "schema"}`,
      output.error.flatten(),
    );
  }
  return ok(output.data);
}

export function isMcpToolName(name: string): name is McpToolName {
  return (MCP_TOOL_NAMES as readonly string[]).includes(name);
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
    return err("NOT_FOUND", `Missão ${input.mission_id} não encontrada.`);
  }
  const [counted] = await db
    .select({ n: count() })
    .from(task)
    .where(eq(task.missionId, row.id));
  return { mission: mapMission(row, Number(counted?.n ?? 0)) };
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
  if (input.project_id) filters.push(eq(task.projectId, input.project_id));
  if (input.mission_id) filters.push(eq(task.missionId, input.mission_id));
  if (input.priority) filters.push(eq(task.priority, input.priority));
  if (input.type) filters.push(eq(task.tipo, input.type));

  if (input.awaiting_review_by !== undefined) {
    filters.push(eq(task.status, "feito"));
    if (input.awaiting_review_by === "me") {
      filters.push(eq(task.devolveParaKind, "agent"));
    } else {
      filters.push(
        or(
          eq(task.devolveParaUserId, input.awaiting_review_by),
          eq(task.devolveParaAgentRef, input.awaiting_review_by),
        )!,
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
    return err("NOT_FOUND", `Task ${input.task_id} não encontrada.`);
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
  const [proj] = await db
    .select()
    .from(project)
    .where(
      and(eq(project.id, input.project_id), eq(project.workspaceId, ctx.workspaceId)),
    )
    .limit(1);
  if (!proj) {
    return err("NOT_FOUND", `Projeto ${input.project_id} não encontrado neste workspace.`);
  }

  let missionId: string | null = null;
  if (input.mission) {
    const miss = await findMission(db, ctx.workspaceId, input.mission);
    if (!miss) {
      return err("NOT_FOUND", `Missão ${input.mission} não encontrada.`);
    }
    missionId = miss.id;
  }

  let parentRow: TaskRow | null = null;
  if (input.parent) {
    const parent = await findTask(db, ctx.workspaceId, input.parent);
    if (!parent) {
      return err("NOT_FOUND", `Task pai ${input.parent} não encontrada.`);
    }
    if (!canNestUnder({ parentId: parent.row.parentId })) {
      return err("INVALID_ARGUMENT", "Sub-tasks só têm 1 nível — o pai já é filho.");
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
      return err("NOT_FOUND", `Task ${input.task_id} não encontrada.`);
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
        "Claim perdeu o compare-and-swap: o status já não é o esperado.",
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
          warning: `Harness diverge: o card recomenda ${recommended.model} · ${recommended.effort}, o executor veio com ${actual.model}.`,
        }
      : undefined;

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

async function taskUpdate(
  db: McpDatabase,
  ctx: AuthContext,
  input: {
    task_id: string;
    comment?: string;
    progress?: string;
    revisado?: boolean;
  },
) {
  const found = await findTask(db, ctx.workspaceId, input.task_id);
  if (!found) {
    return err("NOT_FOUND", `Task ${input.task_id} não encontrada.`);
  }

  let nextRow = found.row;
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

  const bodies = [input.comment, input.progress ? `progresso: ${input.progress}` : null]
    .filter((value): value is string => Boolean(value));
  for (const body of bodies) {
    await db.insert(taskComment).values({
      taskId: nextRow.id,
      authorAgentRef: ctx.tokenLabel,
      body,
    });
  }

  return {
    task: mapTask(nextRow, found.proj, {
      reopenComment: await latestReopenComment(db, nextRow),
    }),
  };
}

async function handoffSubmit(
  db: McpDatabase,
  ctx: AuthContext,
  input: {
    task_id: string;
    summary: string;
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
      return err("NOT_FOUND", `Task ${input.task_id} não encontrada.`);
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
      await tx
        .update(executionAttempt)
        .set({
          finishedAt: new Date(),
          result: "success",
          tokensIn: input.usage?.tokens_in,
          tokensOut: input.usage?.tokens_out,
          tokensCache: input.usage?.tokens_cache,
          costUsd:
            input.usage?.cost_usd !== undefined
              ? String(input.usage.cost_usd)
              : null,
          durationMs: input.usage?.duration_ms,
          turns: input.usage?.turns,
        })
        .where(eq(executionAttempt.id, openAttempt.id));
    }

    const [saved] = await tx
      .insert(handoff)
      .values({
        taskId: found.row.id,
        attemptId: openAttempt?.id ?? null,
        summary: input.summary,
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
    });
  });

  if (!persisted.ok) return persisted;

  return {
    task: mapTask(persisted.value.updated, persisted.value.proj),
    handoff: {
      id: persisted.value.saved.id,
      task_id: persisted.value.saved.taskId,
      attempt_id: persisted.value.saved.attemptId ?? undefined,
      summary: persisted.value.saved.summary,
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
    routed_to: persisted.value.routedTo,
  };
}

async function branchRegister(
  db: McpDatabase,
  ctx: AuthContext,
  input: { task_id: string; branch: string },
) {
  const found = await findTask(db, ctx.workspaceId, input.task_id);
  if (!found) {
    return err("NOT_FOUND", `Task ${input.task_id} não encontrada.`);
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
    return err("NOT_FOUND", "Workspace do token não encontrado.");
  }
  const policy = await loadPolicy(db, ctx.workspaceId);
  return {
    policy: policy.length > 0 ? policy : factoryCardapioPolicy(),
    executors: ws.executors,
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
  return rows.map((row) => ({
    type: row.activityType,
    cli: row.cli,
    model: row.model,
    effort: row.effort as EffortLevel,
  }));
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
    return err("NOT_FOUND", "Workspace do token não encontrado.");
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

async function findMission(
  db: Tx,
  workspaceId: string,
  missionRef: string,
) {
  const filters = [eq(mission.workspaceId, workspaceId)];
  if (looksLikeUuid(missionRef)) {
    filters.push(eq(mission.id, missionRef));
  } else {
    filters.push(eq(mission.title, missionRef));
  }
  const [row] = await db
    .select()
    .from(mission)
    .where(and(...filters))
    .limit(1);
  return row ?? null;
}

async function findTask(
  db: Tx,
  workspaceId: string,
  taskRef: string,
  lock = false,
): Promise<{ row: TaskRow; proj: ProjectRow } | null> {
  const identity = looksLikeUuid(taskRef)
    ? eq(task.id, taskRef)
    : or(eq(task.shortId, taskRef), eq(task.shortId, taskRef.toUpperCase()));

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
  const [comment] = await db
    .select()
    .from(taskComment)
    .where(eq(taskComment.taskId, row.id))
    .orderBy(desc(taskComment.createdAt))
    .limit(1);
  return comment?.body ?? null;
}
