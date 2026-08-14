"use server";

import { canTransition, task, taskComment } from "@agent-board/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import type { ActionResult } from "../lib/action-result";

/** feito → validado (signed-in human only). */
export async function validateTaskAction(taskId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const row = await db().query.task.findFirst({ where: eq(task.id, taskId) });
  if (!row) return { ok: false, error: "Card not found." };
  if (!canTransition(row.status, "validado", "human")) {
    return { ok: false, error: "You can only validate a card that is in done." };
  }

  await db()
    .update(task)
    .set({ status: "validado", revisado: true })
    .where(eq(task.id, taskId));
  revalidatePath("/home");
  return { ok: true };
}

/** feito → aberto, recording the comment the agent reads on its next claim. */
export async function reopenTaskAction(
  taskId: string,
  comment: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const body = comment.trim();
  if (!body) {
    return { ok: false, error: "Describe what's missing. The agent reads it on its next claim." };
  }

  const row = await db().query.task.findFirst({ where: eq(task.id, taskId) });
  if (!row) return { ok: false, error: "Card not found." };
  if (!canTransition(row.status, "aberto", "human", { hasComment: true })) {
    return { ok: false, error: "You can only reopen a card that is in done." };
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
