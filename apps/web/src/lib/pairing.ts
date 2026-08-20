import { createHash, randomInt } from "node:crypto";
import { mcpToken, pairingCode, pairingFailure } from "@agent-board/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { generateTokenSecret, hashToken } from "../mcp/token";
import type { McpDatabase } from "../mcp/types";

/**
 * One-time pairing: the human reads a 6-digit code to the agent, the agent
 * exchanges it on the public endpoint and receives the real bearer token.
 * The token value never travels through a chat. The code is consumed on
 * first use and expires quickly; only one code is active per workspace.
 */
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

/**
 * Wrong guesses one origin may spend inside a window before the endpoint
 * stops looking at its codes at all.
 *
 * Six digits is a million combinations, which sounds like plenty until you
 * notice nothing serialises the attempts: a flat delay on the failure path
 * is paid by each request on its own, so concurrent requests wait in
 * parallel and the ceiling is the caller's connection count, not the delay.
 * Inside a ten minute TTL that is reachable, and the prize is a real bearer
 * token for the workspace.
 *
 * Counting instead of slowing removes the concurrency advantage: an attempt
 * costs budget before anyone looks at the code it carries, so a hundred
 * parallel guesses drain the budget a hundred times faster and then get
 * refused unread.
 */
export const MAX_PAIRING_FAILURES = 10;

/**
 * Which bucket an attempt is charged to.
 *
 * A wrong guess matches no row, because the lookup is by hash, so there is
 * no code to attribute it to and the budget has to live outside the codes.
 * One bucket for the whole instance would work as a brake and fail as a
 * design: ten anonymous requests would then be enough to freeze the pairing
 * of every workspace at once, which is a denial of service handed to any
 * stranger. So the bucket is the origin the deployment can honestly name,
 * and callers that cannot be told apart share the fallback one.
 *
 * The escape hatch out of a drained bucket is not time, it is the human:
 * see `createPairingCode`.
 */
function pairingFailureScope(origin?: string | null): string {
  const named = origin?.trim().slice(0, 100);
  return `origin:${named || "unknown"}`;
}

export function generatePairingCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashPairingCode(code: string): string {
  return createHash("sha256").update(`ovk-pair:${code}`, "utf8").digest("hex");
}

