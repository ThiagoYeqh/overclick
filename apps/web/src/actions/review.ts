"use server";

import {
  canTransition,
  task,
  type ValidationTick,
} from "@agent-board/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import { parseComoConfirmo } from "../mcp/map";
import type { ActionResult } from "../lib/action-result";
import { reopenTask } from "./review-core";

/**
 * Ticks or unticks one How-to-confirm step of a done card, recording who and
 * when. The Validate button only enables when every step is ticked.
 */
export async function tickValidationStepAction(
  taskId: string,
  stepIndex: number,
  checked: boolean,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const row = await db().query.task.findFirst({ where: eq(task.id, taskId) });
  if (!row) return { ok: false, error: "Card not found." };
  if (row.status !== "feito") {
    return { ok: false, error: "You can only check steps on a card in done." };
  }

  const steps = parseComoConfirmo(row.comoConfirmo);
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= steps.length) {
    return { ok: false, error: "This step does not exist on the card." };
  }

  const ticks = row.validationTicks.filter((t) => t.index !== stepIndex);
  if (checked) {
    const tick: ValidationTick = {
      index: stepIndex,
      byUserId: session.userId,
      byEmail: session.email,
      at: new Date().toISOString(),
    };
    ticks.push(tick);
  }

  await db().update(task).set({ validationTicks: ticks }).where(eq(task.id, taskId));
  revalidatePath("/home");
  return { ok: true };
}

/**
 * feito → validado (signed-in human only). Requires every How-to-confirm step
 * ticked unless the reviewer explicitly overrides ("validate anyway").
 */
export async function validateTaskAction(
  taskId: string,
  options: { override?: boolean } = {},
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const row = await db().query.task.findFirst({ where: eq(task.id, taskId) });
  if (!row) return { ok: false, error: "Card not found." };
  if (!canTransition(row.status, "validado", "human")) {
    return { ok: false, error: "You can only validate a card that is in done." };
  }

  if (!options.override) {
    const steps = parseComoConfirmo(row.comoConfirmo);
    const ticked = new Set(row.validationTicks.map((t) => t.index));
    const missing = steps.filter((_, index) => !ticked.has(index));
    if (missing.length > 0) {
      return {
        ok: false,
        error: `Check all ${steps.length} steps first, or validate anyway.`,
      };
    }
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
