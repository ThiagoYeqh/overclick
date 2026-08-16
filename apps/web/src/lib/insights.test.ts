import { describe, expect, it } from "vitest";
import {
  computeInsights,
  type InsightAttemptRow,
  type ReopenRow,
} from "./insights";

let seq = 0;

function attempt(overrides: Partial<InsightAttemptRow> = {}): InsightAttemptRow {
  seq += 1;
  return {
    attemptId: `attempt-${seq}`,
    taskId: "task-1",
    taskShortId: "OC-1",
    taskTitle: "First card",
    taskIsExample: false,
    projectId: "proj-1",
    projectName: "OverClick",
    missionId: null,
    missionTitle: null,
    model: "sonnet-5",
    result: "success",
    finishedAt: new Date("2026-08-10T12:00:00Z"),
    usageSegments: null,
    tokensIn: 1000,
    tokensOut: 500,
    tokensCache: 0,
    costUsd: "1.50",
    durationMs: 60_000,
    serverDurationMs: 65_000,
    turns: 10,
    usageEstimated: false,
    ...overrides,
  };
}

function reopen(taskId: string, at: string): ReopenRow {
  return { taskId, createdAt: new Date(at) };
}

describe("computeInsights totals", () => {
  it("sums cost, tokens and time across finished attempts", () => {
    const result = computeInsights(
      [
        attempt({ costUsd: "1.50", tokensIn: 1000, tokensOut: 500 }),
        attempt({
          taskId: "task-2",
          taskShortId: "OC-2",
          costUsd: "0.25",
          tokensIn: 200,
          tokensOut: 100,
          tokensCache: 700,
          durationMs: 30_000,
        }),
      ],
      [],
    );
    expect(result.totals.costUsd).toBeCloseTo(1.75);
    expect(result.totals.tokens).toBe(2500);
    expect(result.totals.durationMs).toBe(90_000);
    expect(result.totals.attempts).toBe(2);
  });

  it("ignores unfinished attempts and example cards", () => {
    const result = computeInsights(
      [
        attempt(),
        attempt({ finishedAt: null, costUsd: "9.99" }),
        attempt({ taskIsExample: true, costUsd: "9.99" }),
      ],
      [],
    );
    expect(result.totals.attempts).toBe(1);
    expect(result.totals.costUsd).toBeCloseTo(1.5);
    expect(result.perCard).toHaveLength(1);
  });

  it("counts estimated and missing usage separately instead of hiding them", () => {
    const result = computeInsights(
      [
        attempt(),
        attempt({ usageEstimated: true }),
        attempt({
          tokensIn: null,
          tokensOut: null,
          tokensCache: null,
          costUsd: null,
          durationMs: null,
          turns: null,
        }),
      ],
      [],
    );
    expect(result.totals.estimated).toBe(1);
    expect(result.totals.missing).toBe(1);
    expect(result.totals.attempts).toBe(3);
  });

  it("falls back to the server-measured duration when the agent reported none", () => {
    const result = computeInsights(
      [attempt({ durationMs: null, serverDurationMs: 120_000 })],
      [],
    );
    expect(result.totals.durationMs).toBe(120_000);
  });
});

describe("computeInsights groups", () => {
  it("aggregates per project, mission and model, sorted by cost", () => {
    const rows = [
      attempt({
        projectId: "proj-1",
        projectName: "OverClick",
        missionId: "m-1",
        missionTitle: "MVP loop",
        model: "sonnet-5",
        costUsd: "1.00",
      }),
      attempt({
        taskId: "task-2",
        taskShortId: "OC-2",
        projectId: "proj-2",
        projectName: "Site",
        missionId: null,
        missionTitle: null,
        model: "opus-4-8",
        costUsd: "4.00",
      }),
    ];
    const result = computeInsights(rows, []);

    expect(result.byProject.map((g) => g.label)).toEqual(["Site", "OverClick"]);
    expect(result.byProject[0]?.costUsd).toBeCloseTo(4);

    expect(result.byMission).toHaveLength(2);
    expect(result.byMission[0]?.label).toBeNull();
    expect(result.byMission[1]?.label).toBe("MVP loop");

    expect(result.byModel.map((g) => g.label)).toEqual(["opus-4-8", "sonnet-5"]);
  });

  it("buckets attempts without a model under a null label", () => {
    const result = computeInsights([attempt({ model: null })], []);
    expect(result.byModel).toHaveLength(1);
    expect(result.byModel[0]?.label).toBeNull();
    expect(result.byModel[0]?.attempts).toBe(1);
  });
});

