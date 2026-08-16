import { executionAttempt, task, taskComment, user } from "@agent-board/db";
import { InsightsQueryOutputSchema } from "@agent-board/mcp-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  computeInsights,
  loadInsightAttemptRows,
  loadReopenRows,
} from "../lib/insights";
import { closeTestWorld, createTestWorld, type TestWorld } from "./test-db";
import { invokeTool } from "./tools";

/**
 * The card's How-to-confirm is "the numbers match the Insights page". The page
 * is loaders + computeInsights, so every assertion here is either a literal
 * from the seed or a comparison against that exact path.
 */
describe("insights_query answers what the Insights page answers", () => {
  let world: TestWorld;
  let fullTaskId: string;
  let estimatedTaskId: string;

  function ctx() {
    return {
      tokenId: world.tokenId,
      workspaceId: world.workspaceId,
      tokenLabel: "test-agent",
      canManage: false,
    };
  }

  async function pageInsights() {
    const [rows, reopens] = await Promise.all([
      loadInsightAttemptRows(world.db, world.workspaceId),
      loadReopenRows(world.db, world.workspaceId),
    ]);
    return computeInsights(rows, reopens);
  }

  beforeAll(async () => {
    world = await createTestWorld();

    const [reviewer] = await world.db
      .insert(user)
      .values({ email: "owner@local.test", passwordHash: "x" })
      .returning({ id: user.id });
    if (!reviewer) throw new Error("failed to insert user");

    const [full] = await world.db
      .insert(task)
      .values({
        projectId: world.projectId,
        missionId: world.missionId,
        shortId: "OC-1",
        title: "Card with full usage",
        status: "feito",
      })
      .returning({ id: task.id });
    const [estimated] = await world.db
      .insert(task)
      .values({
        projectId: world.projectId,
        shortId: "OC-2",
        title: "Card with estimated usage",
        status: "aberto",
      })
      .returning({ id: task.id });
    const [demo] = await world.db
      .insert(task)
      .values({
        projectId: world.projectId,
        shortId: "OC-3",
        title: "Seeded example card",
        status: "feito",
        isExample: true,
      })
      .returning({ id: task.id });
    if (!full || !estimated || !demo) throw new Error("failed to insert tasks");
    fullTaskId = full.id;
    estimatedTaskId = estimated.id;

    await world.db.insert(executionAttempt).values([
      {
        taskId: full.id,
        model: "sonnet-5",
        result: "success",
        startedAt: new Date("2026-08-10T10:00:00Z"),
        finishedAt: new Date("2026-08-10T11:00:00Z"),
        tokensIn: 1000,
        tokensOut: 500,
        tokensCache: 0,
        costUsd: "2.00",
        durationMs: 3_600_000,
        turns: 12,
        usageEstimated: false,
      },
      {
        taskId: estimated.id,
        model: "opus-4-8",
        result: "success",
        startedAt: new Date("2026-08-11T10:00:00Z"),
        finishedAt: new Date("2026-08-11T10:30:00Z"),
        tokensIn: 400,
        tokensOut: 100,
        costUsd: "0.50",
        durationMs: 1_800_000,
        turns: 5,
        usageEstimated: true,
      },
      // Delivered without any usage: counted as missing, never as zero.
      {
        taskId: estimated.id,
        model: "haiku-4",
        result: "success",
        startedAt: new Date("2026-08-12T09:00:00Z"),
        finishedAt: new Date("2026-08-12T09:20:00Z"),
        serverDurationMs: 1_200_000,
        usageEstimated: false,
      },
      // Still running: nothing honest to sum yet.
      {
        taskId: estimated.id,
        model: "opus-4-8",
        startedAt: new Date("2026-08-13T10:00:00Z"),
      },
      // Example card: demo data must never inflate real cost.
      {
        taskId: demo.id,
        model: "sonnet-5",
        result: "success",
        startedAt: new Date("2026-08-10T10:00:00Z"),
        finishedAt: new Date("2026-08-10T10:10:00Z"),
        costUsd: "99.00",
        usageEstimated: false,
      },
    ]);

    await world.db.insert(taskComment).values({
      taskId: estimated.id,
      authorUserId: reviewer.id,
      body: "The totals do not match, run it again.",
      createdAt: new Date("2026-08-11T12:00:00Z"),
    });
  });

  afterAll(async () => {
    await closeTestWorld(world);
  });

  it("returns the same totals the page computes, with the honesty note", async () => {
    const queried = await invokeTool(world.db, ctx(), "insights_query", {});
    expect(queried.ok).toBe(true);
    if (!queried.ok) return;
    const out = InsightsQueryOutputSchema.parse(queried.value);
    const page = await pageInsights();

    expect(out.totals).toEqual({
      cost_usd: page.totals.costUsd,
      tokens: page.totals.tokens,
      duration_ms: page.totals.durationMs,
      attempts: page.totals.attempts,
      estimated: page.totals.estimated,
      missing: page.totals.missing,
    });
    // Three finished attempts on real cards; the example card's $99 is out.
    expect(out.totals.attempts).toBe(3);
    expect(out.totals.cost_usd).toBeCloseTo(2.5);
    expect(out.totals.tokens).toBe(2000);
    expect(out.totals.estimated).toBe(1);
    expect(out.totals.missing).toBe(1);
    expect(out.note).toBe("1 estimated · 1 usage not reported");
    expect(out.period).toEqual({ since: null, until: null });
    // Without group_by the response stays small.
    expect(out.groups).toBeUndefined();
    expect(out.cards).toBeUndefined();
  });

  it("groups by mission, project and model exactly as the page does", async () => {
    const page = await pageInsights();

    for (const [groupBy, expected] of [
      ["mission", page.byMission],
      ["project", page.byProject],
      ["model", page.byModel],
    ] as const) {
      const queried = await invokeTool(world.db, ctx(), "insights_query", {
        group_by: groupBy,
      });
      expect(queried.ok).toBe(true);
      if (!queried.ok) return;
      const out = InsightsQueryOutputSchema.parse(queried.value);
      expect(out.groups).toEqual(
        expected.map((row) => ({
          key: row.key,
          label: row.label,
          cost_usd: row.costUsd,
          tokens: row.tokens,
          duration_ms: row.durationMs,
          attempts: row.attempts,
          estimated: row.estimated,
          missing: row.missing,
        })),
      );
    }

    // "How much did this mission cost?" is one call plus one lookup.
    const byMission = await invokeTool(world.db, ctx(), "insights_query", {
      group_by: "mission",
    });
    if (!byMission.ok) return;
    const missions = InsightsQueryOutputSchema.parse(byMission.value).groups;
    expect(
      missions?.find((row) => row.label === "Norte do board")?.cost_usd,
    ).toBeCloseTo(2);
    // The loose card's group carries a null label, never an invented one.
    expect(missions?.find((row) => row.label === null)?.attempts).toBe(2);
  });

  it("reports the reopened rate per model, highest first", async () => {
    const queried = await invokeTool(world.db, ctx(), "insights_query", {});
    expect(queried.ok).toBe(true);
    if (!queried.ok) return;
    const out = InsightsQueryOutputSchema.parse(queried.value);
    const page = await pageInsights();
    expect(out.reopened_by_model).toEqual(page.reopensByModel);

    expect(out.reopened_by_model[0]).toEqual({
      model: "opus-4-8",
      deliveries: 1,
      reopened: 1,
      rate: 1,
    });
    expect(
      out.reopened_by_model.find((row) => row.model === "sonnet-5")?.rate,
    ).toBe(0);
  });

  it("keeps an unreported cost null on a card instead of calling it zero", async () => {
    const queried = await invokeTool(world.db, ctx(), "insights_query", {
      group_by: "card",
    });
    expect(queried.ok).toBe(true);
    if (!queried.ok) return;
    const out = InsightsQueryOutputSchema.parse(queried.value);
    expect(out.groups).toBeUndefined();

    const full = out.cards?.find((row) => row.task_id === fullTaskId);
    expect(full).toMatchObject({
      short_id: "OC-1",
      project: "OverClick",
      mission: "Norte do board",
      models: ["sonnet-5"],
      attempts: 1,
      estimated: false,
      missing: false,
    });
    expect(full?.cost_usd).toBeCloseTo(2);

    const partial = out.cards?.find((row) => row.task_id === estimatedTaskId);
    expect(partial?.models).toEqual(["opus-4-8", "haiku-4"]);
    expect(partial?.estimated).toBe(true);
    expect(partial?.missing).toBe(true);
    expect(out.cards?.map((row) => row.short_id)).not.toContain("OC-3");
  });

  it("narrows the period by when the attempt finished", async () => {
    const queried = await invokeTool(world.db, ctx(), "insights_query", {
      since: "2026-08-11T00:00:00.000Z",
      until: "2026-08-11T23:59:59.000Z",
    });
    expect(queried.ok).toBe(true);
    if (!queried.ok) return;
    const out = InsightsQueryOutputSchema.parse(queried.value);
    expect(out.totals.attempts).toBe(1);
    expect(out.totals.cost_usd).toBeCloseTo(0.5);
    expect(out.totals.estimated).toBe(1);
    expect(out.note).toBe("1 estimated");
    expect(out.period.since).toBe("2026-08-11T00:00:00.000Z");

    // A reopen that landed outside the window still counts for the delivery
    // inside it: the period narrows attempts, not the reopen signal.
    expect(out.reopened_by_model).toEqual([
      { model: "opus-4-8", deliveries: 1, reopened: 1, rate: 1 },
    ]);
  });

  it("returns an empty picture for a period with no attempts", async () => {
    const queried = await invokeTool(world.db, ctx(), "insights_query", {
      since: "2030-01-01T00:00:00.000Z",
    });
    expect(queried.ok).toBe(true);
    if (!queried.ok) return;
    const out = InsightsQueryOutputSchema.parse(queried.value);
    expect(out.totals.attempts).toBe(0);
    expect(out.totals.cost_usd).toBe(0);
    expect(out.note).toBe("all usage reported");
    expect(out.reopened_by_model).toEqual([]);
  });

  it("rejects an inverted period", async () => {
    const queried = await invokeTool(world.db, ctx(), "insights_query", {
      since: "2026-08-12T00:00:00.000Z",
      until: "2026-08-10T00:00:00.000Z",
    });
    expect(queried.ok).toBe(false);
    if (queried.ok) return;
    expect(queried.error.code).toBe("INVALID_ARGUMENT");
    expect(queried.error.message).toContain("inverted");
  });

  it("is readable with a plain worker token, no manage flag needed", async () => {
    const queried = await invokeTool(
      world.db,
      { ...ctx(), canManage: false },
      "insights_query",
      {},
    );
    expect(queried.ok).toBe(true);
  });
});
