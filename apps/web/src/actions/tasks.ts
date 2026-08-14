"use server";

import { nextShortId, project, task } from "@agent-board/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "../lib/action-result";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import { parseBoardTaskInput } from "../lib/board-task-input";

export async function createBoardTaskAction(input: unknown): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const parsed = parseBoardTaskInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace not found." };

  const proj = await db().query.project.findFirst({
    where: eq(project.workspaceId, ws.id),
  });
  if (!proj) return { ok: false, error: "Project not found." };

  await db().transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(project)
      .where(eq(project.id, proj.id))
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
      createdByUserId: session.userId,
    });

    await tx
      .update(project)
      .set({ nextNumber: allocated.nextNumber })
      .where(eq(project.id, current.id));
  });

  revalidatePath("/home");
  return { ok: true };
}
