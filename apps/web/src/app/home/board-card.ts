import type { ExecutionMode, Harness, ReviewerKind, TaskOrigin, TaskPriority, TaskType } from "@agent-board/db";
import { buildCardHistory, type BoardCardHistoryEvent } from "../../lib/card-history";

type TaskStatus = "aberto" | "em_execucao" | "feito" | "validado";

export type BoardCard = {
  id: string;
  shortId: string;
  title: string;
  tipo: TaskType;
  status: TaskStatus;
  isExample: boolean;
  oQue: string;
  porQue: string;
  comoConfirmo: string;
  mission: string | null;
  harness: string | null;
  devolve: string;
  origem: string;
  executor: string | null;
  elapsed: string | null;
  branch: string | null;
  telemetry: string | null;
  handoff: string | null;
  history: BoardCardHistoryEvent[];
};

export type HomeTaskRow = {
  id: string;
  projectId: string;
  missionId: string | null;
  parentId: string | null;
  shortId: string;
  title: string;
  oQue: string;
  porQue: string;
  comoConfirmo: string;
  tipo: TaskType;
  status: TaskStatus;
  revisado: boolean;
  priority: TaskPriority;
  devolveParaKind: ReviewerKind;
  devolveParaUserId: string | null;
  devolveParaAgentRef: string | null;
  harness: Harness | null;
  branch: string | null;
  prUrl: string | null;
  origin: TaskOrigin | null;
  mode: ExecutionMode;
  telemetryIncomplete: boolean;
  isExample: boolean;
  claimedAt: Date | null;
  claimedByExecutor: string | null;
  claimedByTokenId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  mission: { title: string } | null;
  createdBy: { email: string } | null;
  reviewer: { email: string } | null;
  attempts: Array<{
    id: string;
    taskId: string;
    executor: string | null;
    model: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    tokensIn: number | null;
    tokensOut: number | null;
    tokensCache: number | null;
    costUsd: string | number | null;
    durationMs: number | null;
    turns: number | null;
    result: string | null;
    resultNote: string | null;
  }>;
  handoffs: Array<{
    id: string;
    taskId?: string;
    attemptId?: string | null;
    summary: string;
    evidences?: unknown;
    artifacts?: unknown;
    branch: string | null;
    prUrl: string | null;
    usage?: {
      tokensIn?: number;
      tokensOut?: number;
      tokensCache?: number;
      costUsd?: number;
      durationMs?: number;
      turns?: number;
    } | null;
    createdAt: Date;
  }>;
  comments: Array<{
    id: string;
    taskId: string;
    authorUserId: string | null;
    authorAgentRef: string | null;
    body: string;
    createdAt: Date;
    author: { email: string } | null;
  }>;
};

function fmtDurationMs(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    const v = (n / 1_000_000).toFixed(1).replace(".0", "");
    return `${v}M tok`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}k tok`;
  return `${n} tok`;
}

function fmtElapsed(from: Date): string {
  const m = Math.max(1, Math.round((Date.now() - from.getTime()) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "2-digit" });
}

export function toBoardCard(t: HomeTaskRow): BoardCard {
  const h = t.harness;
  const harness =
    [h?.model ?? h?.modelTier, h?.effort].filter(Boolean).join(" · ") || null;

  const devolve =
    t.devolveParaKind === "human"
      ? (t.reviewer?.email ?? "human")
      : t.devolveParaKind === "agent"
        ? (t.devolveParaAgentRef ?? "agent")
        : "workspace queue";

  const origem = t.createdBy?.email ?? t.origin?.agent ?? t.origin?.cli ?? "board";

  const latestAttempt = [...t.attempts].sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
  )[0];
  const latestHandoff = [...t.handoffs].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];

  let telemetry: string | null = null;
  if (latestAttempt) {
    const parts: string[] = [];
    if (latestAttempt.durationMs != null) parts.push(fmtDurationMs(latestAttempt.durationMs));
    const tokens =
      (latestAttempt.tokensIn ?? 0) +
      (latestAttempt.tokensOut ?? 0) +
      (latestAttempt.tokensCache ?? 0);
    if (tokens > 0) parts.push(fmtTokens(tokens));
    if (latestAttempt.costUsd != null) parts.push(`~US$ ${Number(latestAttempt.costUsd).toFixed(2)}`);
    telemetry = parts.join(" · ") || null;
  } else if (latestHandoff?.usage) {
    const u = latestHandoff.usage;
    const parts: string[] = [];
    if (u.durationMs != null) parts.push(fmtDurationMs(u.durationMs));
    const tokens = (u.tokensIn ?? 0) + (u.tokensOut ?? 0) + (u.tokensCache ?? 0);
    if (tokens > 0) parts.push(fmtTokens(tokens));
    if (u.costUsd != null) parts.push(`~US$ ${u.costUsd.toFixed(2)}`);
    telemetry = parts.join(" · ") || null;
  }
  if (telemetry && t.telemetryIncomplete) telemetry += " · telemetry incomplete";

  return {
    id: t.id,
    shortId: t.shortId,
    title: t.title,
    tipo: t.tipo,
    status: t.status,
    isExample: t.isExample,
    oQue: t.oQue,
    porQue: t.porQue,
    comoConfirmo: t.comoConfirmo,
    mission: t.mission?.title ?? null,
    harness,
    devolve,
    origem: `${origem} · ${fmtDate(t.createdAt)}`,
    executor: t.claimedByExecutor ?? latestAttempt?.executor ?? null,
    elapsed: t.claimedAt ? fmtElapsed(t.claimedAt) : null,
    branch: t.branch ?? latestHandoff?.branch ?? null,
    telemetry,
    handoff: latestHandoff?.summary ?? null,
    history: buildCardHistory({
      task: {
        id: t.id,
        shortId: t.shortId,
        title: t.title,
        status: t.status,
        createdAt: t.createdAt,
        claimedAt: t.claimedAt,
        claimedByExecutor: t.claimedByExecutor,
        createdByEmail: t.createdBy?.email ?? null,
      },
      comments: t.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        authorEmail: comment.author?.email ?? null,
        authorAgentRef: comment.authorAgentRef,
      })),
      attempts: t.attempts.map((attempt) => ({
        id: attempt.id,
        executor: attempt.executor,
        model: attempt.model,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
        result: attempt.result,
        resultNote: attempt.resultNote,
      })),
      handoffs: t.handoffs.map((handoff) => ({
        id: handoff.id,
        summary: handoff.summary,
        branch: handoff.branch,
        prUrl: handoff.prUrl,
        createdAt: handoff.createdAt,
      })),
    }),
  };
}
