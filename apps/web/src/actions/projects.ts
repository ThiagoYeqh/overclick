"use server";

import { project } from "@agent-board/db";
import { PROJECT_CONTEXT_MAX_CHARS } from "@agent-board/mcp-core";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "../lib/action-result";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";

export type ProjectContextInput = {
  projectId: string;
  context: string;
  currentVersion: string;
};

/** Saves the human-maintained project briefing shown to every future agent. */
export async function saveProjectContextAction(
  input: ProjectContextInput,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace not found." };
  if (input.context.length > PROJECT_CONTEXT_MAX_CHARS) {
    return {
      ok: false,
      error: `Project context cannot exceed ${PROJECT_CONTEXT_MAX_CHARS} characters.`,
    };
  }

  const currentVersion = input.currentVersion.trim();
  if (currentVersion.length > 200) {
    return { ok: false, error: "Current version cannot exceed 200 characters." };
  }

  const [updated] = await db()
    .update(project)
    .set({
      context: input.context.trim() ? input.context : null,
      currentVersion: currentVersion || null,
    })
    .where(
      and(
        eq(project.id, input.projectId),
        eq(project.workspaceId, ws.id),
      ),
    )
    .returning({ id: project.id });
  if (!updated) return { ok: false, error: "Project not found." };

  revalidatePath("/settings");
  revalidatePath("/home");
  return { ok: true };
}
