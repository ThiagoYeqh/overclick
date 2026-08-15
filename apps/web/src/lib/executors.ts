/** Catalog of executor CLIs, shared between onboarding (T2) and /settings. */
export type ExecutorDef = {
  id: string;
  label: string;
  models: string[];
};

export const EXECUTOR_CATALOG: readonly ExecutorDef[] = [
  { id: "claude-code", label: "Claude Code", models: ["fable-5", "opus-5", "sonnet-5", "haiku-4-5"] },
  { id: "gemini-cli", label: "Gemini", models: ["3.5-flash", "3.1-pro", "3-flash"] },
  {
    id: "codex",
    label: "Codex",
    models: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4-mini"],
  },
  {
    id: "kimi",
    label: "Kimi",
    models: ["kimi-for-coding", "kimi-for-coding-highspeed", "k3", "k3-256k"],
  },
  {
    id: "antigravity",
    label: "Antigravity",
    models: ["3.7-flash-high", "3.7-flash-medium", "3.7-flash-low"],
  },
  { id: "cursor", label: "Cursor", models: ["auto"] },
  { id: "github-copilot", label: "GitHub Copilot", models: ["auto"] },
  { id: "grok", label: "Grok", models: ["grok-4.6", "grok-4.5", "grok-composer-2.5-fast"] },
  {
    id: "opencode",
    label: "OpenCode",
    models: ["big-pickle", "deepseek-v4-flash-free", "mimo-v2.5-free"],
  },
  { id: "muse-code", label: "Muse Code", models: ["muse-spark-1.2"] },
];

/** Id of the custom executor ("+ Customize"), which connects via generic MCP. */
export const CUSTOM_EXECUTOR_ID = "generic-mcp";

/** Selection state of the executors grid (onboarding T2 and /settings). */
export type ExecutorSelection = {
  /** enabled ids → checked models */
  enabled: Record<string, string[]>;
  customEnabled: boolean;
  customName: string;
};

/**
 * Initial grid state from the ExecutorConfig[] persisted on the workspace.
 * Lives here, not in the component, because the server pages (/onboarding and
 * /settings) call this function, and React refuses the call from inside a
 * "use client" module.
 */
export function selectionFromConfig(
  config: readonly {
    id: string;
    label?: string;
    enabled: boolean;
    models: string[];
  }[],
): ExecutorSelection {
  const enabled: Record<string, string[]> = {};
  let customEnabled = false;
  let customName = "";
  for (const row of config) {
    if (!row.enabled) continue;
    if (row.id === CUSTOM_EXECUTOR_ID) {
      customEnabled = true;
      continue;
    }
    const def = EXECUTOR_CATALOG.find((d) => d.id === row.id);
    if (def) {
      enabled[row.id] = row.models.length ? [...row.models] : [def.models[0] ?? "auto"];
    }
  }
  // "Outro (MCP genérico)" is the pt-BR factory label kept for workspaces
  // seeded before the English-only pass.
  const FACTORY_CUSTOM_LABELS = ["Other (generic MCP)", "Outro (MCP genérico)"];
  const custom = config.find((r) => r.id === CUSTOM_EXECUTOR_ID);
  if (custom?.label && !FACTORY_CUSTOM_LABELS.includes(custom.label)) customName = custom.label;
  return { enabled, customEnabled, customName };
}

/** Display labels for the cardapio activity types (real mcp-core types). */
export const CARDAPIO_LABELS: Record<string, { label: string; hint: string }> = {
  bug: { label: "Bug", hint: "localized fix, repro → patch" },
  feature: { label: "Feature / UI", hint: "new screen, component, flow" },
  rfc: { label: "RFC", hint: "decision document" },
  architecture: { label: "Architecture", hint: "design decision, written plan" },
  mechanical: { label: "Mechanical / report", hint: "rename, export, sweep logs" },
};

export function cardapioLabel(type: string): { label: string; hint: string } {
  return CARDAPIO_LABELS[type] ?? { label: type, hint: "" };
}
