"use server";

import { mcpToken } from "@agent-board/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import { generateTokenSecret, hashToken } from "../mcp/token";
import type { ActionResult } from "../lib/action-result";

export type CreateTokenResult =
  | { ok: true; id: string; secret: string }
  | { ok: false; error: string };

/** Gera token MCP real. O segredo só é retornado nesta resposta — uma vez. */
export async function createTokenAction(label: string): Promise<CreateTokenResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada. Entre de novo." };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace não encontrado." };

  const name = label.trim();
  if (!name) return { ok: false, error: "Dá um nome pro token (ex.: Claude Code — esta máquina)." };

  const secret = generateTokenSecret();
  try {
    const [row] = await db()
      .insert(mcpToken)
      .values({
        workspaceId: ws.id,
        label: name,
        hash: hashToken(secret),
        tokenPrefix: secret.slice(0, 12),
        createdByUserId: session.userId,
      })
      .returning({ id: mcpToken.id });
    if (!row) return { ok: false, error: "Não deu para criar o token." };
    revalidatePath("/settings");
    return { ok: true, id: row.id, secret };
  } catch {
    return { ok: false, error: "Já existe um token com esse nome." };
  }
}

export async function revokeTokenAction(tokenId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada. Entre de novo." };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace não encontrado." };

  await db()
    .update(mcpToken)
    .set({ revoked: true, revokedAt: new Date() })
    .where(and(eq(mcpToken.id, tokenId), eq(mcpToken.workspaceId, ws.id)));
  revalidatePath("/settings");
  return { ok: true };
}

/** Polling do indicador "aguardando primeira conexão" (wizard T3). */
export async function pollTokenAction(
  tokenId: string,
): Promise<{ used: boolean; usedAt: string | null }> {
  const session = await getSession();
  if (!session) return { used: false, usedAt: null };

  const row = await db().query.mcpToken.findFirst({
    where: eq(mcpToken.id, tokenId),
    columns: { lastUsedAt: true },
  });
  return {
    used: row?.lastUsedAt != null,
    usedAt: row?.lastUsedAt?.toISOString() ?? null,
  };
}
