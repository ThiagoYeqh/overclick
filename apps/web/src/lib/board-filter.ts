import type { TaskPriority, TaskType } from "@agent-board/db";

export const ALL_PROJECTS = "all";
/**
 * The cards nobody put in a mission. A bucket, not a mission: without it a
 * loose card is only ever visible under "all missions", which is the same as
 * being invisible on a board with 44 cards.
 */
export const NO_MISSION = "none";
/** Stored/query sentinel for the cards whose release is still unset. */
export const NO_RELEASE = "__no_release__";

export const TASK_TYPES: readonly TaskType[] = ["bug", "feature", "rfc"];
export const TASK_PRIORITIES: readonly TaskPriority[] = [
  "urgente",
  "alta",
  "media",
  "baixa",
];

export type BoardFilter = {
  /**
   * The projects on screen. Empty is the All projects shortcut, which is every
   * project of the workspace: work that spans projects can only be seen
   * together if the filter takes more than one answer.
   */
  projectIds: string[];
  missionId: string | null;
  /** Undefined means every release; null means only cards without a release. */
  resolvedIn?: string | null;
  /** Empty means every task type. */
  types: TaskType[];
  /** Empty means every priority. */
  priorities: TaskPriority[];
};

type StoredBoardFilter = {
  projectId: string | null;
  missionId: string | null;
  types?: string | string[] | null;
  priorities?: string | string[] | null;
  resolvedIn?: string | null;
};

