/** Catálogo de CLIs executoras — compartilhado entre onboarding (T2) e /settings. */
export type ExecutorDef = {
  id: string;
  label: string;
  models: string[];
};

export const EXECUTOR_CATALOG: readonly ExecutorDef[] = [
  { id: "claude-code", label: "Claude Code", models: ["fable-5", "sonnet-5", "haiku-4-5"] },
  { id: "gemini-cli", label: "Gemini", models: ["3.5-flash", "3.1-pro"] },
  { id: "codex", label: "Codex", models: ["gpt-5.6-sol", "gpt-5.4-mini"] },
  { id: "kimi", label: "Kimi", models: ["k2-thinking", "k2"] },
  { id: "antigravity", label: "Antigravity", models: ["3.1-pro", "sonnet-4-6"] },
  { id: "cursor", label: "Cursor", models: ["auto"] },
  { id: "github-copilot", label: "GitHub Copilot", models: ["auto", "gpt-5.4"] },
  { id: "grok", label: "Grok", models: ["grok-4", "grok-4-fast"] },
  { id: "opencode", label: "OpenCode", models: ["auto"] },
  { id: "muse-code", label: "Muse Code", models: ["mimo-v2.5-pro", "mimo-omni"] },
];

/** id do executor customizado ("+ Personalizar") — conecta via MCP genérico. */
export const CUSTOM_EXECUTOR_ID = "generic-mcp";

/** Seleção da grid de executores (onboarding T2 e /settings). */
export type ExecutorSelection = {
  /** ids habilitados → modelos marcados */
  enabled: Record<string, string[]>;
  customEnabled: boolean;
  customName: string;
};

/**
 * Estado inicial da grid a partir do ExecutorConfig[] persistido no workspace.
 * Mora aqui, e não no componente, porque as páginas de servidor (/onboarding e
 * /settings) chamam esta função — de dentro de um módulo "use client" o React
 * recusa a chamada.
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
  const custom = config.find((r) => r.id === CUSTOM_EXECUTOR_ID);
  if (custom?.label && custom.label !== "Outro (MCP genérico)") customName = custom.label;
  return { enabled, customEnabled, customName };
}

/** Rótulos pt-BR dos tipos de atividade do cardápio (tipos reais do mcp-core). */
export const CARDAPIO_LABELS: Record<string, { label: string; hint: string }> = {
  bug: { label: "Bug", hint: "correção localizada, repro → patch" },
  feature: { label: "Feature / UI", hint: "tela nova, componente, fluxo" },
  rfc: { label: "RFC", hint: "documento de decisão" },
  architecture: { label: "Arquitetura", hint: "decisão de design, plano escrito" },
  mechanical: { label: "Mecânico / relatório", hint: "renomear, exportar, varrer logs" },
};

export function cardapioLabel(type: string): { label: string; hint: string } {
  return CARDAPIO_LABELS[type] ?? { label: type, hint: "" };
}
