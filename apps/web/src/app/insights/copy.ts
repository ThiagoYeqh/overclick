/**
 * Insights copy lives with the page so this card ships without touching the
 * shared dictionary. Same product voice: direct, no enthusiasm, no em dash.
 */
const en = {
  title: "Insights",
  sub: "What execution takes on this board: tokens and time per project, per mission, per model, per card.",
  backToBoard: "← Board",
  totalCost: "Total cost",
  totalTokens: "Total tokens",
  totalTime: "Execution time",
  /** Elapsed never joins the execution sum: it is said apart, with its count. */
  elapsedNote: (value: string, n: number) =>
    `+ ${value} elapsed on ${n} run${n === 1 ? "" : "s"} that reported no execution time`,
  elapsedTag: (value: string) => `open for ${value}`,
  attempts: "Attempts",
  estimatedCount: (n: number) => `${n} estimated`,
  missingCount: (n: number) => `${n} usage not reported`,
  allReported: "all usage reported",
  byProject: "By project",
  byMission: "By mission",
  byModel: "By model",
  sharedModelsNote: (n: number) =>
    `${n} run${n === 1 ? "" : "s"} switched model. Tokens are split per model; the duration is not, so the times below overlap.`,
  reopenedByModel: "Reopened rate by model",
  perCard: "Cost per card",
  perCardNoMoney: "Per card",
  colName: "name",
  colCard: "card",
  colProject: "project",
  colMission: "mission",
  colModel: "model",
  colCost: "cost",
  colTokens: "tokens",
  colTime: "execution",
  colAttempts: "attempts",
  colDeliveries: "deliveries",
  colReopened: "reopened",
  colRate: "rate",
  noMission: "no mission",
  noModel: "model not reported",
  costNotReported: "not reported",
  estimatedTag: "estimated",
  missingTag: "usage not reported",
  colSource: "cost from",
  sourceComputed: "computed",
  sourceReported: "agent reported",
  sourceEstimated: "estimated",
  sourceMixed: "mixed",
  sourceNone: "—",
  computedCount: (n: number) => `${n} computed`,
  reportedCount: (n: number) => `${n} agent reported`,
  unpricedCount: (n: number) => `${n} unpriced model`,
  noCostSource: "no cost to attribute",
  pricesNote: "Cost is computed from the price table in Settings whenever an attempt reports tokens.",
  sortHint: "click a column to sort",
  empty:
    "No delivered work yet. When an agent claims and delivers a card, its tokens and time land here.",
  emptyReopens:
    "No deliveries to measure. The reopened rate appears after the first review cycle.",
};

export type InsightsCopy = typeof en;

const ptBR: InsightsCopy = {
  title: "Insights",
  sub: "O que a execução consome neste board: tokens e tempo por projeto, por missão, por modelo, por card.",
  backToBoard: "← Board",
  totalCost: "Custo total",
  totalTokens: "Tokens totais",
  totalTime: "Tempo de execução",
  elapsedNote: (value: string, n: number) =>
    `+ ${value} decorrido${n === 1 ? "" : "s"} em ${n} execuç${n === 1 ? "ão que não reportou" : "ões que não reportaram"} tempo de execução`,
  elapsedTag: (value: string) => `aberto por ${value}`,
  attempts: "Execuções",
  estimatedCount: (n: number) => `${n} estimado${n === 1 ? "" : "s"}`,
  missingCount: (n: number) => `${n} sem uso reportado`,
  allReported: "todo uso reportado",
  byProject: "Por projeto",
  byMission: "Por missão",
  byModel: "Por modelo",
  sharedModelsNote: (n: number) =>
    `${n} execuç${n === 1 ? "ão trocou" : "ões trocaram"} de modelo. Os tokens são separados por modelo; a duração não, então os tempos abaixo se sobrepõem.`,
  reopenedByModel: "Taxa de reabertura por modelo",
  perCard: "Custo por card",
  perCardNoMoney: "Por card",
  colName: "nome",
  colCard: "card",
  colProject: "projeto",
  colMission: "missão",
  colModel: "modelo",
  colCost: "custo",
  colTokens: "tokens",
  colTime: "execução",
  colAttempts: "execuções",
  colDeliveries: "entregas",
  colReopened: "reabertos",
  colRate: "taxa",
  noMission: "sem missão",
  noModel: "modelo não reportado",
  costNotReported: "não reportado",
  estimatedTag: "estimado",
  missingTag: "uso não reportado",
  colSource: "custo veio de",
  sourceComputed: "calculado",
  sourceReported: "reportado pelo agente",
  sourceEstimated: "estimado",
  sourceMixed: "misto",
  sourceNone: "—",
  computedCount: (n: number) => `${n} calculado${n === 1 ? "" : "s"}`,
  reportedCount: (n: number) => `${n} reportado${n === 1 ? "" : "s"} pelo agente`,
  unpricedCount: (n: number) => `${n} modelo${n === 1 ? "" : "s"} sem preço`,
  noCostSource: "nenhum custo para atribuir",
  pricesNote: "O custo é calculado pela tabela de preços em Configurações sempre que uma execução reporta tokens.",
  sortHint: "clique numa coluna para ordenar",
  empty:
    "Nenhuma entrega ainda. Quando um agente pegar e entregar um card, os tokens e o tempo aparecem aqui.",
  emptyReopens:
    "Nenhuma entrega para medir. A taxa de reabertura aparece depois do primeiro ciclo de revisão.",
};

export function insightsCopy(lang: string | null | undefined): InsightsCopy {
  return lang === "pt-BR" ? ptBR : en;
}