export function isValidPairingCodeFormat(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Charges one attempt to the scope and says whether it may be evaluated.
 *
 * A single statement, so a burst cannot have every request read the same
 * count and write back the same increment; concurrency was the whole
 * weakness, so the accounting is the one place it may not leak. The count
 * comes back from the statement that spent it, which is what lets the
 * caller decide *before* it looks at the code: past the budget the guess is
 * refused without ever being hashed or compared, so the thousandth guess of
 * a burst cannot win even when it happens to be right.
 *
 * The window is the code TTL: outside it there was no live code to protect,
 * so the count starts over.
 */
async function spendAttempt(db: McpDatabase, scope: string): Promise<boolean> {
  const now = new Date();
  const windowFloor = new Date(now.getTime() - PAIRING_CODE_TTL_MS);

  const [row] = await db
    .insert(pairingFailure)
    .values({ id: scope, count: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: pairingFailure.id,
      set: {
        count: sql`case when ${pairingFailure.windowStartedAt} < ${windowFloor}
          then 1 else ${pairingFailure.count} + 1 end`,
        windowStartedAt: sql`case when ${pairingFailure.windowStartedAt} < ${windowFloor}
          then ${now} else ${pairingFailure.windowStartedAt} end`,
      },
    })
    .returning({ count: pairingFailure.count });

  return (row?.count ?? 1) <= MAX_PAIRING_FAILURES;
}

/** A successful pairing clears the budget: nobody there was guessing. */
async function clearAttempts(db: McpDatabase, scope: string): Promise<void> {
  await db.delete(pairingFailure).where(eq(pairingFailure.id, scope));
}

export async function createPairingCode(
  db: McpDatabase,
  input: { workspaceId: string; label: string; userId?: string },
): Promise<{ id: string; code: string; expiresAt: Date }> {
  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

  // One active code per workspace: a new code replaces any unconsumed one,
  // which also keeps the guessing space at a single live code.
  await db
    .delete(pairingCode)
    .where(
      and(
        eq(pairingCode.workspaceId, input.workspaceId),
        isNull(pairingCode.consumedAt),
      ),
    );

  // Generating a code is a signed-in human saying "I am here now", and it
  // is what reopens a drained bucket. Without this a guesser could leave
  // the endpoint refusing the very attempt the legitimate agent is about
  // to make. What it costs is bounded and small: at most the budget's worth
  // of evaluated guesses per origin against a brand new number out of a
  // million, and the guesser cannot trigger it — only the human can.
  await db.delete(pairingFailure);

  const [row] = await db
    .insert(pairingCode)
    .values({
      workspaceId: input.workspaceId,
      codeHash: hashPairingCode(code),
      secret: generateTokenSecret(),
      label: input.label.trim() || "paired agent",
      createdByUserId: input.userId ?? null,
      expiresAt,
    })
    .returning({ id: pairingCode.id });
  if (!row) throw new Error("failed to insert pairing code");

  return { id: row.id, code, expiresAt };
}

export type ExchangeResult =
  | { ok: true; token: string; label: string }
  | { ok: false; error: string };

export async function exchangePairingCode(
  db: McpDatabase,
  rawCode: string,
  origin?: string | null,
): Promise<ExchangeResult> {
  const notFound: ExchangeResult = {
    ok: false,
    error:
      "Pairing code not found or expired. Ask the human to generate a fresh code in the board Settings or onboarding wizard.",
  };
  const scope = pairingFailureScope(origin);

  // The gate, and the whole point of it: the budget is spent and read
  // before the code is looked at, so a drained bucket refuses the attempt
  // without evaluating it. Nothing downstream of here runs on a guess the
  // budget did not pay for. The answer is the same one a wrong code gets,
  // so the refusal is not an oracle either — and it already tells the
  // caller the way out, which is to ask the human for a fresh code.
  if (!(await spendAttempt(db, scope))) return notFound;

  if (!isValidPairingCodeFormat(rawCode.trim())) return notFound;

  const result: ExchangeResult = await db.transaction(async (tx) => {
    // Consume atomically: the update only wins while consumed_at is null,
    // so a second exchange with the same code loses even in a race.
    const [consumed] = await tx
      .update(pairingCode)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(pairingCode.codeHash, hashPairingCode(rawCode.trim())),
          isNull(pairingCode.consumedAt),
        ),
      )
      .returning();
    if (!consumed) return notFound;
    if (consumed.expiresAt.getTime() < Date.now()) return notFound;

    const secret = consumed.secret;
    const [token] = await tx
      .insert(mcpToken)
      .values({
        workspaceId: consumed.workspaceId,
        label: consumed.label,
        hash: hashToken(secret),
        tokenPrefix: secret.slice(0, 12),
        createdByUserId: consumed.createdByUserId,
      })
      .returning({ id: mcpToken.id });
    if (!token) throw new Error("failed to create token from pairing code");

    // Blank the plaintext secret: from here on only the token hash exists.
    await tx
      .update(pairingCode)
      .set({ secret: "", tokenId: token.id })
      .where(eq(pairingCode.id, consumed.id));

    return { ok: true, token: secret, label: consumed.label };
  });

  if (result.ok) await clearAttempts(db, scope);
  return result;
}

/** Wizard polling: paired once the code was exchanged. */
export async function pairingStatus(
  db: McpDatabase,
  id: string,
): Promise<{ paired: boolean }> {
  const [row] = await db
    .select({ consumedAt: pairingCode.consumedAt })
    .from(pairingCode)
    .where(eq(pairingCode.id, id))
    .limit(1);
  return { paired: row?.consumedAt != null };
}
