"use server";

import { isValidPrefix, project } from "@agent-board/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import type { ActionResult } from "../lib/action-result";
import type { McpDatabase } from "../mcp/types";

export type ProjectInput = {
  projectId?: string;
  createNew?: boolean;
  name: string;
  repoUrl: string;
  prefix: string;
};

export async function saveProject({
  database,
  workspaceId,
  input,
}: {
  database: McpDatabase;
  workspaceId: string;
  input: ProjectInput;
}): Promise<ActionResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the project a name. The repo name works." };

  const prefix = input.prefix.trim().toUpperCase();
  if (!isValidPrefix(prefix)) {
    return { ok: false, error: "Prefix of 2 to 4 characters, letters and numbers (e.g. AGB)." };
  }
  const repoUrl = input.repoUrl.trim() || null;

  try {
    if (input.projectId) {
      const [existing] = await database
        .select()
        .from(project)
        .where(and(eq(project.id, input.projectId), eq(project.workspaceId, workspaceId)))
        .limit(1);
      if (!existing) return { ok: false, error: "Project not found." };

      await database
        .update(project)
        .set({ name, repoUrl, idPrefix: prefix })
        .where(eq(project.id, existing.id));
    } else if (input.createNew) {
      await database.insert(project).values({
        workspaceId,
        name,
        repoUrl,
        idPrefix: prefix,
      });
    } else {
      const [existing] = await database
        .select()
        .from(project)
        .where(eq(project.workspaceId, workspaceId))
        .limit(1);

      if (existing) {
        await database
          .update(project)
          .set({ name, repoUrl, idPrefix: prefix })
          .where(eq(project.id, existing.id));
      } else {
        await database.insert(project).values({
          workspaceId,
          name,
          repoUrl,
          idPrefix: prefix,
        });
      }
    }
  } catch {
    return { ok: false, error: "A project with that prefix already exists. Try another." };
  }
  return { ok: true };
}

/** Wizard T1: creates or updates the workspace's first project. */
export async function saveProjectAction(input: ProjectInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace not found." };

  const result = await saveProject({ database: db(), workspaceId: ws.id, input });
  if (!result.ok) return result;

  revalidatePath("/onboarding");
  revalidatePath("/home");
  return { ok: true };
}
