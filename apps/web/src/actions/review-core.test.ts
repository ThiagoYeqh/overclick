import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { executionAttempt, task, taskComment } from "@agent-board/db";
import { closeTestWorld, createTestWorld, type TestWorld } from "../mcp/test-db";
import { reopenTask } from "./review-core";

describe("reopenTask", () => {
  let world: TestWorld | null = null;

  afterEach(async () => {
    if (world) await closeTestWorld(world);
    world = null;
  });

  it("reopens an in-progress stuck card, clears claim fields, and records a comment", async () => {
    world = await createTestWorld();
    const [created] = await world.db
      .insert(task)
      .values({
        projectId: world.projectId,
        shortId: "OC-99",
        title: "Stuck card",
        oQue: "Release a stuck card.",
        porQue: "The agent died.",
        comoConfirmo: "Card is open again.",
        status: "em_execucao",
        claimedAt: new Date("2026-08-14T10:00:00Z"),
        claimedByExecutor: "codex",
        claimedByTokenId: world.tokenId,
      })
      .returning({ id: task.id });
    expect(created).toBeDefined();

    await world.db.insert(executionAttempt).values({
      taskId: created.id,
      executor: "codex",
      model: "gpt-5",
      startedAt: new Date("2026-08-14T10:00:00Z"),
    });

    const result = await reopenTask({
      database: world.db,
      taskId: created.id,
      comment: "Agent process is gone; retry.",
      userId: null,
    });

    expect(result).toEqual({ ok: true });

    const [row] = await world.db.select().from(task).where(eq(task.id, created.id));
    expect(row?.status).toBe("aberto");
    expect(row?.claimedAt).toBeNull();
    expect(row?.claimedByExecutor).toBeNull();
    expect(row?.claimedByTokenId).toBeNull();

    const comments = await world.db
      .select()
      .from(taskComment)
      .where(eq(taskComment.taskId, created.id));
    expect(comments.map((comment) => comment.body)).toEqual(["Agent process is gone; retry."]);
  });
});
