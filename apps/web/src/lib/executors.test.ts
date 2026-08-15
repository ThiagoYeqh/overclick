import { describe, expect, it } from "vitest";
import {
  CUSTOM_EXECUTOR_ID,
  EXECUTOR_CATALOG,
  addModelToSelection,
  cardapioLabel,
  isPairInConfig,
  learnedExecutorDefs,
  removeModelFromSelection,
  resolveCatalogCli,
  selectionFromConfig,
} from "./executors";

describe("executor catalog", () => {
  it("ships the 10 onboarding CLIs, no repeated ids", () => {
    expect(EXECUTOR_CATALOG).toHaveLength(10);
    expect(new Set(EXECUTOR_CATALOG.map((d) => d.id)).size).toBe(10);
    expect(EXECUTOR_CATALOG.every((d) => d.models.length > 0)).toBe(true);
  });
});

describe("selectionFromConfig", () => {
  it("ignores disabled executors and empty non-catalog entries", () => {
    const sel = selectionFromConfig([
      { id: "claude-code", label: "Claude Code", enabled: true, models: ["fable-5"] },
      { id: "codex", label: "Codex", enabled: false, models: ["gpt-5.6-sol"] },
      { id: "aider", label: "Aider", enabled: true, models: [] },
    ]);
    expect(sel.enabled).toEqual({ "claude-code": ["fable-5"] });
    expect(sel.labels).toEqual({});
  });

  it("keeps executors learned from real connections and their labels", () => {
    const sel = selectionFromConfig([
      { id: "aider", label: "aider", enabled: true, models: ["aider-pro"], catalog: ["aider-pro"] },
    ]);
    expect(sel.enabled.aider).toEqual(["aider-pro"]);
    expect(sel.labels.aider).toBe("aider");
    expect(learnedExecutorDefs(sel)).toEqual([
      { id: "aider", label: "aider", models: ["aider-pro"] },
    ]);
  });

  it("falls back to the catalog's first model when the config came without one", () => {
    const sel = selectionFromConfig([
      { id: "grok", label: "Grok", enabled: true, models: [] },
    ]);
    expect(sel.enabled.grok).toEqual(["grok-4.6"]);
  });

  it("recognizes the custom CLI and keeps the user-given name", () => {
    const sel = selectionFromConfig([
      { id: CUSTOM_EXECUTOR_ID, label: "Our internal agent", enabled: true, models: [] },
    ]);
    expect(sel.customEnabled).toBe(true);
    expect(sel.customName).toBe("Our internal agent");
  });

  it("does not treat the generic MCP factory label as a chosen name", () => {
    for (const label of ["Other (generic MCP)", "Outro (MCP genérico)"]) {
      const sel = selectionFromConfig([
        { id: CUSTOM_EXECUTOR_ID, label, enabled: true, models: [] },
      ]);
      expect(sel.customEnabled).toBe(true);
      expect(sel.customName).toBe("");
    }
  });

  it("does not leak the config's models array reference", () => {
    const models = ["fable-5"];
    const sel = selectionFromConfig([
      { id: "claude-code", label: "Claude Code", enabled: true, models },
    ]);
    sel.enabled["claude-code"]?.push("haiku-4-5");
    expect(models).toEqual(["fable-5"]);
  });
});

describe("editable model catalog", () => {
  it("seeds the editable list from the built-in suggestion on a fresh config", () => {
    const sel = selectionFromConfig([]);
    expect(sel.models.grok).toEqual(["grok-4.6", "grok-4.5", "grok-composer-2.5-fast"]);
    expect(sel.models["claude-code"]).toEqual(EXECUTOR_CATALOG[0]?.models);
  });

  it("keeps custom checked models from a config saved before the catalog field", () => {
    const sel = selectionFromConfig([
      { id: "grok", label: "Grok", enabled: true, models: ["grok-4.6", "grok-5-beta"] },
    ]);
    expect(sel.models.grok).toContain("grok-5-beta");
    expect(sel.enabled.grok).toEqual(["grok-4.6", "grok-5-beta"]);
  });

  it("honors a persisted catalog even when it drops built-in suggestions", () => {
    const sel = selectionFromConfig([
      { id: "grok", label: "Grok", enabled: true, models: [], catalog: ["grok-5"] },
    ]);
    expect(sel.models.grok).toEqual(["grok-5"]);
    expect(sel.enabled.grok).toEqual(["grok-5"]);
  });

  it("addModelToSelection trims, dedupes and checks the model on an enabled CLI", () => {
    const base = selectionFromConfig([
      { id: "grok", label: "Grok", enabled: true, models: ["grok-4.6"] },
    ]);
    const added = addModelToSelection(base, "grok", "  grok-4.7  ");
    expect(added.models.grok).toContain("grok-4.7");
    expect(added.enabled.grok).toContain("grok-4.7");
    expect(addModelToSelection(added, "grok", "grok-4.7").models.grok).toEqual(
      added.models.grok,
    );
    expect(addModelToSelection(added, "grok", "   ")).toBe(added);
  });

  it("removeModelFromSelection drops the chip and unchecks it", () => {
    const base = selectionFromConfig([
      { id: "grok", label: "Grok", enabled: true, models: ["grok-4.6", "grok-4.5"] },
    ]);
    const removed = removeModelFromSelection(base, "grok", "grok-4.6");
    expect(removed.models.grok).not.toContain("grok-4.6");
    expect(removed.enabled.grok).toEqual(["grok-4.5"]);
  });
});

describe("learning executors from connections", () => {
  it("resolves the names agents actually send to catalog ids", () => {
    expect(resolveCatalogCli("claude")).toBe("claude-code");
    expect(resolveCatalogCli("Claude-Code")).toBe("claude-code");
    expect(resolveCatalogCli("gemini")).toBe("gemini-cli");
    expect(resolveCatalogCli("codex")).toBe("codex");
    expect(resolveCatalogCli("some-new-cli")).toBeNull();
    expect(resolveCatalogCli("  ")).toBeNull();
  });

  it("isPairInConfig matches enabled executors, alias-aware and case-insensitive", () => {
    const config = [
      { id: "claude-code", enabled: true, models: ["sonnet-5"] },
      { id: "codex", enabled: false, models: ["gpt-5.6-sol"] },
    ];
    expect(isPairInConfig(config, "claude", "sonnet-5")).toBe(true);
    expect(isPairInConfig(config, "claude-code", "Sonnet-5")).toBe(true);
    expect(isPairInConfig(config, "claude", "claude-fable-5")).toBe(false);
    expect(isPairInConfig(config, "codex", "gpt-5.6-sol")).toBe(false);
  });
});

describe("cardapioLabel", () => {
  it("labels the known types and returns the type itself when unknown", () => {
    expect(cardapioLabel("bug").label).toBe("Bug");
    expect(cardapioLabel("unknown")).toEqual({ label: "unknown", hint: "" });
  });
});
