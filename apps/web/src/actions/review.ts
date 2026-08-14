"use server";

import { canTransition, task, taskComment } from "@agent-board/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import type { ActionResult } from "../lib/action-result";

/** feito → validado (só humano logado). */
export async function validateTaskAction(taskId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada. Entre de novo." };

  const row = await db().query.task.findFirst({ where: eq(task.id, taskId) });
  if (!row) return { ok: false, error: "Card não encontrado." };
  if (!canTransition(row.status, "validado", "human")) {
    return { ok: false, error: "Só dá para validar um card que está em feito." };
  }

  await db()
    .update(task)
    .set({ status: "validado", revisado: true })
    .where(eq(task.id, taskId));
  revalidatePath("/home");
  return { ok: true };
}

/** feito → aberto, gravando o comentário que o agente lê no próximo claim. */
export async function reopenTaskAction(
  taskId: string,
  comment: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada. Entre de novo." };

  const body = comment.trim();
  if (!body) {
    return { ok: false, error: "Descreve o que ficou faltando — o agente lê isso no próximo claim." };
  }

  const row = await db().query.task.findFirst({ where: eq(task.id, taskId) });
  if (!row) return { ok: false, error: "Card não encontrado." };
  if (!canTransition(row.status, "aberto", "human", { hasComment: true })) {
    return { ok: false, error: "Só dá para reabrir um card que está em feito." };
  }

  await db().insert(taskComment).values({
    taskId,
    authorUserId: session.userId,
    body,
  });
  await db().update(task).set({ status: "aberto" }).where(eq(task.id, taskId));
  revalidatePath("/home");
  return { ok: true };
}
