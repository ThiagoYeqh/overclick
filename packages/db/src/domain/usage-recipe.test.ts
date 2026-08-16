import { describe, expect, it } from "vitest";
import {
  factoryUsageRecipes,
  findUsageRecipe,
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
  });

  it("gives Codex a command that attributes each turn to its model", () => {
    const codex = findUsageRecipe(recipes, "codex");
    expect(codex?.yields).toBe("tokens_per_model");
    expect(codex?.command).toContain("rollout-");
    expect(codex?.command).toContain("last_token_usage");
    expect(codex?.command).toContain("turn_context");
  });

  it("says plainly that Gemini CLI records nothing to total", () => {
    const gemini = findUsageRecipe(recipes, "gemini-cli");
    expect(gemini?.yields).toBe("no_tokens");
    expect(gemini?.command).toBe("");
    expect(gemini?.instructions).toContain("estimated: true");
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
