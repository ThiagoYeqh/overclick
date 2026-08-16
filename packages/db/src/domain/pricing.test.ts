import { describe, expect, it } from "vitest";
import {
  areSegmentsPriced,
  computeCostUsd,
  factoryModelPrices,
  findModelPrice,
  mergeCostSources,
  MODEL_PRICES_SEEDED_AT,
  normalizeModelKey,
  resolveAttemptCost,
  resolveSegmentedCost,
  type ModelPrice,
} from "./pricing";

const PRICES: ModelPrice[] = [
  { model: "opus-5", label: "opus-5", inputPerMtok: 5, outputPerMtok: 25, cachePerMtok: 0.5 },
  { model: "haiku-4-5", label: "haiku-4-5", inputPerMtok: 1, outputPerMtok: 5, cachePerMtok: 0.1 },
];

describe("model key normalization", () => {
  it("maps the binary name an agent sends to the catalog key", () => {
    expect(normalizeModelKey("claude-opus-5")).toBe("opus-5");
    expect(normalizeModelKey("  Claude-Opus-5 ")).toBe("opus-5");
  });

  it("drops vendor prefixes and dated snapshots", () => {
    expect(normalizeModelKey("anthropic/claude-haiku-4-5-20251001")).toBe("haiku-4-5");
  });

  it("treats dots and dashes as the same separator", () => {
    expect(normalizeModelKey("haiku-4.5")).toBe("haiku-4-5");
  });

  it("leaves an unknown model as its own key", () => {
    expect(normalizeModelKey("gpt-5.6-sol")).toBe("gpt-5-6-sol");
  });
});

describe("price lookup", () => {
  it("finds a price through any spelling", () => {
    expect(findModelPrice(PRICES, "claude-opus-5")?.model).toBe("opus-5");
    expect(findModelPrice(PRICES, "OPUS-5")?.model).toBe("opus-5");
  });

  it("returns null for an unpriced model instead of guessing", () => {
    expect(findModelPrice(PRICES, "kimi-for-coding")).toBeNull();
    expect(findModelPrice(PRICES, null)).toBeNull();
  });
});

describe("cost arithmetic", () => {
  it("prices input, output and cache per million tokens", () => {
    const price = PRICES[0]!;
    expect(
      computeCostUsd(price, { input: 1_000_000, output: 1_000_000, cache: 1_000_000 }),
    ).toBe(30.5);
  });

  it("rounds to the precision the column stores", () => {
    expect(computeCostUsd(PRICES[1]!, { input: 1 })).toBe(0.000001);
  });
});

describe("cost source ladder", () => {
  it("computes from tokens and labels it computed, ignoring the agent's number", () => {
    const resolved = resolveAttemptCost(
      { tokensIn: 200_000, tokensOut: 20_000, costUsd: 99 },
      PRICES,
      "claude-opus-5",
    );
    expect(resolved).toEqual({ costUsd: 1.5, source: "computed" });
  });

  it("falls back to the reported cost when the model has no price", () => {
    const resolved = resolveAttemptCost(
      { tokensIn: 1000, costUsd: 0.42 },
      PRICES,
      "kimi-for-coding",
    );
    expect(resolved).toEqual({ costUsd: 0.42, source: "reported" });
  });

  it("labels a reported cost the executor guessed as estimated", () => {
    const resolved = resolveAttemptCost(
      { costUsd: 0.42, usageEstimated: true },
      PRICES,
      "kimi-for-coding",
    );
    expect(resolved).toEqual({ costUsd: 0.42, source: "estimated" });
  });

  it("says nothing when there are neither tokens nor a cost", () => {
    expect(resolveAttemptCost({}, PRICES, "claude-opus-5")).toEqual({
      costUsd: null,
      source: null,
    });
  });

  it("names mixed provenance instead of picking the nicest label", () => {
    expect(mergeCostSources(["computed", "computed"])).toBe("computed");
    expect(mergeCostSources(["computed", "reported"])).toBe("mixed");
    expect(mergeCostSources([null, null])).toBeNull();
  });
});

describe("seeded price list", () => {
  it("stamps every row with the date the prices were captured", () => {
    const rows = factoryModelPrices();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.source).toBe("seed");
      expect(row.seededAt).toBe(MODEL_PRICES_SEEDED_AT);
      expect(row.model).toBe(normalizeModelKey(row.model));
      expect(row.outputPerMtok).toBeGreaterThan(0);
    }
  });
});

describe("cost of a run recorded in segments", () => {
  const prices = [
    { model: "sonnet-5", label: "sonnet-5", inputPerMtok: 3, outputPerMtok: 15, cachePerMtok: 0.3 },
    { model: "opus-5", label: "opus-5", inputPerMtok: 5, outputPerMtok: 25, cachePerMtok: 0.5 },
  ];

  it("prices every model at its own rate instead of the run at one", () => {
    const cost = resolveSegmentedCost(
      [
        { model: "sonnet-5", input: 1_000_000 },
        { model: "opus-5", input: 1_000_000 },
      ],
      prices,
      { costUsd: 99 },
    );
    expect(cost.costUsd).toBeCloseTo(8);
    expect(cost.source).toBe("computed");
  });

  it("falls back to the agent's figure when one model has no price", () => {
    const cost = resolveSegmentedCost(
      [
        { model: "sonnet-5", input: 1_000_000 },
        { model: "kimi-for-coding", input: 1_000_000 },
      ],
      prices,
      { costUsd: 2.5, usageEstimated: true },
    );
    expect(cost.costUsd).toBeCloseTo(2.5);
    expect(cost.source).toBe("estimated");
  });

  it("says nothing when there is neither a price nor a reported figure", () => {
    const cost = resolveSegmentedCost(
      [{ model: "kimi-for-coding", input: 10 }],
      prices,
      {},
    );
    expect(cost.costUsd).toBeNull();
    expect(cost.source).toBeNull();
  });

  it("counts a run priced end to end as priced", () => {
    expect(
      areSegmentsPriced([{ model: "opus-5", input: 10 }], prices),
    ).toBe(true);
    expect(
      areSegmentsPriced([{ model: "kimi-for-coding", input: 10 }], prices),
    ).toBe(false);
    // No tokens anywhere: nothing to price, so nothing to claim as priced.
    expect(areSegmentsPriced([{ model: "opus-5" }], prices)).toBe(false);
  });
});
