/**
 * Insights copy lives with the page so this card ships without touching the
 * shared dictionary. Same product voice: direct, no enthusiasm, no em dash.
 */
const en = {
  title: "Insights",
  sub: "What execution costs on this board: per project, per mission, per model, per card.",
  backToBoard: "← Board",
  totalCost: "Total cost",
  totalTokens: "Total tokens",
  totalTime: "Total time",
  attempts: "Attempts",
  estimatedCount: (n: number) => `${n} estimated`,
  missingCount: (n: number) => `${n} usage not reported`,
  allReported: "all usage reported",
  byProject: "By project",
  byMission: "By mission",
  byModel: "By model",
  reopenedByModel: "Reopened rate by model",
  perCard: "Cost per card",
  colName: "name",
  colCard: "card",
  colProject: "project",
  colMission: "mission",
  colModel: "model",
  colCost: "cost",
  colTokens: "tokens",
  colTime: "time",
  colAttempts: "attempts",
  colDeliveries: "deliveries",
  colReopened: "reopened",
  colRate: "rate",
  noMission: "no mission",
  noModel: "model not reported",
  costNotReported: "not reported",
  estimatedTag: "estimated",
  missingTag: "usage not reported",
  sortHint: "click a column to sort",
  empty:
    "No delivered work yet. When an agent claims and delivers a card, its cost, tokens and time land here.",
  emptyReopens:
    "No deliveries to measure. The reopened rate appears after the first review cycle.",
};

export type InsightsCopy = typeof en;

const ptBR: InsightsCopy = {
  title: "Insights",
  sub: "Quanto custa a execução neste board: por projeto, por missão, por modelo, por card.",
  backToBoard: "← Board",
  totalCost: "Custo total",
  totalTokens: "Tokens totais",
  totalTime: "Tempo total",
  attempts: "Execuções",
  estimatedCount: (n: number) => `${n} estimado${n === 1 ? "" : "s"}`,
  missingCount: (n: number) => `${n} sem uso reportado`,
  allReported: "todo uso reportado",
  byProject: "Por projeto",
  byMission: "Por missão",
  byModel: "Por modelo",
  reopenedByModel: "Taxa de reabertura por modelo",
  perCard: "Custo por card",
  colName: "nome",
  colCard: "card",
  colProject: "projeto",
  colMission: "missão",
  colModel: "modelo",
  colCost: "custo",
  colTokens: "tokens",
  colTime: "tempo",
  colAttempts: "execuções",
  colDeliveries: "entregas",
  colReopened: "reabertos",
  colRate: "taxa",
  noMission: "sem missão",
  noModel: "modelo não reportado",
  costNotReported: "não reportado",
  estimatedTag: "estimado",
  missingTag: "uso não reportado",
  sortHint: "clique numa coluna para ordenar",
  empty:
    "Nenhuma entrega ainda. Quando um agente pegar e entregar um card, o custo, os tokens e o tempo aparecem aqui.",
  emptyReopens:
    "Nenhuma entrega para medir. A taxa de reabertura aparece depois do primeiro ciclo de revisão.",
};

export function insightsCopy(lang: string | null | undefined): InsightsCopy {
  return lang === "pt-BR" ? ptBR : en;
}
