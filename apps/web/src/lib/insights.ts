import { and, eq, isNotNull } from "drizzle-orm";
import {
  executionAttempt,
  findModelPrice,
  mergeCostSources,
  mission,
  project,
  resolveAttemptCost,
  task,
  taskComment,
  type CostSource,
  type Database,
  type ModelPrice,
} from "@agent-board/db";

/** Postgres or PGlite drizzle client — the query surface insights needs. */
export type InsightsDb = Pick<Database, "select">;

export type InsightAttemptRow = {
  attemptId: string;
  taskId: string;
  taskShortId: string;
  taskTitle: string;
  taskIsExample: boolean;
  projectId: string;
  projectName: string;
  missionId: string | null;
  missionTitle: string | null;
  model: string | null;
  result: string | null;
  finishedAt: Date | null;
  tokensIn: number | null;
  tokensOut: number | null;
  tokensCache: number | null;
  costUsd: string | null;
  durationMs: number | null;
  serverDurationMs: number | null;
  turns: number | null;
  usageEstimated: boolean;
};

export type ReopenRow = {
  taskId: string;
  createdAt: Date;
};

/** Every execution attempt in the workspace, joined to its card, project and mission. */
export async function loadInsightAttemptRows(
  db: InsightsDb,
  workspaceId: string,
): Promise<InsightAttemptRow[]> {
  return db
    .select({
      attemptId: executionAttempt.id,
      taskId: task.id,
      taskShortId: task.shortId,
      taskTitle: task.title,
      taskIsExample: task.isExample,
      projectId: project.id,
      projectName: project.name,
      missionId: task.missionId,
      missionTitle: mission.title,
      model: executionAttempt.model,
      result: executionAttempt.result,
      finishedAt: executionAttempt.finishedAt,
      tokensIn: executionAttempt.tokensIn,
      tokensOut: executionAttempt.tokensOut,
      tokensCache: executionAttempt.tokensCache,
      costUsd: executionAttempt.costUsd,
      durationMs: executionAttempt.durationMs,
      serverDurationMs: executionAttempt.serverDurationMs,
      turns: executionAttempt.turns,
      usageEstimated: executionAttempt.usageEstimated,
    })
    .from(executionAttempt)
    .innerJoin(task, eq(executionAttempt.taskId, task.id))
    .innerJoin(project, eq(task.projectId, project.id))
    .leftJoin(mission, eq(task.missionId, mission.id))
    .where(eq(project.workspaceId, workspaceId));
}

/**
 * Human-authored task comments in the workspace. Today the board writes a
 * human comment in exactly one place, the reopen action, so a comment with an
 * author user is the reopen signal insights needs.
 */
export async function loadReopenRows(
  db: InsightsDb,
  workspaceId: string,
): Promise<ReopenRow[]> {
  return db
    .select({
      taskId: taskComment.taskId,
      createdAt: taskComment.createdAt,
    })
    .from(taskComment)
    .innerJoin(task, eq(taskComment.taskId, task.id))
    .innerJoin(project, eq(task.projectId, project.id))
    .where(
      and(
        eq(project.workspaceId, workspaceId),
        isNotNull(taskComment.authorUserId),
      ),
    );
}

/**
 * Narrows attempt rows to a period by when the attempt finished. Only the
 * attempts are narrowed: a reopen that lands after the window still means that
 * delivery was reopened, so the reopen rows stay whole.
 */
export function filterAttemptsByPeriod(
  rows: InsightAttemptRow[],
  period: { since?: Date; until?: Date },
): InsightAttemptRow[] {
  if (!period.since && !period.until) return rows;
  return rows.filter((row) => {
    if (!row.finishedAt) return false;
    const at = row.finishedAt.getTime();
    if (period.since && at < period.since.getTime()) return false;
    if (period.until && at > period.until.getTime()) return false;
    return true;
  });
}

/** "2 estimated · 1 usage not reported", or the all-clear. Never a silent sum. */
export function usageHonestyNote(totals: UsageTotals): string {
  const parts: string[] = [];
  if (totals.estimated > 0) parts.push(`${totals.estimated} estimated`);
  if (totals.missing > 0) parts.push(`${totals.missing} usage not reported`);
  return parts.length > 0 ? parts.join(" · ") : "all usage reported";
}

/**
 * "3 computed · 1 agent reported · 2 unpriced model": where the dollars in a
 * sum came from. A total that mixes arithmetic with an agent's own guess says
 * so instead of presenting one number as if it were all the same kind.
 */
