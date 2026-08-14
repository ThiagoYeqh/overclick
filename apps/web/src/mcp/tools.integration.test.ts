import {
  TaskDeliverOutputSchema,
  HarnessRecommendOutputSchema,
  MissionListOutputSchema,
  TaskCreateOutputSchema,
  TaskUpdateOutputSchema,
} from "@agent-board/mcp-core";
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
});
