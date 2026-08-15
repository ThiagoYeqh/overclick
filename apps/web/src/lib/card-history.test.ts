import { describe, expect, it } from "vitest";
import { buildCardHistory } from "./card-history";

describe("buildCardHistory", () => {
  it("builds a chronological card lifecycle from stored rows", () => {
    const events = buildCardHistory({
      task: {
        id: "task-1",
        shortId: "OC-1",
        title: "Fix login",
        status: "feito",
        createdAt: new Date("2026-08-14T10:00:00Z"),
        claimedAt: new Date("2026-08-14T10:10:00Z"),
        claimedByExecutor: "codex",
        createdByEmail: "owner@example.com",
      },
      comments: [
        {
          id: "comment-1",
          body: "Please retry with tests.",
          createdAt: new Date("2026-08-14T10:20:00Z"),
          authorEmail: "reviewer@example.com",
          authorAgentRef: null,
        },
      ],
      attempts: [
        {
          id: "attempt-1",
          executor: "codex",
          model: "gpt-5",
          startedAt: new Date("2026-08-14T10:11:00Z"),
          finishedAt: null,
          result: null,
          resultNote: null,
        },
      ],
      handoffs: [
        {
          id: "handoff-1",
          summary: "Implemented fix.",
          branch: "oc-1-fix-login",
          prUrl: null,
          createdAt: new Date("2026-08-14T10:30:00Z"),
        },
      ],
    });

    expect(events.map((event) => event.kind)).toEqual([
      "created",
      "claimed",
      "comment",
      "handoff",
      "current",
    ]);
    expect(events[0]).toMatchObject({
      actor: "owner@example.com",
      summary: "Card created: Fix login",
    });
    expect(events[1]).toMatchObject({
      actor: "codex",
      summary: "Claimed by codex",
    });
    expect(events[2]).toMatchObject({
      actor: "reviewer@example.com",
      detail: "Please retry with tests.",
    });
    expect(events[3]).toMatchObject({
      actor: "agent",
      summary: "Handoff: Implemented fix.",
    });
    expect(events[4]).toMatchObject({ summary: "Current status: done · review" });
  });
});
