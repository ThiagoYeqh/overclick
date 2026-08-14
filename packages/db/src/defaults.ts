import type { Cardapio, ExecutorConfig, Harness } from "./types";

const mid: Harness = {
  model: null,
  modelTier: "mid",
  effort: "medium",
  skills: [],
  agent: null,
};

/** Factory cardápio: destilado da matriz B1–B6 (spec §3.2). */
export const DEFAULT_CARDAPIO: Cardapio = {
  bug: { ...mid, skills: ["fix"] },
  feature: { ...mid },
  rfc: {
    model: null,
    modelTier: "top",
    effort: "high",
    skills: [],
    agent: null,
  },
};

/** Known CLIs. Disabled until the user marks them — no auto-detect. */
export const KNOWN_EXECUTORS: ExecutorConfig[] = [
  { id: "overclock", label: "Overclock", enabled: false, models: [] },
  { id: "claude-code", label: "Claude Code", enabled: false, models: [] },
  { id: "codex", label: "Codex", enabled: false, models: [] },
  { id: "gemini-cli", label: "Gemini CLI", enabled: false, models: [] },
  { id: "cursor", label: "Cursor", enabled: false, models: [] },
  { id: "aider", label: "Aider", enabled: false, models: [] },
  { id: "generic-mcp", label: "Outro (MCP genérico)", enabled: false, models: [] },
];
