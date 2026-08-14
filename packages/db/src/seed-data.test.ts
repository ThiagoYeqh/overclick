import { describe, expect, it } from "vitest";
import { EXAMPLE_CARD, EXAMPLE_PROJECT, EXAMPLE_WORKSPACE } from "./seed-data";

describe("seed payload (spec §6 onboarding)", () => {
  it("ships one workspace, one project and one example card", () => {
    expect(EXAMPLE_WORKSPACE.name).toBe("Agent Board");
    expect(EXAMPLE_PROJECT.idPrefix).toBe("AGB");
    expect(EXAMPLE_PROJECT.nextNumber).toBe(2);
    expect(EXAMPLE_CARD.shortId).toBe("AGB-1");
    expect(EXAMPLE_CARD.status).toBe("aberto");
    expect(EXAMPLE_CARD.isExample).toBe(true);
  });

  it("example card has the full contract: O quê / Por quê / Como confirmo", () => {
    expect(EXAMPLE_CARD.oQue.length).toBeGreaterThan(20);
    expect(EXAMPLE_CARD.porQue.length).toBeGreaterThan(10);
    expect(EXAMPLE_CARD.comoConfirmo).toMatch(/Validar/);
  });
});
