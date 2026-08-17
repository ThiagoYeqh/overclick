import { describe, expect, it } from "vitest";
import {
  ALL_PROJECTS,
  NO_MISSION,
  boardFilterFromQuery,
  boardFilterToQuery,
  countLooseCards,
  encodeProjectSelection,
  filterBoardCards,
  missionFilterOptions,
  projectFilterOptions,
  resolveBoardFilter,
  resolveProjectSelection,
  searchMissions,
  shouldSearchMissions,
  toggleProject,
} from "./board-filter";

const projects = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
const named = [
  { id: "p1", name: "Board" },
  { id: "p2", name: "Funnel" },
  { id: "p3", name: "Empty" },
];
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
const ALL: string[] = [];

describe("board filters", () => {
  it("defaults to the first project when the user has no stored choice", () => {
    expect(resolveBoardFilter({ projectId: null, missionId: null }, projects, missions)).toEqual({
      projectIds: ["p1"],
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
    ).toEqual({ projectIds: ALL, missionId: "m2" });
  });

  it("falls back when the stored project or mission disappeared", () => {
    expect(
      resolveBoardFilter(
        { projectId: "gone", missionId: "gone" },
        projects,
        missions,
      ),
    ).toEqual({ projectIds: ["p1"], missionId: null });
  });

  it("filters cards by project and mission; counters follow the list", () => {
    const onlyP1 = filterBoardCards(cards, { projectIds: ["p1"], missionId: null });
    expect(onlyP1.map((card) => card.id)).toEqual(["a", "b"]);

    const mission = filterBoardCards(cards, { projectIds: ALL, missionId: "m2" });
    expect(mission.map((card) => card.id)).toEqual(["c"]);

    const both = filterBoardCards(cards, { projectIds: ["p1"], missionId: "m1" });
    expect(both.map((card) => card.id)).toEqual(["a"]);
  });

  it("keeps a no-mission bucket instead of hiding the loose cards", () => {
    expect(
      resolveBoardFilter(
        { projectId: ALL_PROJECTS, missionId: NO_MISSION },
        projects,
        missions,
      ),
    ).toEqual({ projectIds: ALL, missionId: NO_MISSION });

    const loose = filterBoardCards(cards, {
      projectIds: ALL,
      missionId: NO_MISSION,
    });
    expect(loose.map((card) => card.id)).toEqual(["b"]);
  });

  it("counts the loose cards of the selection on screen", () => {
    expect(countLooseCards(cards, { projectIds: ["p1"], missionId: null })).toBe(1);
    expect(countLooseCards(cards, { projectIds: ["p2"], missionId: null })).toBe(0);
    expect(countLooseCards(cards, { projectIds: ALL, missionId: "m1" })).toBe(1);
  });
});

describe("several projects at once", () => {
  it("shows the selected projects together", () => {
    const two = filterBoardCards(cards, {
      projectIds: ["p1", "p2"],
      missionId: null,
    });
    expect(two.map((card) => card.id)).toEqual(["a", "b", "c"]);

    const one = filterBoardCards(cards, { projectIds: ["p2"], missionId: null });
    expect(one.map((card) => card.id)).toEqual(["c"]);
  });

  it("stores the selection as one string and reads it back", () => {
    expect(encodeProjectSelection(["p1", "p2"])).toBe("p1,p2");
    expect(encodeProjectSelection(ALL)).toBe(ALL_PROJECTS);

    expect(resolveProjectSelection("p1,p2", projects)).toEqual(["p1", "p2"]);
    expect(resolveProjectSelection(ALL_PROJECTS, projects)).toEqual(ALL);
    // A project that was deleted drops out; what is left still stands.
    expect(resolveProjectSelection("p2,gone", projects)).toEqual(["p2"]);
    // Nothing left to stand on falls back to the single-project default.
    expect(resolveProjectSelection("gone", projects)).toEqual(["p1"]);
    // Every project selected is the All projects shortcut, stored as such.
    expect(resolveProjectSelection("p1,p2,p3", projects)).toEqual(ALL);
  });

  it("checks and unchecks, with All projects at both edges", () => {
    // Out of the shortcut, the first click narrows to what was clicked.
    expect(toggleProject(ALL, "p2", projects)).toEqual(["p2"]);
    expect(toggleProject(["p2"], "p1", projects)).toEqual(["p1", "p2"]);
    // Unchecking the last one is All projects again, never an empty board.
    expect(toggleProject(["p2"], "p2", projects)).toEqual(ALL);
    // So is checking every one of them.
    expect(toggleProject(["p1", "p2"], "p3", projects)).toEqual(ALL);
  });

  it("hands the selection to another page and reads it back", () => {
    expect(boardFilterToQuery({ projectIds: ["p1", "p2"], missionId: "m1" })).toBe(
      "projects=p1%2Cp2&mission=m1",
    );
    expect(boardFilterToQuery({ projectIds: ALL, missionId: null })).toBe(
      "projects=all",
    );

    expect(
      boardFilterFromQuery({ projects: "p1,p2", mission: "m1" }, projects, missions),
    ).toEqual({ projectIds: ["p1", "p2"], missionId: "m1" });
    // No params at all is the whole workspace, not the first project.
    expect(boardFilterFromQuery({}, projects, missions)).toEqual({
      projectIds: ALL,
      missionId: null,
    });
    expect(
      boardFilterFromQuery({ projects: "all", mission: NO_MISSION }, projects, missions),
    ).toEqual({ projectIds: ALL, missionId: NO_MISSION });
  });

  it("offers every project with what picking it would show", () => {
    expect(projectFilterOptions(cards, named, { projectIds: ["p1"], missionId: null })).toEqual([
      { id: "p1", name: "Board", count: 2 },
      { id: "p2", name: "Funnel", count: 1 },
      { id: "p3", name: "Empty", count: 0 },
    ]);
  });

  it("counts what the mission in force would leave on screen", () => {
    expect(projectFilterOptions(cards, named, { projectIds: ALL, missionId: "m1" })).toEqual([
      { id: "p1", name: "Board", count: 1 },
      { id: "p2", name: "Funnel", count: 0 },
      { id: "p3", name: "Empty", count: 0 },
    ]);
    expect(
      projectFilterOptions(cards, named, { projectIds: ALL, missionId: NO_MISSION }),
    ).toEqual([
      { id: "p1", name: "Board", count: 1 },
      { id: "p2", name: "Funnel", count: 0 },
      { id: "p3", name: "Empty", count: 0 },
    ]);
  });
});

describe("the missions the filter offers", () => {
  it("offers only what holds cards here, each with its count", () => {
    expect(
      missionFilterOptions(cards, titled, { projectIds: ["p1"], missionId: null }),
    ).toEqual([{ id: "m1", title: "Onboarding", count: 1 }]);

    expect(
      missionFilterOptions(cards, titled, {
        projectIds: ALL,
        missionId: null,
      }),
    ).toEqual([
      { id: "m1", title: "Onboarding", count: 1 },
      { id: "m2", title: "Cobrança", count: 1 },
    ]);
  });

  it("narrows to the missions inside the selection", () => {
    expect(
      missionFilterOptions(cards, titled, {
        projectIds: ["p1", "p2"],
        missionId: null,
      }),
    ).toEqual([
      { id: "m1", title: "Onboarding", count: 1 },
      { id: "m2", title: "Cobrança", count: 1 },
    ]);

    expect(
      missionFilterOptions(cards, titled, { projectIds: ["p2"], missionId: null }),
    ).toEqual([{ id: "m2", title: "Cobrança", count: 1 }]);
  });

  it("keeps the mission being filtered by, so it can be cleared", () => {
    expect(
      missionFilterOptions(cards, titled, { projectIds: ["p1"], missionId: "m2" }),
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
      missionFilterOptions(many, titled, { projectIds: ["p1"], missionId: null }),
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
