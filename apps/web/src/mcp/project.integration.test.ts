import { project, workspace } from "@agent-board/db";
import {
  ProjectCreateOutputSchema,
  ProjectListOutputSchema,
  TaskCreateOutputSchema,
  TaskListOutputSchema,
} from "@agent-board/mcp-core";
import { afterEach, describe, expect, it } from "vitest";
import { closeTestWorld, createTestWorld, type TestWorld } from "./test-db";
import { invokeTool } from "./tools";

const origem = { session_id: "sess_fresh", cli: "claude-code" };

describe("projects over MCP", () => {
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

  function cardArgs(projectRef: string) {
    return {
      project_id: projectRef,
      title: "Primeiro card",
      type: "feature" as const,
      o_que: "Fechar o loop.",
      por_que: "Sem projeto não há card.",
      como_confirmo: [{ step: "roda o fluxo", expected: "card criado" }],
      mode: "solo" as const,
      origem,
    };
  }

  it("creates a project and a card in it using only MCP, no database access", async () => {
    world = await createTestWorld();

    const created = await invokeTool(world.db, ctx(), "project_create", {
      name: "Agent Board",
      repo_url: "https://github.com/ustoppble/overclick",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const out = ProjectCreateOutputSchema.parse(created.value);
    expect(out.project.id_prefix).toBe("AB");
    expect(out.project.name).toBe("Agent Board");
    expect(out.project.repo_url).toBe("https://github.com/ustoppble/overclick");
    expect(out.project.next_number).toBe(1);
    expect(out.project.cards).toEqual({
      total: 0,
      aberto: 0,
      em_execucao: 0,
      feito: 0,
      validado: 0,
    });

    const listed = await invokeTool(world.db, ctx(), "project_list", {});
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const list = ProjectListOutputSchema.parse(listed.value);
    expect(list.projects.map((row) => row.id_prefix)).toEqual(["OC", "AB"]);

    const byUuid = await invokeTool(
      world.db,
      ctx(),
      "task_create",
      cardArgs(out.project.id),
    );
    expect(byUuid.ok).toBe(true);
    if (!byUuid.ok) return;
    expect(TaskCreateOutputSchema.parse(byUuid.value).task.short_id).toBe("AB-1");

    const byPrefix = await invokeTool(
      world.db,
      ctx(),
      "task_create",
      cardArgs("ab"),
    );
    expect(byPrefix.ok).toBe(true);
    if (!byPrefix.ok) return;
    const second = TaskCreateOutputSchema.parse(byPrefix.value);
    expect(second.task.short_id).toBe("AB-2");
    expect(second.task.project_id).toBe(out.project.id);
  });

  it("counts cards by status in project_list", async () => {
    world = await createTestWorld();
    const created = await invokeTool(world.db, ctx(), "project_create", {
      name: "Counting",
    });
    if (!created.ok) throw new Error("project_create failed");
    const proj = ProjectCreateOutputSchema.parse(created.value).project;

    for (const _ of [1, 2, 3]) {
      const card = await invokeTool(
        world.db,
        ctx(),
        "task_create",
        cardArgs(proj.id_prefix),
      );
      expect(card.ok).toBe(true);
    }
    const claimed = await invokeTool(world.db, ctx(), "task_claim", {
      task_id: `${proj.id_prefix}-1`,
      executor: { cli: "claude-code", model: "sonnet-5" },
    });
    expect(claimed.ok).toBe(true);

    const listed = await invokeTool(world.db, ctx(), "project_list", {});
    if (!listed.ok) throw new Error("project_list failed");
    const row = ProjectListOutputSchema.parse(listed.value).projects.find(
      (item) => item.id === proj.id,
    );
    expect(row?.cards).toEqual({
      total: 3,
      aberto: 2,
      em_execucao: 1,
      feito: 0,
      validado: 0,
    });
    expect(row?.next_number).toBe(4);
  });

  it("takes an explicit prefix and refuses one already in use", async () => {
    world = await createTestWorld();

    const explicit = await invokeTool(world.db, ctx(), "project_create", {
      name: "Agent Board",
      id_prefix: "agb",
    });
    expect(explicit.ok).toBe(true);
    if (!explicit.ok) return;
    expect(ProjectCreateOutputSchema.parse(explicit.value).project.id_prefix).toBe(
      "AGB",
    );

    const clash = await invokeTool(world.db, ctx(), "project_create", {
      name: "Another Great Board",
    });
    expect(clash.ok).toBe(false);
    if (clash.ok) return;
    expect(clash.error.code).toBe("INVALID_ARGUMENT");
    expect(clash.error.message).toContain("AGB");
    expect(clash.error.message).toContain("already used");

    // The prefix of the seeded project is taken too, whatever the casing.
    const seeded = await invokeTool(world.db, ctx(), "project_create", {
      name: "Outro",
      id_prefix: "oc",
    });
    expect(seeded.ok).toBe(false);
  });

  it("rejects an invalid prefix and a name it cannot derive one from", async () => {
    world = await createTestWorld();

    const tooLong = await invokeTool(world.db, ctx(), "project_create", {
      name: "Board",
      id_prefix: "TOOLONG",
    });
    expect(tooLong.ok).toBe(false);
    if (tooLong.ok) return;
    expect(tooLong.error.code).toBe("INVALID_ARGUMENT");
    expect(tooLong.error.message).toContain("2 to 4 letters or digits");

    const underivable = await invokeTool(world.db, ctx(), "project_create", {
      name: "!!!",
    });
    expect(underivable.ok).toBe(false);
    if (underivable.ok) return;
    expect(underivable.error.code).toBe("INVALID_ARGUMENT");
    expect(underivable.error.message).toContain("id_prefix");
  });

  it("points an unknown project ref at project_list instead of leaking SQL", async () => {
    world = await createTestWorld();

    const created = await invokeTool(
      world.db,
      ctx(),
      "task_create",
      cardArgs("NOPE"),
    );
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("NOT_FOUND");
    expect(created.error.message).toContain("project_list");
    expect(created.error.message).not.toContain("select");

    const listed = await invokeTool(world.db, ctx(), "task_list", {
      project_id: "NOPE",
    });
    expect(listed.ok).toBe(false);
    if (listed.ok) return;
    expect(listed.error.code).toBe("NOT_FOUND");
    expect(listed.error.message).toContain("project_list");
  });

  it("filters task_list by the project prefix", async () => {
    world = await createTestWorld();
    const created = await invokeTool(world.db, ctx(), "project_create", {
      name: "Side Quest",
    });
    if (!created.ok) throw new Error("project_create failed");
    const proj = ProjectCreateOutputSchema.parse(created.value).project;
    const card = await invokeTool(
      world.db,
      ctx(),
      "task_create",
      cardArgs(proj.id),
    );
    expect(card.ok).toBe(true);

    const listed = await invokeTool(world.db, ctx(), "task_list", {
      project_id: "sq",
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const out = TaskListOutputSchema.parse(listed.value);
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0]?.short_id).toBe("SQ-1");
  });

  it("never shows or resolves a project from another workspace", async () => {
    world = await createTestWorld();

    const [otherWs] = await world.db
      .insert(workspace)
      .values({ name: "Other", executors: [] })
      .returning({ id: workspace.id });
    if (!otherWs) throw new Error("failed to insert other workspace");
    await world.db.insert(project).values({
      workspaceId: otherWs.id,
      name: "Other Board",
      idPrefix: "ZZ",
      nextNumber: 1,
    });

    const listed = await invokeTool(world.db, ctx(), "project_list", {});
    if (!listed.ok) throw new Error("project_list failed");
    const out = ProjectListOutputSchema.parse(listed.value);
    expect(out.projects.map((row) => row.id_prefix)).not.toContain("ZZ");

    const created = await invokeTool(
      world.db,
      ctx(),
      "task_create",
      cardArgs("ZZ"),
    );
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.code).toBe("NOT_FOUND");

    // The same prefix is free in this workspace: uniqueness is per workspace.
    const mine = await invokeTool(world.db, ctx(), "project_create", {
      name: "Zulu Zone",
    });
    expect(mine.ok).toBe(true);
    if (!mine.ok) return;
    expect(ProjectCreateOutputSchema.parse(mine.value).project.id_prefix).toBe("ZZ");
  });
});
