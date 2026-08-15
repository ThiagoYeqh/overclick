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
  /**
   * Editable model list per CLI id. Seeded from the built-in catalog, which is
   * only the initial suggestion; the user adds and removes entries as free text
   * and the list persists in the workspace config.
   */
  models: Record<string, string[]>;
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
    catalog?: string[];
  }[],
): ExecutorSelection {
  const enabled: Record<string, string[]> = {};
  const models: Record<string, string[]> = {};
  for (const def of EXECUTOR_CATALOG) {
    models[def.id] = [...def.models];
  }
  let customEnabled = false;
  let customName = "";
  for (const row of config) {
    if (row.id === CUSTOM_EXECUTOR_ID) {
      if (row.enabled) customEnabled = true;
      continue;
    }
    if (!EXECUTOR_CATALOG.some((d) => d.id === row.id)) continue;
    // A persisted catalog wins, even when it dropped built-in suggestions.
    // Configs saved before the field existed keep the suggestion plus any
    // checked models the user typed in elsewhere.
    models[row.id] = row.catalog
      ? [...row.catalog]
      : [...new Set([...(models[row.id] ?? []), ...row.models])];
    if (row.enabled) {
      enabled[row.id] = row.models.length
        ? [...row.models]
        : [models[row.id]?.[0] ?? "auto"];
    }
  }
  // "Outro (MCP genérico)" is the pt-BR factory label kept for workspaces
  // seeded before the English-only pass.
  const FACTORY_CUSTOM_LABELS = ["Other (generic MCP)", "Outro (MCP genérico)"];
  const custom = config.find((r) => r.id === CUSTOM_EXECUTOR_ID);
  if (custom?.label && !FACTORY_CUSTOM_LABELS.includes(custom.label)) customName = custom.label;
  return { enabled, models, customEnabled, customName };
}

/**
 * Adds a free-text model to one CLI's editable list. Trims the input, ignores
 * empties and duplicates, and checks the model when the CLI is already on.
 */
export function addModelToSelection(
  sel: ExecutorSelection,
  execId: string,
  raw: string,
): ExecutorSelection {
  const model = raw.trim();
  if (!model) return sel;
  const list = sel.models[execId] ?? [];
  const models = list.includes(model)
    ? sel.models
    : { ...sel.models, [execId]: [...list, model] };
  const checked = sel.enabled[execId];
  const enabled =
    checked && !checked.includes(model)
      ? { ...sel.enabled, [execId]: [...checked, model] }
      : sel.enabled;
  return { ...sel, models, enabled };
}

/** Removes a model from one CLI's editable list and unchecks it. */
export function removeModelFromSelection(
  sel: ExecutorSelection,
  execId: string,
  model: string,
): ExecutorSelection {
  const list = sel.models[execId] ?? [];
  const models = { ...sel.models, [execId]: list.filter((m) => m !== model) };
  const checked = sel.enabled[execId];
  const enabled = checked
    ? { ...sel.enabled, [execId]: checked.filter((m) => m !== model) }
    : sel.enabled;
  return { ...sel, models, enabled };
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
