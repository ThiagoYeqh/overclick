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
  task_list:
    "Fila de cards do workspace. Filtros: projeto, missão, status, prioridade, awaiting_review_by.",
  task_get:
    "Card autocontido: contrato + harness + missão + convenção de branch (markdown).",
  task_create:
    "Cria um card. Workspace vem do token. Missão declarada pelo caller. mode solo|team.",
  task_claim:
    "Pega o card (status → em execução), cria ExecutionAttempt e devolve o briefing.",
  task_update:
    "Registra progresso, comentário, marca revisado ou reclassifica o harness do card.",
  task_deliver:
    "Entrega o resultado: resumo, evidências, artefatos, usage. Status → feito.",
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
  const server = new McpServer({ name: "overclick", version: "0.1.0" });

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
