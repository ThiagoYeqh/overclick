import { FACTORY_CARDAPIO_POLICY } from "@agent-board/mcp-core";
import type { CardapioPolicyEntry } from "../types";

export function factoryCardapioPolicy(): CardapioPolicyEntry[] {
  return FACTORY_CARDAPIO_POLICY.map((row) => ({
    type: row.type,
    cli: row.cli,
    model: row.model,
    effort: row.effort,
  }));
}
