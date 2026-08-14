import { describe, expect, it } from "vitest";
import {
  DEFAULT_CARDAPIO,
  recommendHarness,
  type ConfiguredExecutor,
} from "../src/index.js";

const mixedExecutors: ConfiguredExecutor[] = [
  {
    id: "cli-overclock",
    cli: "overclock",
    models: ["opus-4-8", "sonnet-5", "haiku-4"],
  },
  {
    id: "cli-codex",
    cli: "codex",
    models: ["gpt-5"],
  },
];

describe("default cardápio matrix", () => {
  it("seeds bug → mid model · medium + fix skill", () => {
    expect(DEFAULT_CARDAPIO.bug).toEqual({
      model_tier: "mid",
      effort: "medium",
      skills: ["qa-fix-protocol"],
    });
  });

  it("seeds rfc and architecture → top model · high", () => {
    expect(DEFAULT_CARDAPIO.rfc).toMatchObject({
      model_tier: "top",
      effort: "high",
    });
    expect(DEFAULT_CARDAPIO.architecture).toMatchObject({
      model_tier: "top",
      effort: "high",
    });
  });

  it("seeds mechanical → cheap · low", () => {
    expect(DEFAULT_CARDAPIO.mechanical).toEqual({
      model_tier: "cheap",
      effort: "low",
      skills: [],
    });
  });
});

describe("harness recommendation (cardápio × executors)", () => {
  it("intersects a bug with a mid-tier model from the configured executors", () => {
    const result = recommendHarness({
      type: "bug",
      executors: mixedExecutors,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.available).toBe(true);
    expect(result.value.harness.model).toBe("sonnet-5");
    expect(result.value.harness.effort).toBe("medium");
    expect(result.value.harness.skills).toEqual(["qa-fix-protocol"]);
    expect(result.value.model_tier).toBe("mid");
    expect(result.value.matched_executor).toEqual({
      id: "cli-overclock",
      cli: "overclock",
      model: "sonnet-5",
    });
  });

  it("picks a top-tier model for rfc, not the cheaper ones also configured", () => {
    const result = recommendHarness({
      type: "rfc",
      executors: mixedExecutors,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.harness.model).toBe("opus-4-8");
    expect(result.value.harness.effort).toBe("high");
    expect(result.value.model_tier).toBe("top");
  });

  it("picks a cheap model for mechanical work", () => {
    const result = recommendHarness({
      type: "mechanical",
      executors: mixedExecutors,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.harness.model).toBe("haiku-4");
    expect(result.value.harness.effort).toBe("low");
    expect(result.value.model_tier).toBe("cheap");
  });

  it("returns available:false when no executor has a matching-tier model", () => {
    const result = recommendHarness({
      type: "rfc",
      executors: [
        { id: "only-cheap", cli: "other", models: ["haiku-4"] },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.available).toBe(false);
    expect(result.value.harness.model).toBeNull();
    expect(result.value.model_tier).toBe("top");
    expect(result.value.harness.effort).toBe("high");
    expect(result.value.matched_executor).toBeNull();
  });

  it("returns available:false when no executors are configured", () => {
    const result = recommendHarness({ type: "bug", executors: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.available).toBe(false);
    expect(result.value.model_tier).toBe("mid");
  });

  it("uses an explicit harness when the creator declares one", () => {
    const result = recommendHarness({
      type: "bug",
      executors: mixedExecutors,
      explicit: {
        model: "opus-4-8",
        effort: "high",
        skills: ["systematic-debugging"],
        agent: "qa-swarm-worker",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source).toBe("explicit");
    expect(result.value.harness.model).toBe("opus-4-8");
    expect(result.value.harness.effort).toBe("high");
    expect(result.value.available).toBe(true);
    expect(result.value.divergence).toBeUndefined();
  });

  it("warns when the explicit model is not in the configured executors", () => {
    const result = recommendHarness({
      type: "bug",
      executors: mixedExecutors,
      explicit: { model: "mystery-model", effort: "medium", skills: [] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source).toBe("explicit");
    expect(result.value.available).toBe(false);
    expect(result.value.divergence).toMatch(/mystery-model/);
  });

  it("lets a workspace override the default cardápio matrix", () => {
    const result = recommendHarness({
      type: "bug",
      executors: mixedExecutors,
      cardapio: {
        ...DEFAULT_CARDAPIO,
        bug: { model_tier: "top", effort: "high", skills: ["qa-fix-protocol"] },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.harness.model).toBe("opus-4-8");
    expect(result.value.harness.effort).toBe("high");
  });

  it("matches models by alias (sonnet → sonnet-5)", () => {
    const result = recommendHarness({
      type: "bug",
      executors: [{ id: "cc", cli: "claude-code", models: ["sonnet"] }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.available).toBe(true);
    expect(result.value.harness.model).toBe("sonnet");
  });
});
