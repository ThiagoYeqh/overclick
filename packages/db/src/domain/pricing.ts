/**
 * Model prices and the arithmetic the board owns.
 *
 * Tokens are the fact an agent reports; dollars are arithmetic. Everything
 * here is pure so the web app, the MCP layer and the tests share one answer.
 */

import {
  segmentTokenCounts,
  segmentTotalTokens,
  type UsageSegment,
} from "./usage";

/** One model's price, in US dollars per million tokens. */
export type ModelPrice = {
  /** Normalized key (see normalizeModelKey). */
  model: string;
  /** Display name, as the price list or the human wrote it. */
  label: string;
  inputPerMtok: number;
  outputPerMtok: number;
  /**
   * Price applied to the `tokens_cache` counter the usage contract carries.
   * Seeded at the cache READ rate, which is what a long agent session is
   * mostly made of; edit the row when your provider bills you otherwise.
   */
  cachePerMtok: number;
};

/** Where a price came from: the seeded public list, or a human edit. */
export type PriceSource = "seed" | "custom";

/** A price row as the board shows it: the numbers plus their provenance. */
export type ModelPriceRow = ModelPrice & {
  source: PriceSource;
  /** Date the seeded public prices were captured. Null on an edited row. */
  seededAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

/**
 * The day the prices below were read off the public price lists. Stamped on
 * every seeded row so nobody has to guess how old a number is.
 */
export const MODEL_PRICES_SEEDED_AT = "2026-08-16";

/**
 * Public list prices, per million tokens, captured on MODEL_PRICES_SEEDED_AT.
 *
 * Only models whose public price is published as a plain per-million rate are
 * seeded. A model the board has never been told the price of stays unpriced
 * and shows up in Settings waiting for a number: inventing a price would be
 * worse than admitting there isn't one.
 */
const SEED: ModelPrice[] = [
  { model: "fable-5", label: "fable-5", inputPerMtok: 10, outputPerMtok: 50, cachePerMtok: 1 },
  { model: "opus-5", label: "opus-5", inputPerMtok: 5, outputPerMtok: 25, cachePerMtok: 0.5 },
  { model: "opus-4-8", label: "opus-4-8", inputPerMtok: 5, outputPerMtok: 25, cachePerMtok: 0.5 },
  { model: "sonnet-5", label: "sonnet-5", inputPerMtok: 3, outputPerMtok: 15, cachePerMtok: 0.3 },
  { model: "haiku-4-5", label: "haiku-4-5", inputPerMtok: 1, outputPerMtok: 5, cachePerMtok: 0.1 },
];

/** The seeded price list, stamped with the date it was captured. */
export function factoryModelPrices(): ModelPriceRow[] {
  return SEED.map((price) => ({
    ...price,
    source: "seed" as const,
    seededAt: MODEL_PRICES_SEEDED_AT,
    updatedBy: null,
    updatedAt: null,
  }));
}

/**
 * One key for the many spellings of the same model. Agents send the binary's
 * name ("claude-opus-5"), the board's catalog says "opus-5", and a dated
 * snapshot adds a suffix; all three have to hit the same price row.
 */
export function normalizeModelKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z0-9_.-]+\//, "")
    .replace(/-\d{8}$/, "")
    .replace(/\./g, "-")
    .replace(/^claude-/, "");
}

/** The price for a model, or null when nobody has priced it yet. */
export function findModelPrice<T extends ModelPrice>(
  prices: readonly T[],
  model: string | null | undefined,
): T | null {
  if (!model) return null;
  const key = normalizeModelKey(model);
  if (!key) return null;
  return prices.find((price) => normalizeModelKey(price.model) === key) ?? null;
}

export type TokenCounts = {
  input?: number | null;
  output?: number | null;
  cache?: number | null;
};

/** Sum of the token counters, treating a missing counter as zero. */
export function totalTokens(tokens: TokenCounts): number {
  return (tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.cache ?? 0);
}

