import { describe, expect, it } from "vitest";
import {
  MAX_OUTPUT_TOKENS_PER_SECOND,
  MAX_TOTAL_TOKENS_PER_SECOND,
  MIN_USAGE_WINDOW_MS,
  checkUsageWindow,
} from "./usage-suspect";

describe("usage claim window guard", () => {
  it("accepts ordinary telemetry even when claim and delivery are very close", () => {
    expect(
      checkUsageWindow(
        { tokens_in: 20_000, tokens_out: 4_000, tokens_cache: 50_000 },
        25,
      ).suspect,
    ).toBe(false);
  });

  it("flags output that could not fit in the claim window", () => {
    const check = checkUsageWindow(
      { tokens_out: 5_000_000 },
      60_000,
    );
    expect(check.suspect).toBe(true);
    expect(check.outputTokens).toBe(5_000_000);
  });

  it("also guards aggregate input and cache throughput", () => {
    const justOver =
      (MIN_USAGE_WINDOW_MS / 1_000) * MAX_TOTAL_TOKENS_PER_SECOND + 1;
    expect(checkUsageWindow({ tokens_cache: justOver }, 1).suspect).toBe(true);
  });

  it("keeps the documented output ceiling stable", () => {
    expect(MAX_OUTPUT_TOKENS_PER_SECOND).toBe(2_000);
  });
});
