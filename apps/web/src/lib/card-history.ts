type CardStatus = "aberto" | "em_execucao" | "feito" | "validado";

export type BoardCardHistoryEvent = {
  id: string;
  at: string;
  kind: "created" | "claimed" | "comment" | "handoff" | "validated" | "current";
  actor: string;
  summary: string;
  detail: string | null;
};

export type BuildCardHistoryInput = {
  task: {
    id: string;
    shortId: string;
    title: string;
    status: CardStatus;
    createdAt: Date;
    claimedAt: Date | null;
    claimedByExecutor: string | null;
    createdByEmail: string | null;
  };
  comments: Array<{
    id: string;
    body: string;
    createdAt: Date;
    authorEmail: string | null;
    authorAgentRef: string | null;
  }>;
  attempts: Array<{
    id: string;
    executor: string | null;
    model: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    result: string | null;
    resultNote: string | null;
  }>;
  handoffs: Array<{
    id: string;
    summary: string;
    branch: string | null;
    prUrl: string | null;
    createdAt: Date;
  }>;
};

type InternalHistoryEvent = BoardCardHistoryEvent & { sortAt: number };

const STATUS_LABEL: Record<CardStatus, string> = {
  aberto: "open",
  em_execucao: "in progress",
  feito: "done · review",
  validado: "validated",
};

function fmtDate(date: Date): string {
  return date.toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function event(
  raw: Omit<BoardCardHistoryEvent, "at"> & { at: Date },
): InternalHistoryEvent {
  return {
    ...raw,
    at: fmtDate(raw.at),
    sortAt: raw.at.getTime(),
  };
}

function commentActor(comment: BuildCardHistoryInput["comments"][number]): string {
  return comment.authorEmail ?? comment.authorAgentRef ?? "human";
}

function handoffDetail(handoff: BuildCardHistoryInput["handoffs"][number]): string | null {
  const parts = [handoff.branch, handoff.prUrl].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function currentStatusDetail(status: CardStatus): string | null {
  if (status === "em_execucao") {
    return "If the executor is gone, a human can reopen this card with a comment.";
  }
  return null;
}

export function buildCardHistory(input: BuildCardHistoryInput): BoardCardHistoryEvent[] {
  const events: InternalHistoryEvent[] = [
    event({
      id: `${input.task.id}:created`,
      at: input.task.createdAt,
      kind: "created",
      actor: input.task.createdByEmail ?? "board",
      summary: `Card created: ${input.task.title}`,
      detail: input.task.shortId,
    }),
  ];

  if (input.task.claimedAt) {
    const actor = input.task.claimedByExecutor ?? "agent";
    events.push(
      event({
        id: `${input.task.id}:claimed`,
        at: input.task.claimedAt,
        kind: "claimed",
        actor,
        summary: `Claimed by ${actor}`,
        detail: null,
      }),
    );
  } else {
    for (const attempt of input.attempts) {
      const actor = attempt.executor ?? "agent";
      const model = attempt.model ? ` · ${attempt.model}` : "";
      events.push(
        event({
          id: `attempt:${attempt.id}`,
          at: attempt.startedAt,
          kind: "claimed",
          actor,
          summary: `Execution attempt by ${actor}`,
          detail: `${attempt.finishedAt ? "Finished" : "Started"}${model}`,
        }),
      );
    }
  }

  for (const comment of input.comments) {
    events.push(
      event({
        id: `comment:${comment.id}`,
        at: comment.createdAt,
        kind: "comment",
        actor: commentActor(comment),
        summary: "Comment added",
        detail: comment.body,
      }),
    );
  }

  for (const handoff of input.handoffs) {
    events.push(
      event({
        id: `handoff:${handoff.id}`,
        at: handoff.createdAt,
        kind: "handoff",
        actor: "agent",
        summary: `Handoff: ${handoff.summary}`,
        detail: handoffDetail(handoff),
      }),
    );
  }

  events.push(
    event({
      id: `${input.task.id}:current`,
      at: new Date(Math.max(...events.map((item) => item.sortAt))),
      kind: input.task.status === "validado" ? "validated" : "current",
      actor: "system",
      summary: `Current status: ${STATUS_LABEL[input.task.status]}`,
      detail: currentStatusDetail(input.task.status),
    }),
  );

  return events
    .sort((a, b) => a.sortAt - b.sortAt || a.id.localeCompare(b.id))
    .map(({ sortAt: _sortAt, ...visible }) => visible);
}
