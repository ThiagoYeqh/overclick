export const ALL_PROJECTS = "all";
/**
 * The cards nobody put in a mission. A bucket, not a mission: without it a
 * loose card is only ever visible under "all missions", which is the same as
 * being invisible on a board with 44 cards.
 */
export const NO_MISSION = "none";

export type BoardFilter = {
  projectId: string;
  missionId: string | null;
};

export function defaultProjectId(projects: { id: string }[]): string | null {
  return projects[0]?.id ?? null;
}

export function resolveBoardFilter(
  stored: { projectId: string | null; missionId: string | null },
  projects: { id: string }[],
  missions: { id: string }[] = [],
): BoardFilter {
  const projectIds = new Set(projects.map((item) => item.id));
  let projectId: string;
  if (stored.projectId === ALL_PROJECTS) {
    projectId = ALL_PROJECTS;
  } else if (stored.projectId && projectIds.has(stored.projectId)) {
    projectId = stored.projectId;
  } else {
    projectId = defaultProjectId(projects) ?? ALL_PROJECTS;
  }

  const missionIds = new Set(missions.map((item) => item.id));
  const missionId =
    stored.missionId === NO_MISSION
      ? NO_MISSION
      : stored.missionId && missionIds.has(stored.missionId)
        ? stored.missionId
        : null;

  return { projectId, missionId };
}

export function filterBoardCards<
  T extends { projectId: string; missionId: string | null },
>(cards: T[], filter: BoardFilter): T[] {
  return cards.filter((card) => {
    if (filter.projectId !== ALL_PROJECTS && card.projectId !== filter.projectId) {
      return false;
    }
    if (filter.missionId === NO_MISSION) return card.missionId === null;
    if (filter.missionId && card.missionId !== filter.missionId) {
      return false;
    }
    return true;
  });
}

/** How many cards of the current project have no mission at all. */
export function countLooseCards<
  T extends { projectId: string; missionId: string | null },
>(cards: T[], filter: BoardFilter): number {
  return cards.filter(
    (card) =>
      card.missionId === null &&
      (filter.projectId === ALL_PROJECTS || card.projectId === filter.projectId),
  ).length;
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
    if (filter.projectId !== ALL_PROJECTS && card.projectId !== filter.projectId) {
      continue;
    }
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
