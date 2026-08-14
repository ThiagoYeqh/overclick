import { describe, expect, it } from "vitest";
import { aggregateInsights } from "./aggregate";

describe("aggregateInsights", () => {
  it("sums cost, duration, and token components from every attempt", () => {
    const summary = aggregateInsights([
      {
        telemetryIncomplete: false,
        attempts: [
          { costUsd: "1.25", durationMs: 8_000, tokensIn: 100, tokensOut: 40, tokensCache: 10 },
          { costUsd: "0.5", durationMs: 4_000, tokensIn: 50, tokensOut: 100, tokensCache: 50 },
        ],
        handoffs: [],
      },
    ]);

    expect(summary).toEqual({
      totalCostUsd: 1.75,
      totalTokens: 350,
      totalDurationMs: 12_000,
      incompleteTelemetryCount: 0,
    });
  });

  it("counts incomplete tasks once even when their telemetry is missing", () => {
    const summary = aggregateInsights([
      { telemetryIncomplete: true, attempts: [], handoffs: [] },
      {
        telemetryIncomplete: true,
        attempts: [{ costUsd: null, durationMs: null, tokensIn: null, tokensOut: null, tokensCache: null }],
        handoffs: [],
      },
    ]);

    expect(summary.incompleteTelemetryCount).toBe(2);
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.totalTokens).toBe(0);
    expect(summary.totalDurationMs).toBe(0);
  });

  it("includes unlinked handoff usage but excludes linked duplicate usage", () => {
    const summary = aggregateInsights([
      {
        telemetryIncomplete: false,
        attempts: [{ costUsd: "2", durationMs: 2_000, tokensIn: 20, tokensOut: 10, tokensCache: 5 }],
        handoffs: [
          {
            attemptId: "attempt-1",
            usage: { costUsd: 2, durationMs: 2_000, tokensIn: 20, tokensOut: 10, tokensCache: 5 },
          },
          {
            attemptId: null,
            usage: { costUsd: 0.25, durationMs: 500, tokensIn: 5, tokensOut: 3, tokensCache: 2 },
          },
        ],
      },
    ]);

    expect(summary).toEqual({
      totalCostUsd: 2.25,
      totalTokens: 45,
      totalDurationMs: 2_500,
      incompleteTelemetryCount: 0,
    });
  });
});
