import { describe, expect, it } from "vitest";
import {
  ALL_PROJECTS,
  NO_MISSION,
  countLooseCards,
  filterBoardCards,
  missionFilterOptions,
  resolveBoardFilter,
  searchMissions,
  shouldSearchMissions,
} from "./board-filter";

const projects = [{ id: "p1" }, { id: "p2" }];
const missions = [{ id: "m1" }, { id: "m2" }];
const titled = [
  { id: "m1", title: "Onboarding" },
  { id: "m2", title: "Cobrança" },
  { id: "m3", title: "Empty elsewhere" },
];
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

  it("keeps a no-mission bucket instead of hiding the loose cards", () => {
    expect(
      resolveBoardFilter(
        { projectId: ALL_PROJECTS, missionId: NO_MISSION },
        projects,
        missions,
      ),
    ).toEqual({ projectId: ALL_PROJECTS, missionId: NO_MISSION });

    const loose = filterBoardCards(cards, {
      projectId: ALL_PROJECTS,
      missionId: NO_MISSION,
    });
    expect(loose.map((card) => card.id)).toEqual(["b"]);
  });

  it("counts the loose cards of the project on screen", () => {
    expect(countLooseCards(cards, { projectId: "p1", missionId: null })).toBe(1);
    expect(countLooseCards(cards, { projectId: "p2", missionId: null })).toBe(0);
    expect(
      countLooseCards(cards, { projectId: ALL_PROJECTS, missionId: "m1" }),
    ).toBe(1);
  });
});

describe("the missions the filter offers", () => {
  it("offers only what holds cards here, each with its count", () => {
    expect(
      missionFilterOptions(cards, titled, { projectId: "p1", missionId: null }),
    ).toEqual([{ id: "m1", title: "Onboarding", count: 1 }]);

    expect(
      missionFilterOptions(cards, titled, {
        projectId: ALL_PROJECTS,
        missionId: null,
      }),
    ).toEqual([
      { id: "m1", title: "Onboarding", count: 1 },
      { id: "m2", title: "Cobrança", count: 1 },
    ]);
  });

  it("keeps the mission being filtered by, so it can be cleared", () => {
    expect(
      missionFilterOptions(cards, titled, { projectId: "p1", missionId: "m2" }),
    ).toEqual([
      { id: "m1", title: "Onboarding", count: 1 },
      { id: "m2", title: "Cobrança", count: 0 },
    ]);
  });

  it("counts every card of the mission, not just the first", () => {
    const many = [
      ...cards,
      { id: "d", projectId: "p1", missionId: "m1" },
      { id: "e", projectId: "p1", missionId: "m1" },
    ];
    expect(
      missionFilterOptions(many, titled, { projectId: "p1", missionId: null }),
    ).toEqual([{ id: "m1", title: "Onboarding", count: 3 }]);
  });

  it("grows a search box only past a handful", () => {
    expect(shouldSearchMissions(8)).toBe(false);
    expect(shouldSearchMissions(9)).toBe(true);
  });

  it("searches ignoring case and accents", () => {
    const options = [
      { id: "m1", title: "Onboarding", count: 2 },
      { id: "m2", title: "Cobrança", count: 1 },
    ];
    expect(searchMissions(options, "cobranca").map((o) => o.id)).toEqual(["m2"]);
    expect(searchMissions(options, "ONBOARD").map((o) => o.id)).toEqual(["m1"]);
    expect(searchMissions(options, "  ").map((o) => o.id)).toEqual(["m1", "m2"]);
    expect(searchMissions(options, "nothing")).toEqual([]);
  });
});