describe("computeInsights reopened rate", () => {
  it("marks a delivery reopened when a human comment lands after it", () => {
    const rows = [
      attempt({
        taskId: "task-1",
        model: "sonnet-5",
        finishedAt: new Date("2026-08-10T12:00:00Z"),
      }),
      attempt({
        taskId: "task-2",
        taskShortId: "OC-2",
        model: "sonnet-5",
        finishedAt: new Date("2026-08-10T12:00:00Z"),
      }),
    ];
    const reopens = [reopen("task-1", "2026-08-10T13:00:00Z")];
    const result = computeInsights(rows, reopens);
    expect(result.reopensByModel).toEqual([
      { model: "sonnet-5", deliveries: 2, reopened: 1, rate: 0.5 },
    ]);
  });

  it("does not count comments written before the delivery", () => {
    const rows = [attempt({ finishedAt: new Date("2026-08-10T12:00:00Z") })];
    const reopens = [reopen("task-1", "2026-08-10T11:00:00Z")];
    const result = computeInsights(rows, reopens);
    expect(result.reopensByModel[0]?.reopened).toBe(0);
  });

  it("only counts successful deliveries, not abandoned attempts", () => {
    const rows = [
      attempt({ result: "abandoned" }),
      attempt({ result: "success" }),
    ];
    const result = computeInsights(rows, []);
    expect(result.reopensByModel[0]?.deliveries).toBe(1);
  });

  it("sorts models by reopened rate", () => {
    const rows = [
      attempt({ taskId: "t-1", model: "a" }),
      attempt({ taskId: "t-2", model: "b" }),
      attempt({ taskId: "t-3", model: "b" }),
    ];
    const reopens = [reopen("t-2", "2026-08-11T00:00:00Z")];
    const result = computeInsights(rows, reopens);
    expect(result.reopensByModel.map((m) => m.model)).toEqual(["b", "a"]);
  });
});

describe("computeInsights per card", () => {
  it("sums the attempts of a card and keeps cost null when never reported", () => {
    const rows = [
      attempt({ taskId: "task-1", costUsd: "1.00", tokensIn: 100, tokensOut: 0 }),
      attempt({ taskId: "task-1", costUsd: "0.50", tokensIn: 50, tokensOut: 0, tokensCache: null }),
      attempt({
        taskId: "task-2",
        taskShortId: "OC-2",
        costUsd: null,
        tokensIn: 10,
        tokensOut: 0,
      }),
    ];
    const result = computeInsights(rows, []);
    expect(result.perCard).toHaveLength(2);
    const [first, second] = result.perCard;
    expect(first?.shortId).toBe("OC-1");
    expect(first?.costUsd).toBeCloseTo(1.5);
    expect(first?.attempts).toBe(2);
    expect(first?.tokens).toBe(150);
    expect(second?.costUsd).toBeNull();
  });

  it("flags a card whose usage is estimated or missing", () => {
    const rows = [
      attempt({ taskId: "task-1", usageEstimated: true }),
      attempt({
        taskId: "task-2",
        taskShortId: "OC-2",
        tokensIn: null,
        tokensOut: null,
        tokensCache: null,
        costUsd: null,
        durationMs: null,
        turns: null,
      }),
    ];
    const result = computeInsights(rows, []);
    const byId = new Map(result.perCard.map((c) => [c.shortId, c]));
    expect(byId.get("OC-1")?.estimated).toBe(true);
    expect(byId.get("OC-1")?.missing).toBe(false);
    expect(byId.get("OC-2")?.missing).toBe(true);
  });

  it("collects the models that touched the card", () => {
    const rows = [
      attempt({ taskId: "task-1", model: "sonnet-5" }),
      attempt({ taskId: "task-1", model: "opus-4-8" }),
      attempt({ taskId: "task-1", model: "sonnet-5" }),
    ];
    const result = computeInsights(rows, []);
    expect(result.perCard[0]?.models).toEqual(["sonnet-5", "opus-4-8"]);
  });
});

describe("cost from the price table", () => {
  const prices = [
    { model: "sonnet-5", label: "sonnet-5", inputPerMtok: 3, outputPerMtok: 15, cachePerMtok: 0.3 },
  ];

  it("computes the cost from tokens instead of the number the agent sent", () => {
    const result = computeInsights(
      [attempt({ costUsd: "99.00", tokensIn: 1_000_000, tokensOut: 0, tokensCache: 0 })],
      [],
      prices,
    );
    expect(result.totals.costUsd).toBeCloseTo(3);
    expect(result.totals.costComputed).toBe(1);
    expect(result.totals.costReported).toBe(0);
    expect(result.perCard[0]?.costSource).toBe("computed");
  });

  it("falls back to the agent's figure for a model nobody priced", () => {
    const result = computeInsights(
      [attempt({ model: "kimi-for-coding", costUsd: "0.40" })],
      [],
      prices,
    );
    expect(result.totals.costUsd).toBeCloseTo(0.4);
    expect(result.totals.costReported).toBe(1);
    expect(result.totals.costUnpriced).toBe(1);
    expect(result.perCard[0]?.costSource).toBe("reported");
  });

  it("calls a card that mixes computed and reported costs mixed", () => {
    const result = computeInsights(
      [
        attempt({ taskId: "task-1", model: "sonnet-5", tokensIn: 1_000_000, tokensOut: 0 }),
        attempt({ taskId: "task-1", model: "kimi-for-coding", tokensIn: 0, tokensOut: 0, tokensCache: 0, costUsd: "1.00" }),
      ],
      [],
      prices,
    );
    expect(result.perCard[0]?.costSource).toBe("mixed");
    expect(result.perCard[0]?.costUsd).toBeCloseTo(4);
  });

  it("recomputes when the price changes, with no new attempt data", () => {
    const rows = [attempt({ tokensIn: 1_000_000, tokensOut: 0, tokensCache: 0 })];
    const cheap = computeInsights(rows, [], prices);
    const dear = computeInsights(rows, [], [{ ...prices[0]!, inputPerMtok: 6 }]);
    expect(cheap.totals.costUsd).toBeCloseTo(3);
    expect(dear.totals.costUsd).toBeCloseTo(6);
  });
});

