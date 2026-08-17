import { pairingCode } from "@agent-board/db";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPairingCode,
  exchangePairingCode,
  pairingStatus,
} from "../lib/pairing";
import { authenticateBearer } from "./auth";
import { closeTestWorld, createTestWorld, type TestWorld } from "./test-db";

describe("one-time token pairing", () => {
  let world: TestWorld;

  afterEach(async () => {
    if (world) await closeTestWorld(world);
  });

  it("exchanges a 6-digit code for a working bearer token, once", async () => {
    world = await createTestWorld();
    const created = await createPairingCode(world.db, {
      workspaceId: world.workspaceId,
      label: "paired via code",
    });
    expect(created.code).toMatch(/^\d{6}$/);
    expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const exchanged = await exchangePairingCode(world.db, created.code);
    expect(exchanged.ok).toBe(true);
    if (!exchanged.ok) return;
    expect(exchanged.label).toBe("paired via code");

    // The token from the exchange authenticates against /mcp.
    const auth = await authenticateBearer(
      world.db,
      `Bearer ${exchanged.token}`,
    );
    expect(auth.ok).toBe(true);

    // The plaintext secret is gone from the pairing row.
    const [row] = await world.db
      .select()
      .from(pairingCode)
      .where(eq(pairingCode.id, created.id));
    expect(row?.secret).toBe("");
    expect(row?.tokenId).toBeTruthy();

    // Single use: the same code never works twice.
    const again = await exchangePairingCode(world.db, created.code);
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.error).toMatch(/not found or expired/i);
    }

    const status = await pairingStatus(world.db, created.id);
    expect(status.paired).toBe(true);
  });

  it("rejects unknown, malformed and expired codes without leaking anything", async () => {
    world = await createTestWorld();

    const unknown = await exchangePairingCode(world.db, "000000");
    expect(unknown.ok).toBe(false);

    const malformed = await exchangePairingCode(world.db, "ocb_notacode");
    expect(malformed.ok).toBe(false);

    const created = await createPairingCode(world.db, {
      workspaceId: world.workspaceId,
      label: "expired",
    });
    await world.db
      .update(pairingCode)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(pairingCode.id, created.id));
    const expired = await exchangePairingCode(world.db, created.code);
    expect(expired.ok).toBe(false);
    if (!expired.ok) {
      expect(expired.error).not.toMatch(/ocb_|select |failed query/i);
    }
  });

  it("keeps a single active code per workspace", async () => {
    world = await createTestWorld();
    const first = await createPairingCode(world.db, {
      workspaceId: world.workspaceId,
      label: "first",
    });
    const second = await createPairingCode(world.db, {
      workspaceId: world.workspaceId,
      label: "second",
    });

    const staleFirst = await exchangePairingCode(world.db, first.code);
    // The second code replaced the first; only one live code can exist,
    // unless both codes randomly collided (1 in a million, ignore).
    if (first.code !== second.code) {
      expect(staleFirst.ok).toBe(false);
    }
    const live = await exchangePairingCode(world.db, second.code);
    expect(live.ok).toBe(true);
  });
});
