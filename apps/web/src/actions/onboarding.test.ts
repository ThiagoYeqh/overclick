import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { project } from "@agent-board/db";
import { closeTestWorld, createTestWorld, type TestWorld } from "../mcp/test-db";
import { saveProject } from "./onboarding";

describe("saveProject", () => {
  let world: TestWorld | null = null;

  afterEach(async () => {
    if (world) await closeTestWorld(world);
    world = null;
  });

  it("creates a second project when createNew is true", async () => {
    world = await createTestWorld();
    const current = world;

    const result = await saveProject({
      database: current.db,
      workspaceId: current.workspaceId,
      input: {
        createNew: true,
        name: "API",
        repoUrl: "github.com/acme/api",
        prefix: "API",
      },
    });

    expect(result).toEqual({ ok: true });

    const rows = await current.db
      .select()
      .from(project)
      .where(eq(project.workspaceId, current.workspaceId));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.idPrefix).sort()).toEqual(["API", "OC"]);
  });

  it("edits only the requested workspace project", async () => {
    world = await createTestWorld();
    const current = world;
    const [second] = await current.db
      .insert(project)
      .values({
        workspaceId: current.workspaceId,
        name: "API",
        repoUrl: "github.com/acme/api",
        idPrefix: "API",
      })
      .returning({ id: project.id });
    if (!second) throw new Error("failed to insert second project");

    const result = await saveProject({
      database: current.db,
      workspaceId: current.workspaceId,
      input: {
        projectId: second.id,
        name: "API v2",
        repoUrl: "github.com/acme/api-v2",
        prefix: "APV",
      },
    });

    expect(result).toEqual({ ok: true });

    const rows = await current.db
      .select()
      .from(project)
      .where(eq(project.workspaceId, current.workspaceId));
    const original = rows.find((row) => row.id === current.projectId);
    const edited = rows.find((row) => row.id === second.id);
    expect(original?.idPrefix).toBe("OC");
    expect(edited).toMatchObject({
      name: "API v2",
      repoUrl: "github.com/acme/api-v2",
      idPrefix: "APV",
    });
  });

  it("rejects editing a project outside the workspace", async () => {
    world = await createTestWorld();
    const current = world;

    const result = await saveProject({
      database: current.db,
      workspaceId: "00000000-0000-0000-0000-000000000000",
      input: {
        projectId: current.projectId,
        name: "Wrong workspace",
        repoUrl: "",
        prefix: "WRG",
      },
    });

    expect(result).toEqual({ ok: false, error: "Project not found." });
  });
});