describe("usage in segments per model", () => {
  const prices = [
    { model: "sonnet-5", label: "sonnet-5", inputPerMtok: 3, outputPerMtok: 15, cachePerMtok: 0.3 },
    { model: "opus-5", label: "opus-5", inputPerMtok: 5, outputPerMtok: 25, cachePerMtok: 0.5 },
  ];

  const switched = () =>
    attempt({
      model: "sonnet-5",
      costUsd: null,
      tokensIn: 1_200_000,
      tokensOut: 0,
      tokensCache: 0,
      usageSegments: [
        { model: "sonnet-5", input: 1_000_000 },
        { model: "opus-5", input: 200_000 },
      ],
    });

  it("splits a run that switched model across both model groups", () => {
    const result = computeInsights([switched()], [], prices);

    expect(result.byModel.map((g) => g.label).sort()).toEqual(["opus-5", "sonnet-5"]);
    const sonnet = result.byModel.find((g) => g.label === "sonnet-5");
    const opus = result.byModel.find((g) => g.label === "opus-5");
    expect(sonnet?.tokens).toBe(1_000_000);
    expect(opus?.tokens).toBe(200_000);
    // Each model priced at its own rate: 1M in at $3, 200k in at $5.
    expect(sonnet?.costUsd).toBeCloseTo(3);
    expect(opus?.costUsd).toBeCloseTo(1);
    expect(result.totals.costUsd).toBeCloseTo(4);
    // One attempt, counted once in the totals and once per model it ran.
    expect(result.totals.attempts).toBe(1);
    expect(sonnet?.sharedAttempts).toBe(1);
    expect(opus?.sharedAttempts).toBe(1);
  });

  it("names every model the card ran, in order", () => {
    const result = computeInsights([switched()], [], prices);
    expect(result.perCard[0]?.models).toEqual(["sonnet-5", "opus-5"]);
  });

  it("counts a delivery from a switched run against both models", () => {
    const result = computeInsights(
      [switched()],
      [reopen("task-1", "2026-08-10T13:00:00Z")],
      prices,
    );
    expect(result.reopensByModel).toHaveLength(2);
    expect(result.reopensByModel.every((r) => r.reopened === 1)).toBe(true);
  });

  it("does not split the dollar figure an agent volunteered across models", () => {
    const result = computeInsights(
      [
        attempt({
          model: "kimi-for-coding",
          costUsd: "9.00",
          tokensIn: 2_000,
          tokensOut: 0,
          tokensCache: 0,
          usageSegments: [
            { model: "kimi-for-coding", input: 1_000 },
            { model: "moonshot-x", input: 1_000 },
          ],
        }),
      ],
      [],
      prices,
    );
    // Unpriced on both sides: the attempt keeps the agent's figure once, and
    // neither model group claims a slice of it.
    expect(result.totals.costUsd).toBeCloseTo(9);
    expect(result.byModel.every((g) => g.costUsd === 0)).toBe(true);
    expect(result.byModel.every((g) => g.costUnpriced === 1)).toBe(true);
  });

  it("reads an attempt stored before segments as a single segment", () => {
    const result = computeInsights(
      [attempt({ usageSegments: null, model: "sonnet-5", tokensIn: 1_000_000, tokensOut: 0, tokensCache: 0, costUsd: null })],
      [],
      prices,
    );
    expect(result.byModel).toHaveLength(1);
    expect(result.byModel[0]?.label).toBe("sonnet-5");
    expect(result.byModel[0]?.tokens).toBe(1_000_000);
    expect(result.byModel[0]?.sharedAttempts).toBeUndefined();
    expect(result.totals.costUsd).toBeCloseTo(3);
  });

  it("keeps an attempt that reported nothing under its model", () => {
    const result = computeInsights(
      [
        attempt({
          usageSegments: null,
          tokensIn: null,
          tokensOut: null,
          tokensCache: null,
          costUsd: null,
          durationMs: null,
          turns: null,
        }),
      ],
      [],
      prices,
    );
    expect(result.byModel).toHaveLength(1);
    expect(result.byModel[0]?.label).toBe("sonnet-5");
    expect(result.byModel[0]?.missing).toBe(1);
  });
});
