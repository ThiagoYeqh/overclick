"use server";

import { eq } from "drizzle-orm";
import { mission, project, user } from "@agent-board/db";
import { ALL_PROJECTS } from "../lib/board-filter";
import type { ActionResult } from "../lib/action-result";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";

export async function setBoardFilterAction(input: {
  projectId: string;
  missionId: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  if (input.projectId !== ALL_PROJECTS) {
    const [proj] = await db()
      .select({ id: project.id })
      .from(project)
      .where(eq(project.id, input.projectId))
      .limit(1);
    if (!proj) return { ok: false, error: "Project not found." };
  }

  if (input.missionId) {
    const [miss] = await db()
      .select({ id: mission.id })
      .from(mission)
      .where(eq(mission.id, input.missionId))
      .limit(1);
    if (!miss) return { ok: false, error: "Mission not found." };
  }

  await db()
    .update(user)
    .set({
      boardProjectId: input.projectId,
      boardMissionId: input.missionId,
    })
    .where(eq(user.id, session.userId));

  return { ok: true };
}
