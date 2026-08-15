"use server";

import { canTransition, task } from "@agent-board/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import type { ActionResult } from "../lib/action-result";
import { reopenTask } from "./review-core";

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

  const result = await reopenTask({
    database: db(),
    taskId,
    comment,
    userId: session.userId,
  });
  if (result.ok) revalidatePath("/home");
  return result;
}
