import { DEFAULT_CARDAPIO, KNOWN_EXECUTORS } from "./defaults";
import type { Harness } from "./types";

export const EXAMPLE_WORKSPACE = {
  name: "Agent Board",
  executors: KNOWN_EXECUTORS,
  cardapio: DEFAULT_CARDAPIO,
};

export const EXAMPLE_PROJECT = {
  name: "Agent Board",
  repoUrl: null as string | null,
  idPrefix: "AGB",
  nextNumber: 2,
};

export const EXAMPLE_CARD = {
  shortId: "AGB-1",
  title: "Peça ao seu agente para pegar esta task",
  oQue:
    'Você vai pedir, no terminal, "pega a próxima task do board". O agente faz task_claim, este card desliza para em execução, e ao terminar volta como feito.',
  porQue:
    "Pra você ver o loop inteiro antes de confiar um trabalho de verdade a ele.",
  comoConfirmo:
    '1) No terminal, digite "pega a próxima task do board". 2) Este card muda de coluna sozinho. 3) Ao terminar, ele aparece em feito com resumo e telemetria. 4) Você clica em Validar.',
  tipo: "feature" as const,
  status: "aberto" as const,
  isExample: true,
  harness: {
    model: null,
    modelTier: "mid",
    effort: "medium",
    skills: [],
    agent: null,
  } satisfies Harness,
};
