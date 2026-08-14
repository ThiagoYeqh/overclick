import { describe, expect, it } from "vitest";
import { branchConvention, type Mission, type Task } from "@agent-board/mcp-core";
import { renderBriefingMarkdown } from "./briefing";

const task: Task = {
  id: "11111111-1111-4111-8111-111111111111",
  short_id: "OC-123",
  title: "Corrige login",
  type: "bug",
  status: "aberto",
  revisado: false,
  priority: "alta",
  project_id: "proj_1",
  mission_id: "miss_1",
  workspace_id: "ws_1",
  parent_id: null,
  o_que: "O login volta a autenticar.",
  por_que: "Ninguém entra.",
  como_confirmo: [{ step: "abre /login", expected: "entra na home" }],
  harness: { cli: "claude-code", model: "sonnet-5", effort: "medium" },
  origem: { cli: "overclock", session_id: "sess_torre" },
  mode: "solo",
  devolve_para: { kind: "workspace_queue" },
  branch: null,
  pull_request_url: null,
  reopen_comment: "faltou o teste do login",
  claimed_by: null,
  created_at: "2026-08-14T12:00:00.000Z",
  updated_at: "2026-08-14T12:00:00.000Z",
};

const mission: Mission = {
  id: "miss_1",
  title: "Norte do board",
  status: "ativa",
  objective: "Fechar o loop MCP.",
  context: "O board é a fonte de verdade do trabalho.",
};

describe("self-contained briefing markdown", () => {
  it("embeds contract, harness, mission context and branch convention", () => {
    const convention = branchConvention(task.short_id, task.title);
    const md = renderBriefingMarkdown({ task, mission, branchConvention: convention });

    expect(md).toContain("# OC-123 — Corrige login");
    expect(md).toContain("O login volta a autenticar.");
    expect(md).toContain("Ninguém entra.");
    expect(md).toContain("abre /login");
    expect(md).toContain("entra na home");
    expect(md).toContain("sonnet-5");
    expect(md).toContain("claude-code");
    expect(md).not.toContain("qa-fix-protocol");
    expect(md).not.toMatch(/skills/i);
    expect(md).toContain("Fechar o loop MCP.");
    expect(md).toContain("O board é a fonte de verdade do trabalho.");
    expect(md).toContain(convention.branch);
    expect(md).toContain(convention.commit_prefix);
    expect(md).toContain("faltou o teste do login");
  });
});
