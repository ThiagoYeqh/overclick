"use server";

import { nextShortId, project, task } from "@agent-board/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "../lib/action-result";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import { parseBoardTaskInput } from "../lib/board-task-input";
import type { McpDatabase } from "../mcp/types";

export async function createBoardTask({
  database,
  workspaceId,
  userId,
  input,
}: {
  database: McpDatabase;
  workspaceId: string;
  userId: string | null;
  input: unknown;
}): Promise<ActionResult> {
  const parsed = parseBoardTaskInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const projectFilters = [eq(project.workspaceId, workspaceId)];
  if (parsed.value.projectId) {
    projectFilters.push(eq(project.id, parsed.value.projectId));
  }
  const [proj] = await database
    .select()
    .from(project)
    .where(and(...projectFilters))
    .limit(1);
  if (!proj) return { ok: false, error: "Project not found." };

  await database.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(project)
      .where(and(eq(project.id, proj.id), eq(project.workspaceId, workspaceId)))
      .for("update");
    const current = locked ?? proj;
    const allocated = nextShortId(current.idPrefix, current.nextNumber);

    await tx.insert(task).values({
      projectId: current.id,
      shortId: allocated.shortId,
      title: parsed.value.title,
      oQue: parsed.value.oQue,
      porQue: parsed.value.porQue,
      comoConfirmo: JSON.stringify(parsed.value.comoConfirmo),
      tipo: parsed.value.type,
      status: "aberto",
      priority: parsed.value.priority,
      devolveParaKind: "workspace_queue",
      devolveParaUserId: null,
      devolveParaAgentRef: null,
      origin: { cli: "board" },
      mode: "solo",
      createdByUserId: userId,
    });

    await tx
      .update(project)
      .set({ nextNumber: allocated.nextNumber })
      .where(eq(project.id, current.id));
  });

  return { ok: true };
}

export async function createBoardTaskAction(input: unknown): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace not found." };

  const result = await createBoardTask({
    database: db(),
    workspaceId: ws.id,
    userId: session.userId,
    input,
  });
  if (!result.ok) return result;

  revalidatePath("/home");
  return { ok: true };
}
