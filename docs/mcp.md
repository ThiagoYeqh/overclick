# MCP — OverClick

O board expõe as 11 tools do MVP em **streamable HTTP** no mesmo processo do app.

## Conectar

Substitua o host e cole o token gerado na UI (ele só aparece inteiro uma vez):

```bash
claude mcp add --transport http overclick http://<seu-host>/mcp \
  --header "Authorization: Bearer agb_live_••••••••••••"
```

Outros clientes HTTP (Codex, Gemini CLI, Overclock) usam o mesmo URL e o mesmo header `Authorization: Bearer …`.

O workspace é resolvido pelo token. Token revogado ou ausente → **HTTP 401**.

## Tools

| Tool | Faz |
|---|---|
| `mission_list` / `mission_get` | missões e o contexto para o prompt |
| `task_list` | fila (projeto, status, prioridade, `awaiting_review_by`) |
| `task_get` | briefing md autocontido (contrato + harness + missão + branch) |
| `task_create` | cria o card (missão declarada, `mode` solo\|team, origem) |
| `task_claim` | status → `em_execucao`; segundo claim → `ALREADY_CLAIMED` |
| `task_update` | progresso, comentário ou `revisado` |
| `handoff_submit` | resultado + usage; status → `feito`; roteia para `devolve_para` |
| `branch_register` | grava a branch no card |
| `harness_recommend` | lookup da política (tipo → CLI · modelo · effort) |
| `harness_list` | política inteira + executores configurados |

`task_claim` e `task_get` devolvem o briefing — o executor não precisa de outra fonte de contexto.
