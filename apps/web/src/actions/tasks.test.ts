import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { project, task } from "@agent-board/db";
import { closeTestWorld, createTestWorld, type TestWorld } from "../mcp/test-db";
import { createBoardTask } from "./tasks";

const VALID_INPUT = {
  title: "Second repo card",
  type: "feature",
  priority: "media",
  what: "Add scoped card.",
  why: "Cards must land in the selected repo.",
  howToConfirm: "The short ID uses the selected project prefix.",
};

describe("createBoardTask", () => {
  let world: TestWorld | null = null;

  afterEach(async () => {
    if (world) await closeTestWorld(world);
    world = null;
  });

  it("creates a board card in the selected project", async () => {
    world = await createTestWorld();
    const current = world;
    const [second] = await current.db
      .insert(project)
      .values({
        workspaceId: current.workspaceId,
        name: "API",
        repoUrl: "github.com/acme/api",
        idPrefix: "API",
        nextNumber: 4,
      })
      .returning({ id: project.id });
    if (!second) throw new Error("failed to insert second project");

    const result = await createBoardTask({
      database: current.db,
      workspaceId: current.workspaceId,
      userId: null,
      input: { ...VALID_INPUT, projectId: second.id },
    });

    expect(result).toEqual({ ok: true });

    const [created] = await current.db.select().from(task).where(eq(task.projectId, second.id));
    expect(created).toMatchObject({
      projectId: second.id,
      shortId: "API-4",
      title: "Second repo card",
    });

    const [updatedProject] = await current.db
      .select()
      .from(project)
      .where(eq(project.id, second.id));
    expect(updatedProject?.nextNumber).toBe(5);
  });

  it("rejects a project outside the workspace", async () => {
    world = await createTestWorld();
    const current = world;

    const result = await createBoardTask({
      database: current.db,
      workspaceId: "00000000-0000-0000-0000-000000000000",
      userId: null,
      input: { ...VALID_INPUT, projectId: current.projectId },
    });

    expect(result).toEqual({ ok: false, error: "Project not found." });
  });
});