type FilterableCard = {
  projectId: string;
  missionId: string | null;
  tipo: TaskType;
  priority: TaskPriority;
  resolvedIn: string | null;
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

/** Empty is stored as null, the backwards-compatible value for "all". */
export function encodeFacetSelection(values: readonly string[]): string | null {
  return values.length > 0 ? values.join(",") : null;
}

/** Null in storage remains available for "no filter", so no-release needs a sentinel. */
export function encodeReleaseSelection(
  value: string | null | undefined,
): string | null {
  if (value === undefined) return null;
  return value === null ? NO_RELEASE : value;
}

export function resolveReleaseSelection(
  stored: string | null | undefined,
  releases?: { value: string }[],
): string | null | undefined {
  if (stored == null || stored.length === 0) return undefined;
  if (stored === NO_RELEASE) return null;
  if (releases && !releases.some((release) => release.value === stored)) {
    return undefined;
  }
  return stored;
}

function resolveFacetSelection<T extends string>(
  stored: string | string[] | null | undefined,
  known: readonly T[],
): T[] {
  const requested = new Set(
    (Array.isArray(stored) ? stored : (stored ?? "").split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return known.filter((value) => requested.has(value));
}

export function isTaskType(value: string): value is TaskType {
  return (TASK_TYPES as readonly string[]).includes(value);
}

export function isTaskPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
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

/**
 * The filter as a query string, so a link can hand the same selection to
 * another page. Insights reads it back with boardFilterFromQuery, which is
 * what makes the topbar total and the Insights page agree by construction.
 */
export function boardFilterToQuery(filter: BoardFilter): string {
  const params = new URLSearchParams();
  params.set("projects", encodeProjectSelection(filter.projectIds));
  if (filter.missionId) params.set("mission", filter.missionId);
  if (filter.types.length > 0) params.set("types", filter.types.join(","));
  if (filter.priorities.length > 0) {
    params.set("priorities", filter.priorities.join(","));
  }
  if (filter.resolvedIn !== undefined) {
    params.set("release", encodeReleaseSelection(filter.resolvedIn) ?? "");
  }
  return params.toString();
}

/** The other end of boardFilterToQuery. No params at all means everything. */
export function boardFilterFromQuery(
  params: {
    projects?: string | null;
    mission?: string | null;
    types?: string | null;
    priorities?: string | null;
    release?: string | null;
  },
  projects: { id: string }[],
  missions: { id: string }[] = [],
  releases?: { value: string }[],
): BoardFilter {
  return resolveBoardFilter(
    {
      projectId: params.projects ?? ALL_PROJECTS,
      missionId: params.mission ?? null,
      types: params.types,
      priorities: params.priorities,
      resolvedIn: params.release,
    },
    projects,
    missions,
    releases,
  );
}

function inScope(filter: BoardFilter, projectId: string): boolean {
  return filter.projectIds.length === 0 || filter.projectIds.includes(projectId);
}

export function resolveBoardFilter(
  stored: StoredBoardFilter,
  projects: { id: string }[],
  missions: { id: string }[] = [],
  releases?: { value: string }[],
): BoardFilter {
  const projectIds = resolveProjectSelection(stored.projectId, projects);

  const missionIds = new Set(missions.map((item) => item.id));
  const missionId =
    stored.missionId === NO_MISSION
      ? NO_MISSION
      : stored.missionId && missionIds.has(stored.missionId)
        ? stored.missionId
        : null;
  const resolvedIn = resolveReleaseSelection(stored.resolvedIn, releases);

  return {
    projectIds,
    missionId,
    types: resolveFacetSelection(stored.types, TASK_TYPES),
    priorities: resolveFacetSelection(stored.priorities, TASK_PRIORITIES),
    ...(resolvedIn !== undefined ? { resolvedIn } : {}),
  };
}

function matchesFacets(card: FilterableCard, filter: BoardFilter): boolean {
  if (filter.types.length > 0 && !filter.types.includes(card.tipo)) return false;
  if (
    filter.priorities.length > 0 &&
    !filter.priorities.includes(card.priority)
  ) {
    return false;
  }
  return true;
}

function matchesRelease(card: FilterableCard, filter: BoardFilter): boolean {
  return (
    filter.resolvedIn === undefined || card.resolvedIn === filter.resolvedIn
  );
}

function matchesMission(card: FilterableCard, filter: BoardFilter): boolean {
  if (filter.missionId === NO_MISSION) return card.missionId === null;
  return !filter.missionId || card.missionId === filter.missionId;
}

export function filterBoardCards<T extends FilterableCard>(
  cards: T[],
  filter: BoardFilter,
): T[] {
  return cards.filter((card) => {
    if (!inScope(filter, card.projectId)) return false;
    if (!matchesFacets(card, filter)) return false;
    if (!matchesRelease(card, filter)) return false;
    return matchesMission(card, filter);
  });
}

/** How many cards of the current selection have no mission at all. */
export function countLooseCards<T extends FilterableCard>(
  cards: T[],
  filter: BoardFilter,
): number {
  return cards.filter(
    (card) =>
      card.missionId === null &&
      inScope(filter, card.projectId) &&
      matchesFacets(card, filter) &&
      matchesRelease(card, filter),
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
export function projectFilterOptions<T extends FilterableCard>(
  cards: T[],
  projects: { id: string; name: string }[],
  filter: BoardFilter,
): ProjectCount[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (!matchesFacets(card, filter)) continue;
    if (!matchesRelease(card, filter)) continue;
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
export function missionFilterOptions<T extends FilterableCard>(
  cards: T[],
  missions: { id: string; title: string }[],
  filter: BoardFilter,
): MissionCount[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (!inScope(filter, card.projectId)) continue;
    if (!matchesFacets(card, filter)) continue;
    if (!matchesRelease(card, filter)) continue;
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

/** A release the filter can offer, with the count left by every other dimension. */
export type ReleaseCount = { value: string | null; count: number };

export function releaseFilterOptions<T extends FilterableCard>(
  cards: T[],
  releases: { value: string }[],
  filter: BoardFilter,
): ReleaseCount[] {
  const counts = new Map<string | null, number>();
  for (const card of cards) {
    if (!inScope(filter, card.projectId)) continue;
    if (!matchesFacets(card, filter)) continue;
    if (!matchesMission(card, filter)) continue;
    counts.set(card.resolvedIn, (counts.get(card.resolvedIn) ?? 0) + 1);
  }
  return [
    ...releases.map((release) => ({
      value: release.value,
      count: counts.get(release.value) ?? 0,
    })),
    { value: null, count: counts.get(null) ?? 0 },
  ];
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
