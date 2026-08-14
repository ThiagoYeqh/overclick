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

/** Wizard T1: cria ou atualiza o primeiro projeto do workspace. */
export async function saveProjectAction(input: ProjectInput): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada. Entre de novo." };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace não encontrado." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Dá um nome pro projeto — pode ser o nome do repo." };

  const prefix = input.prefix.trim().toUpperCase();
  if (!isValidPrefix(prefix)) {
    return { ok: false, error: "Prefixo de 2 a 4 caracteres, letras e números (ex.: AGB)." };
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
    return { ok: false, error: "Já existe um projeto com esse prefixo. Tenta outro." };
  }
  revalidatePath("/onboarding");
  revalidatePath("/home");
  return { ok: true };
}
