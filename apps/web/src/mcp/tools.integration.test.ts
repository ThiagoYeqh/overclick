import {
  TaskDeliverOutputSchema,
  HarnessRecommendOutputSchema,
  MissionListOutputSchema,
  TaskCreateOutputSchema,
  TaskDeleteOutputSchema,
  TaskListOutputSchema,
  TaskUpdateOutputSchema,
} from "@agent-board/mcp-core";
import { executionAttempt, handoff, mission, task } from "@agent-board/db";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { closeTestWorld, createTestWorld, type TestWorld } from "./test-db";
import { invokeTool } from "./tools";

const origem = {
  session_id: "sess_torre",
  cli: "overclock",
};

describe("MCP tool edge cases against a test db", () => {
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

  it("creates a team card with scoped subtasks and recommended harness", async () => {
    world = await createTestWorld();
    const created = await invokeTool(world.db, ctx(), "task_create", {
      mission: world.missionId,
      project_id: world.projectId,
      title: "RFC de auth",
      type: "rfc",
      o_que: "Desenhar auth.",
      por_que: "Precisamos de um contrato.",
      como_confirmo: [{ step: "lê o RFC", expected: "aprovável" }],
      mode: "team",
      origem,
      devolve_para: { kind: "agent", session_id: "sess_torre" },
      subtasks: [
        {
          title: "Pesquisar opções",
          scope: "levantar 3 abordagens",
          boundary: "não implementar",
        },
        {
          title: "Escrever o RFC",
          scope: "documento markdown",
          boundary: "sem código de produto",
        },
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const out = TaskCreateOutputSchema.parse(created.value);
    expect(out.task.mode).toBe("team");
    expect(out.task.o_que).toContain("## Plano");
    expect(out.subtasks).toHaveLength(2);
    expect(out.subtasks[0]?.short_id).toBe(`${out.task.short_id}.1`);
    expect(out.task.harness?.model).toBe("opus-4-8");
  });

  it("accepts handoff without usage and marks telemetry incomplete", async () => {
    world = await createTestWorld();
    const created = await invokeTool(world.db, ctx(), "task_create", {
      project_id: world.projectId,
      title: "Sem telemetria",
      type: "feature",
      o_que: "Um card.",
      por_que: "Agente genérico.",
      como_confirmo: [{ step: "existe", expected: "ok" }],
      origem,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const card = TaskCreateOutputSchema.parse(created.value).task;

    const claimed = await invokeTool(world.db, ctx(), "task_claim", {
      task_id: card.id,
    });
    expect(claimed.ok).toBe(true);

    const submitted = await invokeTool(world.db, ctx(), "task_deliver", {
      task_id: card.id,
      summary: "pronto para ler",
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const handoff = TaskDeliverOutputSchema.parse(submitted.value);
    expect(handoff.telemetry_incomplete).toBe(true);
    expect(handoff.task.status).toBe("feito");
  });

  it("rejects handoff from aberto via the state machine", async () => {
    world = await createTestWorld();
    const created = await invokeTool(world.db, ctx(), "task_create", {
      project_id: world.projectId,
      title: "Ainda aberto",
      type: "bug",
      o_que: "x",
      por_que: "y",
      como_confirmo: [{ step: "a", expected: "b" }],
      origem,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const card = TaskCreateOutputSchema.parse(created.value).task;

    const submitted = await invokeTool(world.db, ctx(), "task_deliver", {
      task_id: card.id,
      summary: "cedo demais",
    });
    expect(submitted.ok).toBe(false);
    if (!submitted.ok) {
      expect(submitted.error.code).toBe("INVALID_TRANSITION");
    }
  });

  it("lists missions, recommends harness, registers a branch and marks revisado", async () => {
    world = await createTestWorld();

    const missions = await invokeTool(world.db, ctx(), "mission_list", {});
    expect(missions.ok).toBe(true);
    if (!missions.ok) return;
    expect(MissionListOutputSchema.parse(missions.value).missions[0]?.title).toBe(
      "Norte do board",
    );

    const rec = await invokeTool(world.db, ctx(), "harness_recommend", {
      type: "bug",
    });
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    expect(HarnessRecommendOutputSchema.parse(rec.value).harness.model).toBe(
      "sonnet-5",
    );

    const created = await invokeTool(world.db, ctx(), "task_create", {
      project_id: world.projectId,
      title: "Branch e review",
      type: "bug",
      o_que: "x",
      por_que: "y",
      como_confirmo: [{ step: "a", expected: "b" }],
      origem,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const card = TaskCreateOutputSchema.parse(created.value).task;

    const branched = await invokeTool(world.db, ctx(), "branch_register", {
      task_id: card.short_id,
      branch: "oc-2-branch-e-review",
    });
    expect(branched.ok).toBe(true);

    await invokeTool(world.db, ctx(), "task_claim", { task_id: card.id });
    await invokeTool(world.db, ctx(), "task_deliver", {
      task_id: card.id,
      summary: "feito",
    });

    const reviewed = await invokeTool(world.db, ctx(), "task_update", {
      task_id: card.id,
      revisado: true,
      comment: "ok pela torre",
    });
    expect(reviewed.ok).toBe(true);
    if (!reviewed.ok) return;
    expect(TaskUpdateOutputSchema.parse(reviewed.value).task.revisado).toBe(true);
  });

  it("scopes task_list to one mission via mission_id", async () => {
    world = await createTestWorld();
    const [secondMission] = await world.db
      .insert(mission)
      .values({
        workspaceId: world.workspaceId,
        title: "Segunda missão",
        objective: "Separar a fila.",
        status: "ativa",
      })
      .returning({ id: mission.id });
    if (!secondMission) throw new Error("failed to insert second mission");

    const inFirst = await invokeTool(world.db, ctx(), "task_create", {
      mission: world.missionId,
      project_id: world.projectId,
      title: "Card da primeira missão",
      type: "feature",
      o_que: "x",
      por_que: "y",
      como_confirmo: [{ step: "a", expected: "b" }],
      origem,
    });
    expect(inFirst.ok).toBe(true);
    const inSecond = await invokeTool(world.db, ctx(), "task_create", {
      mission: secondMission.id,
      project_id: world.projectId,
      title: "Card da segunda missão",
      type: "feature",
      o_que: "x",
      por_que: "y",
      como_confirmo: [{ step: "a", expected: "b" }],
      origem,
    });
    expect(inSecond.ok).toBe(true);

    const listed = await invokeTool(world.db, ctx(), "task_list", {
      mission_id: secondMission.id,
    });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const out = TaskListOutputSchema.parse(listed.value);
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0]?.title).toBe("Card da segunda missão");
    expect(out.tasks[0]?.mission_id).toBe(secondMission.id);

    const listedFirst = await invokeTool(world.db, ctx(), "task_list", {
      mission_id: world.missionId,
    });
    expect(listedFirst.ok).toBe(true);
    if (!listedFirst.ok) return;
    const first = TaskListOutputSchema.parse(listedFirst.value);
    expect(first.tasks).toHaveLength(1);
    expect(first.tasks[0]?.title).toBe("Card da primeira missão");
  });

  it("hard deletes a claimed card and cascades its execution attempts", async () => {
    world = await createTestWorld();
    const created = await invokeTool(world.db, ctx(), "task_create", {
      project_id: world.projectId,
      title: "Card para deletar",
      type: "feature",
      o_que: "x",
      por_que: "y",
      como_confirmo: [{ step: "a", expected: "b" }],
      origem,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const card = TaskCreateOutputSchema.parse(created.value).task;

    const claimed = await invokeTool(world.db, ctx(), "task_claim", {
      task_id: card.id,
    });
    expect(claimed.ok).toBe(true);

    const deleted = await invokeTool(world.db, ctx(), "task_delete", {
      task_id: card.id,
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    const out = TaskDeleteOutputSchema.parse(deleted.value);
    expect(out.deleted).toBe(true);
    expect(out.short_id).toBe(card.short_id);
    expect(out.attempts_deleted).toBe(1);

    const taskRows = await world.db.select().from(task).where(eq(task.id, card.id));
    expect(taskRows).toHaveLength(0);
    const attemptRows = await world.db
      .select()
      .from(executionAttempt)
      .where(eq(executionAttempt.taskId, card.id));
    expect(attemptRows).toHaveLength(0);
  });

  it("hard deletes a delivered card and cascades its handoffs", async () => {
    world = await createTestWorld();
    const created = await invokeTool(world.db, ctx(), "task_create", {
      project_id: world.projectId,
      title: "Card entregue para deletar",
      type: "feature",
      o_que: "x",
      por_que: "y",
      como_confirmo: [{ step: "a", expected: "b" }],
      origem,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const card = TaskCreateOutputSchema.parse(created.value).task;

    await invokeTool(world.db, ctx(), "task_claim", { task_id: card.id });
    const delivered = await invokeTool(world.db, ctx(), "task_deliver", {
      task_id: card.id,
      summary: "entregue",
    });
    expect(delivered.ok).toBe(true);

    const deleted = await invokeTool(world.db, ctx(), "task_delete", {
      task_id: card.short_id,
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    const out = TaskDeleteOutputSchema.parse(deleted.value);
    expect(out.handoffs_deleted).toBe(1);
    expect(out.attempts_deleted).toBe(1);

    const handoffRows = await world.db
      .select()
      .from(handoff)
      .where(eq(handoff.taskId, card.id));
    expect(handoffRows).toHaveLength(0);
  });

  it("reclassifies the card harness via task_update, validated against executors", async () => {
    world = await createTestWorld();
    const created = await invokeTool(world.db, ctx(), "task_create", {
      project_id: world.projectId,
      title: "Card para reclassificar",
      type: "feature",
      o_que: "x",
      por_que: "y",
      como_confirmo: [{ step: "a", expected: "b" }],
      origem,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const card = TaskCreateOutputSchema.parse(created.value).task;

    const updated = await invokeTool(world.db, ctx(), "task_update", {
      task_id: card.id,
      harness: { cli: "claude-code", model: "haiku-4", effort: "low" },
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    const out = TaskUpdateOutputSchema.parse(updated.value);
    expect(out.task.harness).toEqual({
      cli: "claude-code",
      model: "haiku-4",
      effort: "low",
    });

    const fetched = await invokeTool(world.db, ctx(), "task_get", {
      task_id: card.id,
    });
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    const got = fetched.value as { task: { harness: unknown } };
    expect(got.task.harness).toEqual({
      cli: "claude-code",
      model: "haiku-4",
      effort: "low",
    });
  });

  it("rejects a harness whose model is not on any configured executor", async () => {
    world = await createTestWorld();
    const created = await invokeTool(world.db, ctx(), "task_create", {
      project_id: world.projectId,
      title: "Harness inválido",
      type: "feature",
      o_que: "x",
      por_que: "y",
      como_confirmo: [{ step: "a", expected: "b" }],
      origem,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const card = TaskCreateOutputSchema.parse(created.value).task;

    const badModel = await invokeTool(world.db, ctx(), "task_update", {
      task_id: card.id,
      harness: { model: "gpt-9-ultra", effort: "high" },
    });
    expect(badModel.ok).toBe(false);
    if (!badModel.ok) expect(badModel.error.code).toBe("INVALID_ARGUMENT");

    const badCli = await invokeTool(world.db, ctx(), "task_update", {
      task_id: card.id,
      harness: { cli: "codex", model: "haiku-4", effort: "low" },
    });
    expect(badCli.ok).toBe(false);
    if (!badCli.ok) expect(badCli.error.code).toBe("INVALID_ARGUMENT");
  });

  it("returns NOT_FOUND when deleting a card that does not exist", async () => {
    world = await createTestWorld();
    const deleted = await invokeTool(world.db, ctx(), "task_delete", {
      task_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(deleted.ok).toBe(false);
    if (!deleted.ok) {
      expect(deleted.error.code).toBe("NOT_FOUND");
    }
  });
});
