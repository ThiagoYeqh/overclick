import { CARDAPIO_TASK_TYPES } from "@agent-board/mcp-core";
import { describe, expect, it } from "vitest";
import { factoryCardapioPolicy } from "./cardapio";

describe("factory cardápio policy seed", () => {
  it("seeds every factory type as CLI · model · effort with no skills", () => {
    const rows = factoryCardapioPolicy();
    expect(rows.map((row) => row.type)).toEqual([...CARDAPIO_TASK_TYPES]);
    expect(rows[0]).toMatchObject({
      type: "bug",
      cli: null,
      model: "sonnet-5",
      effort: "medium",
    });
    for (const row of rows) {
      expect(row).not.toHaveProperty("skills");
    }
  });
});
