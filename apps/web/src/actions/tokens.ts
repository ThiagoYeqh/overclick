"use server";

import { mcpToken } from "@agent-board/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import { createPairingCode, pairingStatus } from "../lib/pairing";
import { generateTokenSecret, hashToken } from "../mcp/token";
import type { ActionResult } from "../lib/action-result";

export type CreateTokenResult =
  | { ok: true; id: string; secret: string }
  | { ok: false; error: string };

/** Generates a real MCP token. The secret is only returned in this response, once. */
export async function createTokenAction(label: string): Promise<CreateTokenResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace not found." };

  const name = label.trim();
  if (!name) return { ok: false, error: "Give the token a name (e.g. Claude Code on this machine)." };

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
    if (!row) return { ok: false, error: "Could not create the token." };
    revalidatePath("/settings");
    return { ok: true, id: row.id, secret };
  } catch {
    return { ok: false, error: "A token with that name already exists." };
  }
}

export async function revokeTokenAction(tokenId: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace not found." };

  await db()
    .update(mcpToken)
    .set({ revoked: true, revokedAt: new Date() })
    .where(and(eq(mcpToken.id, tokenId), eq(mcpToken.workspaceId, ws.id)));
  revalidatePath("/settings");
  return { ok: true };
}

export type CreatePairingResult =
  | { ok: true; id: string; code: string; expiresAt: string }
  | { ok: false; error: string };

/**
 * One-time pairing code: the human reads the 6 digits to the agent and the
 * agent exchanges them on the public /api/pair endpoint for the real token.
 * The bearer value never appears in a conversation.
 */
export async function createPairingCodeAction(
  label: string,
): Promise<CreatePairingResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace not found." };

  const created = await createPairingCode(db(), {
    workspaceId: ws.id,
    label: label.trim() || "paired agent",
    userId: session.userId,
  });
  return {
    ok: true,
    id: created.id,
    code: created.code,
    expiresAt: created.expiresAt.toISOString(),
  };
}

/** Wizard polling for the pairing path: lit once the code was exchanged. */
export async function pollPairingAction(id: string): Promise<{ paired: boolean }> {
  const session = await getSession();
  if (!session) return { paired: false };
  return pairingStatus(db(), id);
}

/** Polling for the "waiting for the first connection" indicator (wizard T3). */
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