export function costSourceNote(totals: UsageTotals): string {
  const parts: string[] = [];
  if (totals.costComputed > 0) parts.push(`${totals.costComputed} computed`);
  if (totals.costReported > 0) parts.push(`${totals.costReported} agent reported`);
  if (totals.costEstimated > 0) parts.push(`${totals.costEstimated} estimated`);
  if (totals.costUnpriced > 0) parts.push(`${totals.costUnpriced} unpriced model`);
  return parts.length > 0 ? parts.join(" · ") : "no cost to attribute";
}

export type UsageTotals = {
  /** Sum of the costs the board could establish. Unknown costs add zero. */
  costUsd: number;
  /** Attempts whose cost the board computed from the price table. */
  costComputed: number;
  /** Attempts that contributed the cost figure the agent sent. */
  costReported: number;
  /** Same, where the agent flagged its own numbers as an estimate. */
  costEstimated: number;
  /** Attempts with tokens the board could not price: no row for the model. */
  costUnpriced: number;
  /** tokens_in + tokens_out + tokens_cache across attempts that reported them. */
  tokens: number;
  /** Reported duration, falling back to the server-measured claim → deliver time. */
  durationMs: number;
  /** Finished attempts aggregated here. */
  attempts: number;
  /** How many of those attempts carry usage the executor flagged as estimated. */
  estimated: number;
  /** How many finished with no usage numbers at all. */
  missing: number;
};

export type GroupInsight = UsageTotals & {
  key: string;
  /** null when the dimension is absent (card without mission, model not reported). */
  label: string | null;
};

export type ModelReopenInsight = {
  /** null when the attempt never reported a model. */
  model: string | null;
  deliveries: number;
  reopened: number;
  /** reopened / deliveries, 0..1. */
  rate: number;
};

export type CardInsight = {
  taskId: string;
  shortId: string;
  title: string;
  projectName: string;
  missionTitle: string | null;
  models: string[];
  /** null when no attempt on the card has a cost. Distinct from a real $0. */
  costUsd: number | null;
  /** Where that figure came from, "mixed" when the attempts disagree. */
  costSource: CostSource | "mixed" | null;
  tokens: number;
  durationMs: number;
  attempts: number;
  estimated: boolean;
  missing: boolean;
};

export type Insights = {
  totals: UsageTotals;
  byProject: GroupInsight[];
  byMission: GroupInsight[];
  byModel: GroupInsight[];
  reopensByModel: ModelReopenInsight[];
  perCard: CardInsight[];
};

const NO_MISSION = "__none__";
const NO_MODEL = "__unknown__";

function emptyTotals(): UsageTotals {
  return {
    costUsd: 0,
    costComputed: 0,
    costReported: 0,
    costEstimated: 0,
    costUnpriced: 0,
    tokens: 0,
    durationMs: 0,
    attempts: 0,
    estimated: 0,
    missing: 0,
  };
}

function attemptTokens(a: InsightAttemptRow): number {
  return (a.tokensIn ?? 0) + (a.tokensOut ?? 0) + (a.tokensCache ?? 0);
}

/** Same ladder the board uses: any number counts as reported usage. */
function hasReportedUsage(a: InsightAttemptRow): boolean {
  return (
    attemptTokens(a) > 0 ||
    a.costUsd != null ||
    a.durationMs != null ||
    a.turns != null
  );
}

function attemptDurationMs(a: InsightAttemptRow): number {
  return a.durationMs ?? a.serverDurationMs ?? 0;
}

/**
 * The cost of one attempt, computed from the price table when the attempt
 * carries tokens and the model has a price, and only otherwise the number the
 * agent volunteered.
 */
function attemptCost(a: InsightAttemptRow, prices: readonly ModelPrice[]) {
  return resolveAttemptCost(
    {
      tokensIn: a.tokensIn,
      tokensOut: a.tokensOut,
      tokensCache: a.tokensCache,
      costUsd: a.costUsd != null ? Number(a.costUsd) : null,
      usageEstimated: a.usageEstimated,
    },
    prices,
    a.model,
  );
}

function addAttempt(
  totals: UsageTotals,
  a: InsightAttemptRow,
  cost: { costUsd: number | null; source: CostSource | null },
  priced: boolean,
): void {
  totals.attempts += 1;
  totals.tokens += attemptTokens(a);
  totals.durationMs += attemptDurationMs(a);
  if (cost.costUsd != null) totals.costUsd += cost.costUsd;
  if (cost.source === "computed") totals.costComputed += 1;
  if (cost.source === "reported") totals.costReported += 1;
  if (cost.source === "estimated") totals.costEstimated += 1;
  if (attemptTokens(a) > 0 && !priced) totals.costUnpriced += 1;
  if (!hasReportedUsage(a)) totals.missing += 1;
  else if (a.usageEstimated) totals.estimated += 1;
}

