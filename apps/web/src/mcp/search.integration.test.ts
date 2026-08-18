import {
  TaskCreateOutputSchema,
  TaskSearchOutputSchema,
} from "@agent-board/mcp-core";
import { project } from "@agent-board/db";
import { afterEach, describe, expect, it } from "vitest";
import { closeTestWorld, createTestWorld, type TestWorld } from "./test-db";
import { invokeTool } from "./tools";

const origem = { session_id: "sess_search", cli: "overclock" };

describe("task_search", () => {
  let world: TestWorld;

  afterEach(async () => {
    if (world) await closeTestWorld(world);
  });

  function ctx() {
    return {
      tokenId: world.tokenId,
      workspaceId: world.workspaceId,
      tokenLabel: "test",
    };
  }

  async function card(
    title: string,
    extra: Partial<{
      o_que: string;
      por_que: string;
      type: "feature" | "bug" | "rfc";
      project_id: string;
    }> = {},
  ) {
    const created = await invokeTool(world.db, ctx(), "task_create", {
      project_id: extra.project_id ?? world.projectId,
      title,
      type: extra.type ?? "bug",
      o_que: extra.o_que ?? "x",
      por_que: extra.por_que ?? "y",
      como_confirmo: [{ step: "a", expected: "b" }],
      origem,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("card not created");
    return TaskCreateOutputSchema.parse(created.value).task;
  }

  it("finds cards by words in title, o_que, por_que and comments, best match first", async () => {
    world = await createTestWorld();
    const byTitle = await card("Terminal panes go black under memory pressure");
    const byBody = await card("Odd rendering", {
      o_que: "black panes after the machine swaps",
    });
    const byWhy = await card("Slow start", {
      por_que: "users see black screens for a while",
    });
    const byComment = await card("Unrelated title");
    await invokeTool(world.db, ctx(), "task_update", {
      task_id: byComment.id,
      comment: "reporter says the panes turn black too",
      comment_kind: "report",
    });
    await card("Login button misaligned");

    const res = await invokeTool(world.db, ctx(), "task_search", {
      q: "black panes",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const out = TaskSearchOutputSchema.parse(res.value);
    const ids = out.tasks.map((t) => t.id);
    expect(ids).toContain(byTitle.id);
    expect(ids).toContain(byBody.id);
    expect(ids).toContain(byWhy.id);
    expect(ids).toContain(byComment.id);
    expect(out.tasks[0]?.id).toBe(byTitle.id);
    const hit = out.tasks.find((t) => t.id === byComment.id);
    expect(hit?.reports_count).toBe(1);
    expect(hit?.comments_count).toBe(1);
    expect(hit?.resolved_in).toBeNull();
    expect(hit?.o_que).toBe("x");
  });

  it("returns [] when nothing matches and truncates o_que to 300 chars", async () => {
    world = await createTestWorld();
    await card("Long body", { o_que: "z".repeat(1000) });
    const none = await invokeTool(world.db, ctx(), "task_search", {
      q: "unicorn sparkles",
    });
    expect(none.ok).toBe(true);
    if (!none.ok) return;
    expect(TaskSearchOutputSchema.parse(none.value).tasks).toEqual([]);

    const some = await invokeTool(world.db, ctx(), "task_search", {
      q: "long body",
    });
    expect(some.ok).toBe(true);
    if (!some.ok) return;
    const out = TaskSearchOutputSchema.parse(some.value);
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0]?.o_que).toHaveLength(300);
  });

  it("filters by project (prefix or uuid), type, status, and honours limit ≤ 20", async () => {
    world = await createTestWorld();
    const [other] = await world.db
      .insert(project)
      .values({
        workspaceId: world.workspaceId,
        name: "Other",
        idPrefix: "OTH",
        nextNumber: 1,
      })
      .returning({ id: project.id });
    if (!other) throw new Error("no project");
    const inMain = await card("Search scope alpha");
    const inOther = await card("Search scope beta", { project_id: other.id });
    const feature = await card("Search scope gamma", { type: "feature" });

    const byPrefix = await invokeTool(world.db, ctx(), "task_search", {
      q: "search scope",
      project_id: "OTH",
    });
    expect(byPrefix.ok).toBe(true);
    if (!byPrefix.ok) return;
    expect(
      TaskSearchOutputSchema.parse(byPrefix.value).tasks.map((t) => t.id),
    ).toEqual([inOther.id]);

    const byType = await invokeTool(world.db, ctx(), "task_search", {
      q: "search scope",
      type: "feature",
    });
    expect(byType.ok).toBe(true);
    if (!byType.ok) return;
    expect(
      TaskSearchOutputSchema.parse(byType.value).tasks.map((t) => t.id),
    ).toEqual([feature.id]);

    const claimed = await invokeTool(world.db, ctx(), "task_claim", {
      task_id: inMain.id,
    });
    expect(claimed.ok).toBe(true);
    const byStatus = await invokeTool(world.db, ctx(), "task_search", {
      q: "search scope",
      status: ["em_execucao"],
    });
    expect(byStatus.ok).toBe(true);
    if (!byStatus.ok) return;
    expect(
      TaskSearchOutputSchema.parse(byStatus.value).tasks.map((t) => t.id),
    ).toEqual([inMain.id]);

    for (let i = 0; i < 25; i++) await card(`Search scope bulk ${i}`);
    const capped = await invokeTool(world.db, ctx(), "task_search", {
      q: "search scope",
      limit: 20,
    });
    expect(capped.ok).toBe(true);
    if (!capped.ok) return;
    expect(TaskSearchOutputSchema.parse(capped.value).tasks).toHaveLength(20);

    const dflt = await invokeTool(world.db, ctx(), "task_search", {
      q: "search scope",
    });
    expect(dflt.ok).toBe(true);
    if (!dflt.ok) return;
    expect(TaskSearchOutputSchema.parse(dflt.value).tasks).toHaveLength(5);

    const tooMany = await invokeTool(world.db, ctx(), "task_search", {
      q: "search scope",
      limit: 21,
    });
    expect(tooMany.ok).toBe(false);
    if (tooMany.ok) return;
    expect(tooMany.error.code).toBe("INVALID_ARGUMENT");
  });

  it("never sees another workspace's cards and returns NOT_FOUND for an unknown project", async () => {
    world = await createTestWorld();
    await card("Private to this workspace");
    const foreign = await invokeTool(
      world.db,
      {
        tokenId: world.tokenId,
        workspaceId: "00000000-0000-4000-8000-000000000bad",
        tokenLabel: "x",
      },
      "task_search",
      { q: "private" },
    );
    expect(foreign.ok).toBe(true);
    if (!foreign.ok) return;
    expect(TaskSearchOutputSchema.parse(foreign.value).tasks).toEqual([]);

    const noProj = await invokeTool(world.db, ctx(), "task_search", {
      q: "private",
      project_id: "NOPE",
    });
    expect(noProj.ok).toBe(false);
    if (noProj.ok) return;
    expect(noProj.error.code).toBe("NOT_FOUND");
  });

  it("falls back to substring match when the query is a single fragment tsquery would drop", async () => {
    world = await createTestWorld();
    const c = await card("Card AGB-4711 dependency");
    const res = await invokeTool(world.db, ctx(), "task_search", { q: "4711" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(
      TaskSearchOutputSchema.parse(res.value).tasks.map((t) => t.id),
    ).toEqual([c.id]);
  });
});
