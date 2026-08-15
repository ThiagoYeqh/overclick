import { canTransition, task, taskComment, type Database } from "@agent-board/db";
import { eq } from "drizzle-orm";
import type { ActionResult } from "../lib/action-result";

type ReviewDatabase = Pick<Database, "select" | "insert" | "update">;

export async function reopenTask({
  database,
  taskId,
  comment,
  userId,
}: {
  database: ReviewDatabase;
  taskId: string;
  comment: string;
  userId: string | null;
}): Promise<ActionResult> {
  const body = comment.trim();
  if (!body) {
    return { ok: false, error: "Describe what's missing. The agent reads it on its next claim." };
  }

  const [row] = await database.select().from(task).where(eq(task.id, taskId)).limit(1);
  if (!row) return { ok: false, error: "Card not found." };

  const isDoneReopen = row.status === "feito";
  const isStuckReopen = row.status === "em_execucao";

  if (!canTransition(row.status, "aberto", "human", { hasComment: true })) {
    if (row.status === "aberto") {
      return { ok: false, error: "This card is already open." };
    }
    if (row.status === "validado") {
      return { ok: false, error: "Validated cards cannot be reopened from the board." };
    }
    return { ok: false, error: "This card cannot be reopened from its current status." };
  }

  await database.insert(taskComment).values({
    taskId,
    authorUserId: userId,
    body,
  });

  await database
    .update(task)
    .set({
      status: "aberto",
      ...(isStuckReopen
        ? {
            claimedAt: null,
            claimedByExecutor: null,
            claimedByTokenId: null,
          }
        : {}),
      ...(isDoneReopen ? { revisado: false } : {}),
    })
    .where(eq(task.id, taskId));

  return { ok: true };
}