function sortGroups(groups: GroupInsight[]): GroupInsight[] {
  return groups.sort(
    (a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens || b.attempts - a.attempts,
  );
}

/**
 * Pure aggregation over attempt rows. Only finished attempts count: a running
 * attempt has nothing honest to sum yet. Example cards stay out so demo data
 * never inflates real cost. Costs come from the price table whenever the
 * attempt reported tokens; the agent's own figure is the fallback, not the
 * default.
 */
export function computeInsights(
  rows: InsightAttemptRow[],
  reopens: ReopenRow[],
  prices: readonly ModelPrice[] = [],
): Insights {
  const finished = rows.filter((r) => !r.taskIsExample && r.finishedAt != null);

  const totals = emptyTotals();
  const byProject = new Map<string, GroupInsight>();
  const byMission = new Map<string, GroupInsight>();
  const byModel = new Map<string, GroupInsight>();
  const byCard = new Map<
    string,
    CardInsight & { hasCost: boolean; sources: (CostSource | null)[] }
  >();

  const group = (
    map: Map<string, GroupInsight>,
    key: string,
    label: string | null,
  ): GroupInsight => {
    let entry = map.get(key);
    if (!entry) {
      entry = { key, label, ...emptyTotals() };
      map.set(key, entry);
    }
    return entry;
  };

  for (const a of finished) {
    const cost = attemptCost(a, prices);
    const priced = findModelPrice(prices, a.model) != null;
    addAttempt(totals, a, cost, priced);
    addAttempt(group(byProject, a.projectId, a.projectName), a, cost, priced);
    addAttempt(
      group(byMission, a.missionId ?? NO_MISSION, a.missionTitle),
      a,
      cost,
      priced,
    );
    addAttempt(group(byModel, a.model ?? NO_MODEL, a.model), a, cost, priced);

    let card = byCard.get(a.taskId);
    if (!card) {
      card = {
        taskId: a.taskId,
        shortId: a.taskShortId,
        title: a.taskTitle,
        projectName: a.projectName,
        missionTitle: a.missionTitle,
        models: [],
        costUsd: null,
        costSource: null,
        tokens: 0,
        durationMs: 0,
        attempts: 0,
        estimated: false,
        missing: false,
        hasCost: false,
        sources: [],
      };
      byCard.set(a.taskId, card);
    }
    card.attempts += 1;
    card.tokens += attemptTokens(a);
    card.durationMs += attemptDurationMs(a);
    if (a.model && !card.models.includes(a.model)) card.models.push(a.model);
    if (cost.costUsd != null) {
      card.hasCost = true;
      card.costUsd = (card.costUsd ?? 0) + cost.costUsd;
      card.sources.push(cost.source);
    }
    if (!hasReportedUsage(a)) card.missing = true;
    else if (a.usageEstimated) card.estimated = true;
  }

  // Reopened rate: a delivery counts as reopened when a human comment landed
  // on its card after that delivery finished.
  const reopensByTask = new Map<string, Date[]>();
  for (const r of reopens) {
    const list = reopensByTask.get(r.taskId) ?? [];
    list.push(r.createdAt);
    reopensByTask.set(r.taskId, list);
  }
  const reopenAgg = new Map<string, ModelReopenInsight>();
  for (const a of finished) {
    if (a.result !== "success" || !a.finishedAt) continue;
    const key = a.model ?? NO_MODEL;
    let entry = reopenAgg.get(key);
    if (!entry) {
      entry = { model: a.model, deliveries: 0, reopened: 0, rate: 0 };
      reopenAgg.set(key, entry);
    }
    entry.deliveries += 1;
    const finishedAt = a.finishedAt;
    const wasReopened = (reopensByTask.get(a.taskId) ?? []).some(
      (at) => at.getTime() > finishedAt.getTime(),
    );
    if (wasReopened) entry.reopened += 1;
  }
  const reopensByModel = [...reopenAgg.values()]
    .map((e) => ({ ...e, rate: e.deliveries > 0 ? e.reopened / e.deliveries : 0 }))
    .sort((a, b) => b.rate - a.rate || b.deliveries - a.deliveries);

  const perCard = [...byCard.values()]
    .map(({ hasCost, sources, ...card }) => ({
      ...card,
      costUsd: hasCost ? card.costUsd : null,
      costSource: mergeCostSources(sources),
    }))
    .sort((a, b) => (b.costUsd ?? -1) - (a.costUsd ?? -1) || b.tokens - a.tokens);

  return {
    totals,
    byProject: sortGroups([...byProject.values()]),
    byMission: sortGroups([...byMission.values()]),
    byModel: sortGroups([...byModel.values()]),
    reopensByModel,
    perCard,
  };
}
