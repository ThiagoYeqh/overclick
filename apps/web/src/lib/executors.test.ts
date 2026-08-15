import { describe, expect, it } from "vitest";
import {
  CUSTOM_EXECUTOR_ID,
  EXECUTOR_CATALOG,
  cardapioLabel,
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
  it("ignores disabled executors and ones missing from the catalog", () => {
    const sel = selectionFromConfig([
      { id: "claude-code", label: "Claude Code", enabled: true, models: ["fable-5"] },
      { id: "codex", label: "Codex", enabled: false, models: ["gpt-5.6-sol"] },
      { id: "aider", label: "Aider", enabled: true, models: [] },
    ]);
    expect(sel.enabled).toEqual({ "claude-code": ["fable-5"] });
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

describe("cardapioLabel", () => {
  it("labels the known types and returns the type itself when unknown", () => {
    expect(cardapioLabel("bug").label).toBe("Bug");
    expect(cardapioLabel("unknown")).toEqual({ label: "unknown", hint: "" });
  });
});
