import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  MCP_TOOL_NAMES,
  toolContracts,
  type McpToolName,
} from "@agent-board/mcp-core";
import { invokeTool } from "./tools";
import type { AuthContext, McpDatabase } from "./types";

const DESCRIPTIONS: Record<McpToolName, string> = {
  mission_list: "Lista as missões do workspace e o contexto de cada uma.",
  mission_get:
    "Devolve a missão completa (objetivo/contexto) para injetar no prompt.",
  mission_create:
    "Cria uma missão no workspace (title, objective/context em markdown, status). Use o id retornado em task_create.mission.",
  task_list:
    "Fila de cards do workspace. Filtros: projeto, missão, status, prioridade, awaiting_review_by.",
  task_get:
    "Card autocontido: contrato + harness + missão + convenção de branch (markdown).",
  task_create:
    "Cria um card. Workspace vem do token. mission é o id de uma missão existente (mission_create / mission_list); omitido → card solto. mode solo|team.",
  task_claim:
    "Pega o card (status → em execução), cria ExecutionAttempt e devolve o briefing.",
  task_update:
    "Registra progresso, comentário, marca revisado, reclassifica o harness ou reporta/corrige usage do card (inclusive depois do deliver).",
  task_deliver:
    "Entrega o resultado: resumo, evidências, artefatos, usage. usage é OBRIGATÓRIO: sem números exatos, ESTIME tokens, turns e custo e marque estimated: true — o card rotula como estimativa. A duração é medida pelo servidor do claim ao deliver. how_to_verify (URL ou comando) abre o painel de validação leiga. Status → feito.",
  task_delete:
    "Hard delete: remove o card com attempts, handoffs e subtasks em cascata. Irreversível.",
  branch_register: "Grava a branch criada no card.",
  harness_recommend:
    "Lookup da política do cardápio: tipo → CLI · modelo · effort.",
  harness_list:
    "Política inteira do workspace (tipo → CLI · modelo · effort) e os executores configurados.",
};

function inputSchemaFor(name: McpToolName) {
  const schema = toolContracts[name].input;
  const inner = (schema as { _def?: { schema?: unknown } })._def?.schema;
  return (inner ?? schema) as typeof schema;
}

export function createOverclickMcpServer(opts: {
  db: McpDatabase;
  ctx: AuthContext;
}): McpServer {
  const server = new McpServer({ name: "overclick", version: "0.1.2" });

  for (const name of MCP_TOOL_NAMES) {
    server.registerTool(
      name,
      {
        description: DESCRIPTIONS[name],
        inputSchema: inputSchemaFor(name),
      },
      async (args: unknown) => {
        const result = await invokeTool(opts.db, opts.ctx, name, args);
        if (!result.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: {
                    code: result.error.code,
                    message: result.error.message,
                    details: result.error.details,
                  },
                }),
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result.value),
            },
          ],
        };
      },
    );
  }

  return server;
}
