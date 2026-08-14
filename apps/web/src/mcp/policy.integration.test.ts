import { cardapioEntry } from "@agent-board/db";
import {
  FACTORY_CARDAPIO_POLICY,
  HarnessListOutputSchema,
  HarnessRecommendOutputSchema,
} from "@agent-board/mcp-core";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { closeTestWorld, createTestWorld, type TestWorld } from "./test-db";
import { invokeTool } from "./tools";

describe("cardápio policy via MCP", () => {
  let world: TestWorld;

  afterEach(async () => {
    if (world) await closeTestWorld(world);
  });

  function ctx() {
    return {
      tokenId: world.tokenId,
      workspaceId: world.workspaceId,
      tokenLabel: "test",
    };
  }

  it("harness_list returns the seeded factory policy and configured executors", async () => {
    world = await createTestWorld();
    const listed = await invokeTool(world.db, ctx(), "harness_list", {});
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const out = HarnessListOutputSchema.parse(listed.value);
    expect(out.policy.map((row) => row.type)).toEqual(
      FACTORY_CARDAPIO_POLICY.map((row) => row.type),
    );
    expect(out.policy.find((row) => row.type === "bug")).toEqual({
      type: "bug",
      cli: null,
      model: "sonnet-5",
      effort: "medium",
    });
    for (const row of out.policy) {
      expect(row).not.toHaveProperty("skills");
    }
    expect(out.executors).toEqual([
      {
        id: "claude-code",
        label: "Claude Code",
        enabled: true,
        models: ["opus-4-8", "sonnet-5", "haiku-4"],
      },
    ]);
  });

  it("editing the stored policy changes what harness_recommend returns", async () => {
    world = await createTestWorld();
    await world.db
      .update(cardapioEntry)
      .set({ cli: "claude-code", model: "opus-4-8", effort: "high" })
      .where(
        and(
          eq(cardapioEntry.workspaceId, world.workspaceId),
          eq(cardapioEntry.activityType, "bug"),
        ),
      );

    const rec = await invokeTool(world.db, ctx(), "harness_recommend", {
      type: "bug",
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    const out = HarnessRecommendOutputSchema.parse(rec.value);
    expect(out.harness).toEqual({
      cli: "claude-code",
      model: "opus-4-8",
      effort: "high",
    });
    expect(out.harness).not.toHaveProperty("skills");
  });

  it("falls back to factory defaults when the type is missing from the stored policy", async () => {
    world = await createTestWorld();
    await world.db
      .delete(cardapioEntry)
      .where(
        and(
          eq(cardapioEntry.workspaceId, world.workspaceId),
          eq(cardapioEntry.activityType, "mechanical"),
        ),
      );

    const rec = await invokeTool(world.db, ctx(), "harness_recommend", {
      type: "mechanical",
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    const out = HarnessRecommendOutputSchema.parse(rec.value);
    expect(out.harness.model).toBe("haiku-4");
    expect(out.harness.effort).toBe("low");
    expect(out.harness.cli).toBeNull();
  });
});
