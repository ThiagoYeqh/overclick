export const ALL_PROJECTS = "all";
/**
 * The cards nobody put in a mission. A bucket, not a mission: without it a
 * loose card is only ever visible under "all missions", which is the same as
 * being invisible on a board with 44 cards.
 */
export const NO_MISSION = "none";

export type BoardFilter = {
  /**
   * The projects on screen. Empty is the All projects shortcut, which is every
   * project of the workspace: work that spans projects can only be seen
   * together if the filter takes more than one answer.
   */
  projectIds: string[];
  missionId: string | null;
};

export function defaultProjectId(projects: { id: string }[]): string | null {
  return projects[0]?.id ?? null;
}

/**
 * The selection as one string, which is how it persists per user: "all" for
 * the shortcut, otherwise the project ids in workspace order.
 */
export function encodeProjectSelection(projectIds: string[]): string {
  return projectIds.length === 0 ? ALL_PROJECTS : projectIds.join(",");
}

/**
 * The stored selection read back against the projects that still exist. A
 * selection whose projects all disappeared falls back to the first project,
 * the same default a user who never chose anything gets.
 */
export function resolveProjectSelection(
  stored: string | null,
  projects: { id: string }[],
): string[] {
  if (stored === ALL_PROJECTS) return [];
  const known = new Set(projects.map((item) => item.id));
  const picked = (stored ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => known.has(id));
  if (picked.length > 0) {
    return picked.length === projects.length ? [] : picked;
  }
  const first = defaultProjectId(projects);
  return first ? [first] : [];
}

/**
 * Checking and unchecking a project, with the two edges the shortcut creates:
 * the first click out of All narrows to the project clicked, and a selection
 * that ends up empty or covering everything is All again. An empty board
 * because nothing is selected would be a state with no way to read it.
 */
export function toggleProject(
  current: string[],
  projectId: string,
  projects: { id: string }[],
): string[] {
  if (current.length === 0) return [projectId];
  const next = current.includes(projectId)
    ? current.filter((id) => id !== projectId)
    : [...current, projectId];
  if (next.length === 0 || next.length >= projects.length) return [];
  // Workspace order, so the chip and the panel read the same way.
  return projects.filter((item) => next.includes(item.id)).map((item) => item.id);
}

function inScope(filter: BoardFilter, projectId: string): boolean {
  return filter.projectIds.length === 0 || filter.projectIds.includes(projectId);
}

export function resolveBoardFilter(
  stored: { projectId: string | null; missionId: string | null },
  projects: { id: string }[],
  missions: { id: string }[] = [],
): BoardFilter {
  const projectIds = resolveProjectSelection(stored.projectId, projects);

  const missionIds = new Set(missions.map((item) => item.id));
  const missionId =
    stored.missionId === NO_MISSION
      ? NO_MISSION
      : stored.missionId && missionIds.has(stored.missionId)
        ? stored.missionId
        : null;

  return { projectIds, missionId };
}

export function filterBoardCards<
  T extends { projectId: string; missionId: string | null },
>(cards: T[], filter: BoardFilter): T[] {
  return cards.filter((card) => {
    if (!inScope(filter, card.projectId)) return false;
    if (filter.missionId === NO_MISSION) return card.missionId === null;
    if (filter.missionId && card.missionId !== filter.missionId) {
      return false;
    }
    return true;
  });
}

/** How many cards of the current selection have no mission at all. */
export function countLooseCards<
  T extends { projectId: string; missionId: string | null },
>(cards: T[], filter: BoardFilter): number {
  return cards.filter(
    (card) => card.missionId === null && inScope(filter, card.projectId),
  ).length;
}

/** A project the board filter can offer, with how many cards it would show. */
export type ProjectCount = { id: string; name: string; count: number };

/**
 * Every project of the workspace, each with the cards it would put on screen.
 * Unlike missions, a project with nothing in it stays on the list: the filter
 * is also how you get to a project, and an empty one is where the next card
 * goes. The counts answer the mission filter in force, because that is what
 * picking this project would actually show.
 */
export function projectFilterOptions<
  T extends { projectId: string; missionId: string | null },
>(
  cards: T[],
  projects: { id: string; name: string }[],
  filter: BoardFilter,
): ProjectCount[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (filter.missionId === NO_MISSION && card.missionId !== null) continue;
    if (
      filter.missionId &&
      filter.missionId !== NO_MISSION &&
      card.missionId !== filter.missionId
    ) {
      continue;
    }
    counts.set(card.projectId, (counts.get(card.projectId) ?? 0) + 1);
  }
  return projects.map((proj) => ({
    id: proj.id,
    name: proj.name,
    count: counts.get(proj.id) ?? 0,
  }));
}

/** A mission the board filter can offer, with how many cards it holds here. */
export type MissionCount = { id: string; title: string; count: number };

/**
 * The missions worth offering on the board filter. Missions are workspace
 * wide, so a board that lists all of them offers chips that lead to an empty
 * board, and a filter that yields nothing teaches people to distrust the
 * filter. Only what holds cards in the current scope is offered, each with its
 * count. The mission being filtered by survives with a count of zero: hiding
 * the active filter would leave an empty board with nothing to clear.
 *
 * This rule is for filtering only. Choosing a mission for a card still lists
 * every mission of the workspace, because a mission crosses projects and this
 * card may be the first of that mission here.
 */
export function missionFilterOptions<
  T extends { projectId: string; missionId: string | null },
>(
  cards: T[],
  missions: { id: string; title: string }[],
  filter: BoardFilter,
): MissionCount[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (!inScope(filter, card.projectId)) continue;
    if (!card.missionId) continue;
    counts.set(card.missionId, (counts.get(card.missionId) ?? 0) + 1);
  }
  return missions
    .filter((miss) => (counts.get(miss.id) ?? 0) > 0 || miss.id === filter.missionId)
    .map((miss) => ({
      id: miss.id,
      title: miss.title,
      count: counts.get(miss.id) ?? 0,
    }));
}

/**
 * Past this many missions the eye stops scanning and starts hunting, so the
 * filter grows a search box. Below it the box would be one more control to
 * read before reading the three options it filters.
 */
export const MISSION_SEARCH_THRESHOLD = 8;

export function shouldSearchMissions(optionCount: number): boolean {
  return optionCount > MISSION_SEARCH_THRESHOLD;
}

/** Accents and case are how the mission was typed, not what is being looked for. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function searchMissions(
  options: MissionCount[],
  query: string,
): MissionCount[] {
  const needle = normalize(query);
  if (!needle) return options;
  return options.filter((option) => normalize(option.title).includes(needle));
}
