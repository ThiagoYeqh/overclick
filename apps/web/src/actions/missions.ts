"use server";

import { mission, project, task, workspace } from "@agent-board/db";
import { and, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "../lib/action-result";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import { planMissionAssignment } from "../lib/mission-assign";

type MissionStatus = "ativa" | "pausada" | "concluida";

const MISSION_STATUSES = new Set<MissionStatus>([
  "ativa",
  "pausada",
  "concluida",
]);

async function boardWorkspaceId(): Promise<string | null> {
  const [row] = await db()
    .select({ id: workspace.id })
    .from(workspace)
    .limit(1);
  return row?.id ?? null;
}

function cleanMissionTitle(value: string): string | null {
  const title = value.trim();
  return title.length >= 1 && title.length <= 200 ? title : null;
}

export async function createMissionAction(input: {
  title: string;
  objective: string;
  context: string;
}): Promise<
  | { ok: true; mission: { id: string } }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };
  const workspaceId = await boardWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Workspace not found." };
  const title = cleanMissionTitle(input.title);
  if (!title) {
    return { ok: false, error: "Mission title must be 1 to 200 characters." };
  }

  const [created] = await db()
    .insert(mission)
    .values({
      workspaceId,
      title,
      objective: input.objective.trim(),
      context: input.context.trim(),
      status: "ativa",
    })
    .returning({ id: mission.id });
  if (!created) return { ok: false, error: "Could not create the mission." };

  revalidatePath("/home");
  return { ok: true, mission: created };
}

export async function updateMissionAction(input: {
  missionId: string;
  title: string;
  objective: string;
  context: string;
  status: MissionStatus;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };
  const workspaceId = await boardWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Workspace not found." };
  const title = cleanMissionTitle(input.title);
  if (!title) {
    return { ok: false, error: "Mission title must be 1 to 200 characters." };
  }
  if (!MISSION_STATUSES.has(input.status)) {
    return { ok: false, error: "Mission status is invalid." };
  }

  const [updated] = await db()
    .update(mission)
    .set({
      title,
      objective: input.objective.trim(),
      context: input.context.trim(),
      status: input.status,
    })
    .where(
      and(
        eq(mission.id, input.missionId),
        eq(mission.workspaceId, workspaceId),
      ),
    )
    .returning({ id: mission.id });
  if (!updated) return { ok: false, error: "Mission not found." };

  revalidatePath("/home");
  return { ok: true };
}

export async function deleteEmptyMissionAction(
  missionId: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };
  const workspaceId = await boardWorkspaceId();
  if (!workspaceId) return { ok: false, error: "Workspace not found." };

  const database = db();
  return database.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: mission.id })
      .from(mission)
      .where(
        and(
          eq(mission.id, missionId),
          eq(mission.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!current) return { ok: false, error: "Mission not found." } as const;

    const [cards] = await tx
      .select({ n: count() })
      .from(task)
      .where(eq(task.missionId, current.id));
    const taskCount = Number(cards?.n ?? 0);
    if (taskCount > 0) {
      return {
        ok: false,
        error: `This mission still holds ${taskCount} card${taskCount === 1 ? "" : "s"}. Move them before deleting it.`,
      } as const;
    }

    await tx.delete(mission).where(eq(mission.id, current.id));
    revalidatePath("/home");
    return { ok: true } as const;
  });
}

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
