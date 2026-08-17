"use server";

import { eq, inArray } from "drizzle-orm";
import { mission, project, user } from "@agent-board/db";
import { NO_MISSION, encodeProjectSelection } from "../lib/board-filter";
import type { ActionResult } from "../lib/action-result";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";

export async function setBoardFilterAction(input: {
  /** Empty is the All projects shortcut. */
  projectIds: string[];
  missionId: string | null;
}): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const projectIds = [...new Set(input.projectIds)];
  if (projectIds.length > 0) {
    const found = await db()
      .select({ id: project.id })
      .from(project)
      .where(inArray(project.id, projectIds));
    if (found.length !== projectIds.length) {
      return { ok: false, error: "Project not found." };
    }
  }

  if (input.missionId && input.missionId !== NO_MISSION) {
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
      // One column holds the whole selection: "all", or the ids joined.
      boardProjectId: encodeProjectSelection(projectIds),
      boardMissionId: input.missionId,
    })
    .where(eq(user.id, session.userId));

  return { ok: true };
}
