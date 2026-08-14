"use server";

import { cardapioEntry } from "@agent-board/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import type { ActionResult } from "../lib/action-result";

export type CardapioInput = {
  activityType: string;
  cli: string | null;
  model: string | null;
  effort: string;
};

const EFFORTS = new Set(["low", "medium", "high"]);

/** Upsert da policy real (cardapio_entry) por tipo de atividade. */
export async function saveCardapioAction(entries: CardapioInput[]): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada. Entre de novo." };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace não encontrado." };

  for (const e of entries) {
    if (!e.activityType || !EFFORTS.has(e.effort)) {
      return { ok: false, error: "Linha de cardápio inválida." };
    }
  }

  for (const e of entries) {
    await db()
      .insert(cardapioEntry)
      .values({
        workspaceId: ws.id,
        activityType: e.activityType,
        cli: e.cli || null,
        model: e.model || null,
        effort: e.effort,
      })
      .onConflictDoUpdate({
        target: [cardapioEntry.workspaceId, cardapioEntry.activityType],
        set: { cli: e.cli || null, model: e.model || null, effort: e.effort },
      });
  }
  revalidatePath("/settings");
  return { ok: true };
}