/** Dollars for these tokens at this price, rounded to the stored precision. */
export function computeCostUsd(price: ModelPrice, tokens: TokenCounts): number {
  const cost =
    ((tokens.input ?? 0) * price.inputPerMtok +
      (tokens.output ?? 0) * price.outputPerMtok +
      (tokens.cache ?? 0) * price.cachePerMtok) /
    1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

/**
 * Where a dollar figure came from:
 * - `computed`: the board multiplied reported tokens by the price table
 * - `reported`: the agent sent a cost and the board had no price to compute
 * - `estimated`: same, and the agent flagged its own numbers as a guess
 */
export type CostSource = "computed" | "reported" | "estimated";

export type AttemptUsage = {
  tokensIn?: number | null;
  tokensOut?: number | null;
  tokensCache?: number | null;
  /** What the agent volunteered. Only used when the table cannot price it. */
  costUsd?: number | null;
  usageEstimated?: boolean;
};

export type ResolvedCost = {
  /** Null when nothing can be said. Never a silent zero. */
  costUsd: number | null;
  source: CostSource | null;
};

/**
 * The cost of one attempt and the label that has to travel with it. Tokens
 * plus a price beat the agent's own number every time: the board knows the
 * current prices, and no CLI reliably does.
 */
export function resolveAttemptCost(
  attempt: AttemptUsage,
  prices: readonly ModelPrice[],
  model: string | null | undefined,
): ResolvedCost {
  const tokens: TokenCounts = {
    input: attempt.tokensIn,
    output: attempt.tokensOut,
    cache: attempt.tokensCache,
  };
  if (totalTokens(tokens) > 0) {
    const price = findModelPrice(prices, model);
    if (price) {
      return { costUsd: computeCostUsd(price, tokens), source: "computed" };
    }
  }
  if (attempt.costUsd != null) {
    return {
      costUsd: Number(attempt.costUsd),
      source: attempt.usageEstimated ? "estimated" : "reported",
    };
  }
  return { costUsd: null, source: null };
}

/**
 * The cost of a run recorded in segments: every model priced at its own rate
 * and added up, which is the only honest answer once a run switched model. The
 * figure the agent volunteered is the fallback, used when the price table
 * cannot cover every model the run touched. Splitting that one figure across
 * models would be inventing numbers, so it is never divided.
 */
export function resolveSegmentedCost(
  segments: readonly UsageSegment[],
  prices: readonly ModelPrice[],
  fallback: { costUsd?: number | null; usageEstimated?: boolean },
): ResolvedCost {
  if (areSegmentsPriced(segments, prices)) {
    let sum = 0;
    for (const segment of segments) {
      const price = findModelPrice(prices, segment.model);
      if (price) sum += computeCostUsd(price, segmentTokenCounts(segment));
    }
    return { costUsd: Math.round(sum * 1e6) / 1e6, source: "computed" };
  }
  if (fallback.costUsd != null) {
    return {
      costUsd: Number(fallback.costUsd),
      source: fallback.usageEstimated ? "estimated" : "reported",
    };
  }
  return { costUsd: null, source: null };
}

/** True when every segment that carries tokens has a price to be read at. */
export function areSegmentsPriced(
  segments: readonly UsageSegment[],
  prices: readonly ModelPrice[],
): boolean {
  const spending = segments.filter((s) => segmentTotalTokens(s) > 0);
  return (
    spending.length > 0 &&
    spending.every((s) => findModelPrice(prices, s.model) != null)
  );
}

/**
 * The label for a set of costs added together. Mixed provenance is named as
 * such instead of borrowing the most flattering one.
 */
export function mergeCostSources(
  sources: readonly (CostSource | null)[],
): CostSource | "mixed" | null {
  const present = [...new Set(sources.filter((s): s is CostSource => s != null))];
  if (present.length === 0) return null;
  if (present.length === 1) return present[0] ?? null;
  return "mixed";
}
