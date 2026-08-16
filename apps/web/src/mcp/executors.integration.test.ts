import { workspace } from "@agent-board/db";
import {
  ExecutorsUpdateOutputSchema,
  HarnessListOutputSchema,
  HarnessRecommendOutputSchema,
} from "@agent-board/mcp-core";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { selectionFromConfig } from "../lib/executors";
import { closeTestWorld, createTestWorld, type TestWorld } from "./test-db";
import { invokeTool } from "./tools";

describe("executors_update manages the executor config over MCP", () => {
  let world: TestWorld;

  afterEach(async () => {
    if (world) await closeTestWorld(world);
  });

  function worker() {
    return {
      tokenId: world.tokenId,
      workspaceId: world.workspaceId,
      tokenLabel: "test-agent",
      canManage: false,
    };
  }

  function manager() {
    return {
      tokenId: world.manageTokenId,
      workspaceId: world.workspaceId,
      tokenLabel: "owner-console",
      canManage: true,
    };
  }

  async function storedConfig() {
    const [ws] = await world.db
      .select()
      .from(workspace)
      .where(eq(workspace.id, world.workspaceId))
      .limit(1);
    return ws?.executors ?? [];
  }

  it("adds a model that Settings, the policy selects and a card harness all see", async () => {
    world = await createTestWorld();
    const updated = await invokeTool(world.db, manager(), "executors_update", {
      cli: "claude-code",
      add_models: ["opus-5"],
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    const out = ExecutorsUpdateOutputSchema.parse(updated.value);
    expect(out.updated).toBe("claude-code");
    expect(out.removed).toBe(false);
    const row = out.executors.find((item) => item.id === "claude-code");
    expect(row?.models).toContain("opus-5");
    expect(row?.catalog).toContain("opus-5");
    expect(row?.enabled).toBe(true);

    // What Settings renders comes from selectionFromConfig over the stored
    // config: the model has to be in the editable list and checked.
    const sel = selectionFromConfig(await storedConfig());
    expect(sel.models["claude-code"]).toContain("opus-5");
    expect(sel.enabled["claude-code"]).toContain("opus-5");

    // And harness_list, which is what an agent reads, offers it too.
    const listed = await invokeTool(world.db, worker(), "harness_list", {});
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const executors = HarnessListOutputSchema.parse(listed.value).executors;
    expect(
      executors.find((item) => item.id === "claude-code")?.models,
    ).toContain("opus-5");

    // Selectable as a card harness: task_update validates against this config.
    const created = await invokeTool(world.db, worker(), "task_create", {
      project_id: world.projectId,
      title: "Card on the new model",
      type: "feature",
      o_que: "x",
      por_que: "y",
      como_confirmo: [{ step: "a", expected: "b" }],
      origem: { cli: "claude-code" },
      harness: { cli: "claude-code", model: "opus-5", effort: "high" },
    });
    expect(created.ok).toBe(true);
  });

  it("refuses a worker token and leaves the config untouched", async () => {
    world = await createTestWorld();
    const before = JSON.stringify(await storedConfig());

    const denied = await invokeTool(world.db, worker(), "executors_update", {
      cli: "codex",
      add_models: ["gpt-5.6-sol"],
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.error.code).toBe("PERMISSION_DENIED");
    expect(JSON.stringify(await storedConfig())).toBe(before);
  });

  it("adds a CLI that was not configured and resolves the agent's binary name", async () => {
    world = await createTestWorld();
    const added = await invokeTool(world.db, manager(), "executors_update", {
      cli: "codex",
      label: "Codex",
      add_models: ["gpt-5.6-sol"],
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(
      ExecutorsUpdateOutputSchema.parse(added.value).executors.find(
        (item) => item.id === "codex",
      ),
    ).toMatchObject({ label: "Codex", enabled: true, models: ["gpt-5.6-sol"] });

    // "claude" is what the CLI actually reports; it must not create a twin.
    const aliased = await invokeTool(world.db, manager(), "executors_update", {
      cli: "claude",
      add_models: ["haiku-4-5"],
    });
    expect(aliased.ok).toBe(true);
    if (!aliased.ok) return;
    const out = ExecutorsUpdateOutputSchema.parse(aliased.value);
    expect(out.updated).toBe("claude-code");
    expect(out.executors.filter((item) => item.id === "claude-code")).toHaveLength(1);
  });

  it("removes a model and warns about the policy line it orphans", async () => {
    world = await createTestWorld();
    const removed = await invokeTool(world.db, manager(), "executors_update", {
      cli: "claude-code",
      remove_models: ["sonnet-5"],
    });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    const out = ExecutorsUpdateOutputSchema.parse(removed.value);
    expect(
      out.executors.find((item) => item.id === "claude-code")?.models,
    ).not.toContain("sonnet-5");
    // The seeded factory policy sends features to sonnet-5.
    expect(out.policy_warnings?.join(" ")).toContain("feature");
    expect(out.policy_warnings?.join(" ")).toContain("harness_set");

    const rec = await invokeTool(world.db, worker(), "harness_recommend", {
      type: "feature",
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    expect(HarnessRecommendOutputSchema.parse(rec.value).available).toBe(false);
  });

  it("warns only about what this call broke, not about orphans it inherited", async () => {
    world = await createTestWorld();
    // Leave the board already broken: features point at a model nobody has.
    const first = await invokeTool(world.db, manager(), "executors_update", {
      cli: "claude-code",
      remove_models: ["sonnet-5"],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // The factory policy sends both bug and feature to sonnet-5.
    expect(ExecutorsUpdateOutputSchema.parse(first.value).policy_warnings).toEqual([
      expect.stringContaining("'bug'"),
      expect.stringContaining("'feature'"),
    ]);

    // An unrelated add must not re-report the orphan that was already there.
    const second = await invokeTool(world.db, manager(), "executors_update", {
      cli: "codex",
      add_models: ["gpt-5.6-sol"],
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(
      ExecutorsUpdateOutputSchema.parse(second.value).policy_warnings,
    ).toBeUndefined();
  });

  it("drops a whole CLI and reports an unknown one as NOT_FOUND", async () => {
    world = await createTestWorld();
    const dropped = await invokeTool(world.db, manager(), "executors_update", {
      cli: "claude-code",
      remove: true,
    });
    expect(dropped.ok).toBe(true);
    if (!dropped.ok) return;
    const out = ExecutorsUpdateOutputSchema.parse(dropped.value);
    expect(out.removed).toBe(true);
    expect(out.executors.map((item) => item.id)).not.toContain("claude-code");
    expect(await storedConfig()).toHaveLength(0);

    const missing = await invokeTool(world.db, manager(), "executors_update", {
      cli: "nothing-here",
      remove: true,
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error.code).toBe("NOT_FOUND");
    expect(missing.error.message).toContain("harness_list");
  });

  it("rejects a call that asks for nothing and one that mixes remove with edits", async () => {
    world = await createTestWorld();
    const empty = await invokeTool(world.db, manager(), "executors_update", {
      cli: "claude-code",
    });
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.error.code).toBe("INVALID_ARGUMENT");

    const mixed = await invokeTool(world.db, manager(), "executors_update", {
      cli: "claude-code",
      remove: true,
      add_models: ["opus-5"],
    });
    expect(mixed.ok).toBe(false);
    if (mixed.ok) return;
    expect(mixed.error.code).toBe("INVALID_ARGUMENT");
  });

  it("turns a CLI off without losing its models", async () => {
    world = await createTestWorld();
    const off = await invokeTool(world.db, manager(), "executors_update", {
      cli: "claude-code",
      enabled: false,
    });
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    const row = ExecutorsUpdateOutputSchema.parse(off.value).executors.find(
      (item) => item.id === "claude-code",
    );
    expect(row?.enabled).toBe(false);
    expect(row?.models).toEqual(["opus-4-8", "sonnet-5", "haiku-4"]);

    // harness_list only reports what is on, so the policy has nothing left.
    const listed = await invokeTool(world.db, worker(), "harness_list", {});
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(
      HarnessListOutputSchema.parse(listed.value).executors.find(
        (item) => item.id === "claude-code",
      )?.enabled,
    ).toBe(false);
  });
});
