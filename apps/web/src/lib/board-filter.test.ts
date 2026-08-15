import { describe, expect, it } from "vitest";
import {
  ALL_PROJECTS,
  filterBoardCards,
  resolveBoardFilter,
} from "./board-filter";

const projects = [{ id: "p1" }, { id: "p2" }];
const missions = [{ id: "m1" }, { id: "m2" }];
const cards = [
  { id: "a", projectId: "p1", missionId: "m1" },
  { id: "b", projectId: "p1", missionId: null },
  { id: "c", projectId: "p2", missionId: "m2" },
];

describe("board filters", () => {
  it("defaults to the first project when the user has no stored choice", () => {
    expect(resolveBoardFilter({ projectId: null, missionId: null }, projects, missions)).toEqual({
      projectId: "p1",
      missionId: null,
    });
  });

  it("keeps All projects and a known mission", () => {
    expect(
      resolveBoardFilter(
        { projectId: ALL_PROJECTS, missionId: "m2" },
        projects,
        missions,
      ),
    ).toEqual({ projectId: ALL_PROJECTS, missionId: "m2" });
  });

  it("falls back when the stored project or mission disappeared", () => {
    expect(
      resolveBoardFilter(
        { projectId: "gone", missionId: "gone" },
        projects,
        missions,
      ),
    ).toEqual({ projectId: "p1", missionId: null });
  });

  it("filters cards by project and mission; counters follow the list", () => {
    const onlyP1 = filterBoardCards(cards, { projectId: "p1", missionId: null });
    expect(onlyP1.map((card) => card.id)).toEqual(["a", "b"]);

    const mission = filterBoardCards(cards, { projectId: ALL_PROJECTS, missionId: "m2" });
    expect(mission.map((card) => card.id)).toEqual(["c"]);

    const both = filterBoardCards(cards, { projectId: "p1", missionId: "m1" });
    expect(both.map((card) => card.id)).toEqual(["a"]);
  });
});
