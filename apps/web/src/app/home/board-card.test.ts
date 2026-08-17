import { describe, expect, it, vi } from "vitest";
import { toBoardCard, type HomeTaskRow } from "./board-card";

describe("toBoardCard", () => {
  it("includes comments in card history and marks in-progress cards as human-releasable", () => {
    vi.setSystemTime(new Date("2026-08-14T12:00:00Z"));

    const card = toBoardCard({
      id: "task-1",
      shortId: "OC-1",
      title: "Stuck execution",
      tipo: "feature",
      status: "em_execucao",
      isExample: false,
      oQue: "Release stuck work.",
      porQue: "The process died.",
      comoConfirmo: "Card is open again.",
      mission: { title: "Board operations" },
      harness: { model: "gpt-5", effort: "medium" },
      devolveParaKind: "workspace_queue",
      reviewer: null,
      devolveParaAgentRef: null,
      createdBy: { email: "owner@example.com" },
      origin: { cli: "board" },
      attempts: [
        {
          id: "attempt-1",
          executor: "codex",
          model: "gpt-5",
          startedAt: new Date("2026-08-14T11:05:00Z"),
          finishedAt: null,
          tokensIn: null,
          tokensOut: null,
          tokensCache: null,
          costUsd: null,
          durationMs: null,
          turns: null,
          result: null,
          resultNote: null,
          taskId: "task-1",
        },
      ],
      handoffs: [],
      comments: [
        {
          id: "comment-1",
          taskId: "task-1",
          authorUserId: null,
          authorAgentRef: null,
          body: "Agent stopped responding.",
          createdAt: new Date("2026-08-14T11:30:00Z"),
          author: { email: "reviewer@example.com" },
        },
      ],
      branch: "oc-1-stuck-execution",
      telemetryIncomplete: false,
      claimedAt: new Date("2026-08-14T11:05:00Z"),
      claimedByExecutor: "codex",
      claimedByTokenId: "token-1",
      createdAt: new Date("2026-08-14T11:00:00Z"),
      updatedAt: new Date("2026-08-14T11:30:00Z"),
      missionId: null,
      parentId: null,
      projectId: "project-1",
      revisado: false,
      priority: "media",
      devolveParaUserId: null,
      mode: "solo",
      prUrl: null,
      createdByUserId: null,
    } satisfies HomeTaskRow);

    expect(card.history.map((event) => event.kind)).toContain("comment");
    expect(card.history.find((event) => event.kind === "comment")).toMatchObject({
      actor: "reviewer@example.com",
      detail: "Agent stopped responding.",
    });
    expect(card.history.at(-1)).toMatchObject({
      summary: "Current status: in progress",
      detail: "If the executor is gone, a human can reopen this card with a comment.",
    });
  });
});
