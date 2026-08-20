import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  factoryUsageRecipes,
  findUsageRecipe,
  recipeCoverage,
  GENERIC_RECIPE_CLI,
} from "./usage-recipe";

describe("usage collection recipes", () => {
  const recipes = factoryUsageRecipes();

  it("ships one recipe per CLI plus the generic fallback", () => {
    expect(recipes.map((r) => r.cli).sort()).toEqual([
      "claude-code",
      "codex",
      "gemini-cli",
      GENERIC_RECIPE_CLI,
      "grok",
      "kimi",
    ]);
    expect(recipes.every((r) => r.source === "seed")).toBe(true);
  });

  it("gives Claude Code a command that reads its own session transcript", () => {
    const claude = findUsageRecipe(recipes, "claude-code");
    expect(claude?.yields).toBe("tokens_per_model");
    expect(claude?.command).toContain("CLAUDE_CODE_SESSION_ID");
    expect(claude?.command).toContain("cache_read_input_tokens");
    // It has to print the shape task_deliver takes, not a pretty table.
    expect(claude?.command).toContain("segments");
    expect(claude?.command).toContain("OVERCLICK_CLAIMED_AT");
  });

  it("gives Codex a command that attributes each turn to its model", () => {
    const codex = findUsageRecipe(recipes, "codex");
    expect(codex?.yields).toBe("tokens_per_model");
    expect(codex?.command).toContain("rollout-");
    expect(codex?.command).toContain("last_token_usage");
    expect(codex?.command).toContain("turn_context");
    expect(codex?.command).toContain("CODEX_SESSION_ID");
    expect(codex?.command).toContain("CODEX_HARNESS_MODEL");
    expect(codex?.command).not.toContain('model, turns = collections.defaultdict(collections.Counter), "unknown"');
  });

  it("measures an anonymized Codex 0.148 rollout and normalizes its model", () => {
    const codex = findUsageRecipe(recipes, "codex");
    const transcript = fileURLToPath(
      new URL("./fixtures/codex-rollout.jsonl", import.meta.url),
    );
    const output = execFileSync("bash", ["-c", codex!.command], {
      env: {
        ...process.env,
        TRANSCRIPT_PATH: transcript,
        CODEX_HARNESS_MODEL: "should-not-win",
      },
      encoding: "utf8",
    });

    expect(JSON.parse(output)).toMatchObject({
      estimated: false,
      turns: 2,
      segments: [
        {
          model: "gpt-5-6-sol",
          input: 130,
          output: 50,
          cache_read: 260,
          cache_write: 8,
        },
      ],
    });
  });

  it("counts only Codex counters recorded after claimed_at", () => {
    const codex = findUsageRecipe(recipes, "codex");
    const transcript = fileURLToPath(
      new URL("./fixtures/codex-rollout.jsonl", import.meta.url),
    );
    const output = execFileSync("bash", ["-c", codex!.command], {
      env: {
        ...process.env,
        TRANSCRIPT_PATH: transcript,
        CODEX_HARNESS_MODEL: "gpt-5.6-sol",
        OVERCLICK_CLAIMED_AT: "2026-08-18T10:00:02.500Z",
      },
      encoding: "utf8",
    });

    expect(JSON.parse(output)).toMatchObject({
      estimated: false,
      turns: 1,
      segments: [
        {
          model: "gpt-5-6-sol",
          input: 80,
          output: 30,
          cache_read: 160,
          cache_write: 5,
        },
      ],
    });
  });

  it("uses the card harness when a readable Codex rollout omits its model", () => {
    const codex = findUsageRecipe(recipes, "codex");
    const transcript = fileURLToPath(
      new URL("./fixtures/codex-rollout-no-model.jsonl", import.meta.url),
    );
    const output = execFileSync("bash", ["-c", codex!.command], {
      env: {
        ...process.env,
        TRANSCRIPT_PATH: transcript,
        CODEX_HARNESS_MODEL: "gpt-5.3-codex-spark",
      },
      encoding: "utf8",
    });

    expect(JSON.parse(output)).toMatchObject({
      estimated: false,
      segments: [
        {
          model: "gpt-5-3-codex-spark",
          input: 50,
          output: 10,
          cache_read: 25,
        },
      ],
    });
  });

  it("explains why usage must be estimated when the rollout is unavailable", () => {
    const codex = findUsageRecipe(recipes, "codex");
    const output = execFileSync("bash", ["-c", codex!.command], {
      env: {
        ...process.env,
        TRANSCRIPT_PATH: "/definitely/missing/codex-rollout.jsonl",
        CODEX_HARNESS_MODEL: "gpt-5.6-sol",
      },
      encoding: "utf8",
    });
    const parsed = JSON.parse(output);

    expect(parsed.estimated).toBe(true);
    expect(parsed.reason).toContain("missing or unreadable");
    expect(parsed.segments).toEqual([]);
  });

  it("says plainly that Gemini CLI records nothing to total", () => {
    const gemini = findUsageRecipe(recipes, "gemini-cli");
    expect(gemini?.yields).toBe("no_tokens");
    expect(gemini?.command).toBe("");
    expect(gemini?.instructions).toContain("estimated: true");
  });


  it("gives Grok a command that reads the usage its turns close with", () => {
    const grok = findUsageRecipe(recipes, "grok");
    expect(grok?.yields).toBe("tokens_per_model");
    expect(grok?.command).toContain("turn_completed");
    expect(grok?.command).toContain("modelUsage");
    expect(grok?.command).toContain("cachedReadTokens");
    expect(grok?.command).toContain("segments");
    expect(grok?.command).toContain("OVERCLICK_CLAIMED_AT");
  });

  it("counts only Grok updates.jsonl records at or after claimed_at, reading epoch-second timestamps", () => {
    // Grok's own "timestamp" is epoch seconds, not the ISO text the other
    // CLIs write; the same claim-window bug found in Kimi's "time" field was
    // latent here too.
    const grok = findUsageRecipe(recipes, "grok");
    const transcript = fileURLToPath(
      new URL("./fixtures/grok-updates.jsonl", import.meta.url),
    );
    const output = execFileSync("bash", ["-c", grok!.command], {
      env: {
        ...process.env,
        TRANSCRIPT_PATH: transcript,
        OVERCLICK_CLAIMED_AT: "2026-08-18T10:00:00.000Z",
      },
      encoding: "utf8",
    });

    expect(JSON.parse(output)).toMatchObject({
      turns: 2,
      segments: expect.arrayContaining([
        { model: "grok-4.6-build", input: 300, output: 300, cache_read: 900, cache_write: 10 },
        { model: "grok-4.6-fast", input: 400, output: 90, cache_read: 200, cache_write: 0 },
      ]),
    });
  });

  it("gives Kimi a command that totals every agent's wire log", () => {
    const kimi = findUsageRecipe(recipes, "kimi");
    expect(kimi?.yields).toBe("tokens_per_model");
    expect(kimi?.command).toContain("usage.record");
    expect(kimi?.command).toContain("session_index.jsonl");
    // The cumulative record at the end would count the run twice.
    expect(kimi?.command).toContain('usageScope") != "turn"');
    expect(kimi?.command).toContain("segments");
    expect(kimi?.command).toContain("OVERCLICK_CLAIMED_AT");
    // wire.jsonl stamps records with "time", not "timestamp"; the field has
    // to be in the list the claim-window filter reads.
    expect(kimi?.command).toContain('entry.get("time")');
  });

  it("measures a real wire.jsonl session, merging every agent and skipping the cumulative session record", () => {
    const kimi = findUsageRecipe(recipes, "kimi");
    const session = fileURLToPath(
      new URL("./fixtures/kimi-session", import.meta.url),
    );
    const output = execFileSync("bash", ["-c", kimi!.command], {
      env: { ...process.env, TRANSCRIPT_PATH: session },
      encoding: "utf8",
    });

    expect(JSON.parse(output)).toMatchObject({
      turns: 4,
      segments: expect.arrayContaining([
        { model: "kimi-code/k3", input: 1060, output: 115, cache_read: 460, cache_write: 5 },
        { model: "kimi-code/k3-mini", input: 40, output: 10, cache_read: 0, cache_write: 0 },
      ]),
    });
  });

  it("counts only Kimi wire.jsonl records at or after claimed_at, reading the time field", () => {
    const kimi = findUsageRecipe(recipes, "kimi");
    const session = fileURLToPath(
      new URL("./fixtures/kimi-session", import.meta.url),
    );
    const output = execFileSync("bash", ["-c", kimi!.command], {
      env: {
        ...process.env,
        TRANSCRIPT_PATH: session,
        OVERCLICK_CLAIMED_AT: "2026-08-19T18:14:39.899Z",
      },
      encoding: "utf8",
    });

    expect(JSON.parse(output)).toMatchObject({
      turns: 3,
      segments: expect.arrayContaining([
        { model: "kimi-code/k3", input: 160, output: 35, cache_read: 60, cache_write: 5 },
        { model: "kimi-code/k3-mini", input: 40, output: 10, cache_read: 0, cache_write: 0 },
      ]),
    });
  });

  describe("coverage", () => {
    const executors = [
      { id: "claude-code", label: "Claude Code" },
      { id: "grok", label: "Grok" },
      { id: "cursor", label: "Cursor" },
    ];

    it("separates the CLIs with their own recipe from the ones falling back", () => {
      expect(recipeCoverage(recipes, executors)).toEqual([
        { cli: "claude-code", label: "Claude Code", covered: true },
        { cli: "grok", label: "Grok", covered: true },
        { cli: "cursor", label: "Cursor", covered: false },
      ]);
    });

    it("never counts the generic recipe as covering a CLI named generic", () => {
      const rows = recipeCoverage(recipes, [
        { id: GENERIC_RECIPE_CLI, label: "Any other CLI" },
      ]);
      expect(rows).toEqual([
        { cli: GENERIC_RECIPE_CLI, label: "Any other CLI", covered: false },
      ]);
    });

    it("matches the CLI case-insensitively and lists each one once", () => {
      const rows = recipeCoverage(recipes, [
        { id: "KIMI", label: "Kimi" },
        { id: "kimi", label: "Kimi again" },
      ]);
      expect(rows).toEqual([{ cli: "kimi", label: "Kimi", covered: true }]);
    });

    it("counts a workspace recipe with no command as covering the CLI", () => {
      // Gemini's shipped recipe honestly says there is nothing on disk. It is
      // still its own recipe, not the generic fallback.
      const rows = recipeCoverage(recipes, [
        { id: "gemini-cli", label: "Gemini" },
      ]);
      expect(rows).toEqual([
        { cli: "gemini-cli", label: "Gemini", covered: true },
      ]);
    });
  });

  it("falls back to the generic recipe, never to nothing", () => {
    expect(findUsageRecipe(recipes, "some-new-cli")?.cli).toBe(GENERIC_RECIPE_CLI);
    expect(findUsageRecipe(recipes, null)?.cli).toBe(GENERIC_RECIPE_CLI);
    expect(findUsageRecipe(recipes, "")?.cli).toBe(GENERIC_RECIPE_CLI);
  });

  it("matches the CLI case-insensitively", () => {
    expect(findUsageRecipe(recipes, "Claude-Code")?.cli).toBe("claude-code");
  });

  it("prefers a recipe the workspace rewrote over the shipped one", () => {
    const custom = recipes.map((r) =>
      r.cli === "codex"
        ? { ...r, command: "my-own-command", source: "custom" as const }
        : r,
    );
    expect(findUsageRecipe(custom, "codex")?.command).toBe("my-own-command");
  });
});
