"use server";

import { mission, project, task } from "@agent-board/db";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "../lib/action-result";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import { planMissionAssignment } from "../lib/mission-assign";

/**
 * Moves cards between missions from the board: one card from its detail
 * panel, or a whole selection from the bulk bar. `missionId: null` detaches.
 * The same rule the MCP `task_update` follows applies here, so a human and an
 * agent can never leave the board in states the other one cannot produce.
 */
export async function assignCardsToMissionAction(
  taskIds: string[],
  missionId: string | null,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const requested = [...new Set(taskIds.filter((id) => id.trim()))];
  const rows =
    requested.length === 0
      ? []
      : await db()
          .select({ id: task.id, workspaceId: project.workspaceId })
          .from(task)
          .innerJoin(project, eq(task.projectId, project.id))
          .where(inArray(task.id, requested));

  const target = missionId
    ? ((
        await db()
          .select({ id: mission.id, workspaceId: mission.workspaceId })
          .from(mission)
          .where(eq(mission.id, missionId))
          .limit(1)
      )[0] ?? ("missing" as const))
    : null;

  const plan = planMissionAssignment({
    requestedIds: requested,
    cards: rows,
    mission: target,
  });
  if (!plan.ok) return { ok: false, error: plan.error };

  await db()
    .update(task)
    .set({ missionId: plan.missionId })
    .where(inArray(task.id, plan.taskIds));
  // Subtasks were created inside the parent's mission; they follow it out too.
  await db()
    .update(task)
    .set({ missionId: plan.missionId })
    .where(inArray(task.parentId, plan.taskIds));

  revalidatePath("/home");
  return { ok: true };
}
