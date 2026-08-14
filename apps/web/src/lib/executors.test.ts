import { describe, expect, it } from "vitest";
import {
  CUSTOM_EXECUTOR_ID,
  EXECUTOR_CATALOG,
  cardapioLabel,
  selectionFromConfig,
} from "./executors";

describe("catálogo de executores", () => {
  it("traz as 10 CLIs do onboarding, sem ids repetidos", () => {
    expect(EXECUTOR_CATALOG).toHaveLength(10);
    expect(new Set(EXECUTOR_CATALOG.map((d) => d.id)).size).toBe(10);
    expect(EXECUTOR_CATALOG.every((d) => d.models.length > 0)).toBe(true);
  });
});

describe("selectionFromConfig", () => {
  it("ignora executores desligados e os que não estão no catálogo", () => {
    const sel = selectionFromConfig([
      { id: "claude-code", label: "Claude Code", enabled: true, models: ["fable-5"] },
      { id: "codex", label: "Codex", enabled: false, models: ["gpt-5.6-sol"] },
      { id: "aider", label: "Aider", enabled: true, models: [] },
    ]);
    expect(sel.enabled).toEqual({ "claude-code": ["fable-5"] });
  });

  it("cai no primeiro modelo do catálogo quando o config veio sem modelo", () => {
    const sel = selectionFromConfig([
      { id: "grok", label: "Grok", enabled: true, models: [] },
    ]);
    expect(sel.enabled.grok).toEqual(["grok-4"]);
  });

  it("reconhece a CLI personalizada e guarda o nome dado pelo usuário", () => {
    const sel = selectionFromConfig([
      { id: CUSTOM_EXECUTOR_ID, label: "Nosso agente interno", enabled: true, models: [] },
    ]);
    expect(sel.customEnabled).toBe(true);
    expect(sel.customName).toBe("Nosso agente interno");
  });

  it("não trata o rótulo de fábrica do MCP genérico como nome escolhido", () => {
    const sel = selectionFromConfig([
      { id: CUSTOM_EXECUTOR_ID, label: "Outro (MCP genérico)", enabled: true, models: [] },
    ]);
    expect(sel.customEnabled).toBe(true);
    expect(sel.customName).toBe("");
  });

  it("não vaza a referência do array de modelos do config", () => {
    const models = ["fable-5"];
    const sel = selectionFromConfig([
      { id: "claude-code", label: "Claude Code", enabled: true, models },
    ]);
    sel.enabled["claude-code"]?.push("haiku-4-5");
    expect(models).toEqual(["fable-5"]);
  });
});

describe("cardapioLabel", () => {
  it("traduz os tipos conhecidos e devolve o próprio tipo quando não conhece", () => {
    expect(cardapioLabel("bug").label).toBe("Bug");
    expect(cardapioLabel("desconhecido")).toEqual({ label: "desconhecido", hint: "" });
  });
});
