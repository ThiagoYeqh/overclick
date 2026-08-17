export const ALL_PROJECTS = "all";

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
    stored.missionId && missionIds.has(stored.missionId) ? stored.missionId : null;

  return { projectId, missionId };
}

export function filterBoardCards<
  T extends { projectId: string; missionId: string | null },
>(cards: T[], filter: BoardFilter): T[] {
  return cards.filter((card) => {
    if (filter.projectId !== ALL_PROJECTS && card.projectId !== filter.projectId) {
      return false;
    }
    if (filter.missionId && card.missionId !== filter.missionId) {
      return false;
    }
    return true;
  });
}
