import { err, ok, type Result } from "../errors.js";

export const CARD_STATUSES = [
  "aberto",
  "em_execucao",
  "feito",
  "validado",
] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_EVENTS = [
  "claim",
  "force_claim",
  "handoff",
  "validate",
  "reopen",
  "mark_revisado",
  "force_reopen",
] as const;

export type CardEventType = (typeof CARD_EVENTS)[number];

export type CardEvent =
  | { type: "claim" }
  | { type: "force_claim" }
  | { type: "handoff" }
  | { type: "validate"; actor: "human" | "agent" }
  | { type: "reopen"; comment: string }
  | { type: "mark_revisado" }
  | { type: "force_reopen" };

export type CardSnapshot = {
  status: CardStatus;
  revisado: boolean;
  reopen_comment: string | null;
};

const VALID_EVENTS: Record<CardStatus, readonly CardEventType[]> = {
  aberto: ["claim"],
  em_execucao: ["handoff", "force_claim", "force_reopen"],
  feito: ["validate", "reopen", "mark_revisado"],
  validado: [],
};

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export function listValidEvents(card: CardSnapshot): CardEventType[] {
  return [...VALID_EVENTS[card.status]];
}

export function isValidTransition(
  card: CardSnapshot,
  event: CardEvent,
): boolean {
  if (event.type === "reopen" && isBlank(event.comment)) {
    return false;
  }
  if (event.type === "validate" && event.actor !== "human") {
    return false;
  }
  return VALID_EVENTS[card.status].includes(event.type);
}

export function applyTransition(
  card: CardSnapshot,
  event: CardEvent,
): Result<CardSnapshot> {
  if (event.type === "reopen" && isBlank(event.comment)) {
    return err(
      "REOPEN_COMMENT_REQUIRED",
      "Reabrir exige um comentário — o agente recebe no próximo claim.",
    );
  }

  if (!VALID_EVENTS[card.status].includes(event.type)) {
    if (event.type === "claim" && card.status === "em_execucao") {
      return err(
        "ALREADY_CLAIMED",
        "Card já está em execução. Use force para assumir a tentativa.",
        { from: card.status, event: event.type },
      );
    }
    return err(
      "INVALID_TRANSITION",
      `Transição '${event.type}' inválida a partir de '${card.status}'.`,
      { from: card.status, event: event.type },
    );
  }

  if (event.type === "validate" && event.actor !== "human") {
    return err(
      "VALIDATION_HUMAN_ONLY",
      "Só um humano na UI marca o card como validado.",
      { from: card.status, event: event.type, actor: event.actor },
    );
  }

  switch (event.type) {
    case "claim":
      return ok({ ...card, status: "em_execucao" });
    case "force_claim":
      return ok({ ...card, status: "em_execucao" });
    case "handoff":
      return ok({
        ...card,
        status: "feito",
        revisado: false,
        reopen_comment: null,
      });
    case "validate":
      return ok({ ...card, status: "validado" });
    case "reopen":
      return ok({
        ...card,
        status: "aberto",
        revisado: false,
        reopen_comment: event.comment.trim(),
      });
    case "mark_revisado":
      return ok({ ...card, revisado: true });
    case "force_reopen":
      return ok({ ...card, status: "aberto", revisado: false });
  }
}
