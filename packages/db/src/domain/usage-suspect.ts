import type { SegmentedUsage } from "./usage";

/**
 * A claim can legitimately read a large cached prompt very quickly, but it
 * cannot produce an unbounded number of tokens. These ceilings are purposely
 * generous: they catch a whole-session total without second-guessing ordinary
 * runs. The one-minute floor keeps very fast integration/delivery round trips
 * from being flagged just because the server window is only a few milliseconds.
 */
export const MIN_USAGE_WINDOW_MS = 60_000;
export const MAX_TOTAL_TOKENS_PER_SECOND = 50_000;
export const MAX_OUTPUT_TOKENS_PER_SECOND = 2_000;

export type UsageWindowCheck = {
  suspect: boolean;
  totalTokens: number;
  outputTokens: number;
  windowMs: number;
};

function counter(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Tests whether the reported counters could fit between claim and delivery.
 * The resolved usage shape already mirrors segments into the flat counters,
 * so reading the flat values avoids counting the same tokens twice.
 */
export function checkUsageWindow(
  usage: SegmentedUsage | null | undefined,
  measuredWindowMs: number,
): UsageWindowCheck {
  const windowMs = Math.max(MIN_USAGE_WINDOW_MS, measuredWindowMs, 0);
  const totalTokens =
    counter(usage?.tokens_in) +
    counter(usage?.tokens_out) +
    counter(usage?.tokens_cache);
  const outputTokens = counter(usage?.tokens_out);
  const seconds = windowMs / 1_000;
  const suspect =
    totalTokens > seconds * MAX_TOTAL_TOKENS_PER_SECOND ||
    outputTokens > seconds * MAX_OUTPUT_TOKENS_PER_SECOND;

  return { suspect, totalTokens, outputTokens, windowMs };
}
