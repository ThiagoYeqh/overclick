import { describe, expect, it } from "vitest";
import {
  CARDAPIO_TASK_TYPES,
  DEFAULT_CARDAPIO,
  FACTORY_CARDAPIO_POLICY,
  lookupCardapioPolicy,
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
  it("seeds bug → mid model · medium", () => {
    expect(DEFAULT_CARDAPIO.bug).toEqual({
      model_tier: "mid",
      effort: "medium",
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
    });
  });
});

describe("factory cardápio policy (explicit table)", () => {
  it("seeds one row per activity type with CLI · model · effort and no skills", () => {
    expect(FACTORY_CARDAPIO_POLICY.map((row) => row.type)).toEqual([
      ...CARDAPIO_TASK_TYPES,
    ]);
    expect(FACTORY_CARDAPIO_POLICY.find((row) => row.type === "bug")).toEqual({
      type: "bug",
      cli: null,
      model: "sonnet-5",
      effort: "medium",
    });
    expect(FACTORY_CARDAPIO_POLICY[0]).not.toHaveProperty("skills");
    expect(FACTORY_CARDAPIO_POLICY.find((row) => row.type === "rfc")).toMatchObject({
      model: "opus-4-8",
      effort: "high",
      cli: null,
    });
    expect(FACTORY_CARDAPIO_POLICY.find((row) => row.type === "mechanical")).toMatchObject({
      model: "haiku-4",
      effort: "low",
    });
  });

  it("looks up a stored row and falls back to factory when the type is missing", () => {
    const edited = lookupCardapioPolicy(
      [
        {
          type: "bug",
          cli: "codex",
          model: "gpt-5",
          effort: "high",
        },
      ],
      "bug",
    );
    expect(edited).toEqual({
      type: "bug",
      cli: "codex",
      model: "gpt-5",
      effort: "high",
    });

    const fallback = lookupCardapioPolicy(
      [{ type: "bug", cli: null, model: "gpt-4.1", effort: "low" }],
      "mechanical",
    );
    expect(fallback).toEqual({
      type: "mechanical",
      cli: null,
      model: "haiku-4",
      effort: "low",
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
    expect(result.value.harness).not.toHaveProperty("skills");
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
        cli: "overclock",
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
      explicit: { model: "mystery-model", effort: "medium" },
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
        bug: { model_tier: "top", effort: "high" },
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

describe("harness recommendation as stored-policy lookup", () => {
  it("returns the stored policy row, not a tier heuristic", () => {
    const result = recommendHarness({
      type: "bug",
      executors: mixedExecutors,
      policy: [
        {
          type: "bug",
          cli: "codex",
          model: "gpt-5",
          effort: "high",
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source).toBe("cardapio");
    expect(result.value.harness).toEqual({
      cli: "codex",
      model: "gpt-5",
      effort: "high",
    });
    expect(result.value.harness).not.toHaveProperty("skills");
    expect(result.value.matched_executor).toEqual({
      id: "cli-codex",
      cli: "codex",
      model: "gpt-5",
    });
  });

  it("falls back to factory defaults when the type is missing from the stored policy", () => {
    const result = recommendHarness({
      type: "mechanical",
      executors: mixedExecutors,
      policy: [
        {
          type: "bug",
          cli: "codex",
          model: "gpt-5",
          effort: "low",
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.harness.model).toBe("haiku-4");
    expect(result.value.harness.effort).toBe("low");
    expect(result.value.harness.cli).toBeNull();
    expect(result.value.harness).not.toHaveProperty("skills");
  });
});
