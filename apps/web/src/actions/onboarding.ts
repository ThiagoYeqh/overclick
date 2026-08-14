"use server";

import { isValidPrefix, project } from "@agent-board/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import type { ActionResult } from "../lib/action-result";

export type ProjectInput = {
  name: string;
  repoUrl: string;
  prefix: string;
};

/** Wizard T1: creates or updates the workspace's first project. */
export async function saveProjectAction(input: ProjectInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace not found." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the project a name. The repo name works." };

  const prefix = input.prefix.trim().toUpperCase();
  if (!isValidPrefix(prefix)) {
    return { ok: false, error: "Prefix of 2 to 4 characters, letters and numbers (e.g. AGB)." };
  }
  const repoUrl = input.repoUrl.trim() || null;

  const existing = await db().query.project.findFirst({
    where: eq(project.workspaceId, ws.id),
  });

  try {
    if (existing) {
      await db()
        .update(project)
        .set({ name, repoUrl, idPrefix: prefix })
        .where(eq(project.id, existing.id));
    } else {
      await db().insert(project).values({
        workspaceId: ws.id,
        name,
        repoUrl,
        idPrefix: prefix,
      });
    }
  } catch {
    return { ok: false, error: "A project with that prefix already exists. Try another." };
  }
  revalidatePath("/onboarding");
  revalidatePath("/home");
  return { ok: true };
}
