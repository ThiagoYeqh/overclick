import { asc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import {
  mission,
  modelChain,
  normalizeUsageSegments,
  project,
  resolveSegmentedCost,
  segmentModels,
  task,
  user,
  type CostSource,
  type ModelPrice,
} from "@agent-board/db";
import { NebulaAtmosphere } from "../../components/nebula-atmosphere";
import { UpdateBanner } from "../../components/update-banner";
import { resolveBoardFilter } from "../../lib/board-filter";
import { buildCardHistory } from "../../lib/card-history";
import { getSession } from "../../lib/cookies";
import { db } from "../../lib/db";
import { dict, type Dict } from "../../lib/i18n";
import { loadModelPrices } from "../../lib/prices";
import { checkForUpdate, updateHelperDir } from "../../lib/updates";
import { parseComoConfirmo } from "../../mcp/map";
import type { BoardCard } from "./board";
import { HomeShell } from "./home-shell";

export const dynamic = "force-dynamic";

function fmtDurationMs(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    const v = (n / 1_000_000).toFixed(1).replace(".0", "");
    return `${v}M tok`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}k tok`;
  return `${n} tok`;
}

function fmtElapsed(from: Date, t: Dict): string {
  const m = Math.max(1, Math.round((Date.now() - from.getTime()) / 60000));
  if (m < 60) return t.board.minAgo(m);
  const h = Math.round(m / 60);
  if (h < 24) return t.board.hAgo(h);
  return t.board.dAgo(Math.round(h / 24));
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "2-digit" });
}

type TaskRow = Awaited<ReturnType<typeof loadTasks>>[number];

async function loadTasks(projectIds: string[]) {
  if (projectIds.length === 0) return [];
  return db().query.task.findMany({
    where: inArray(task.projectId, projectIds),
    orderBy: asc(task.createdAt),
    with: {
      mission: { columns: { id: true, title: true } },
      createdBy: { columns: { email: true } },
      reviewer: { columns: { email: true } },
      attempts: true,
      handoffs: true,
      comments: {
        with: {
          author: { columns: { email: true } },
        },
      },
    },
  });
}

/** "~US$ 0.42 computed": a dollar figure never travels without its source. */
function fmtCost(value: number, source: CostSource | null, tr: Dict): string {
  const label =
    source === "computed"
      ? tr.board.costComputed
      : source === "estimated"
        ? tr.board.costEstimated
        : tr.board.costReported;
  return `~US$ ${value.toFixed(2)} ${label}`;
}

function toBoardCard(
  t: TaskRow,
  tr: Dict,
  prices: readonly ModelPrice[],
  /** Money is opt-in: with it off the footer is tokens and time only. */
  pricingEnabled: boolean,
): BoardCard {
  const h = t.harness;
  const harness =
    [h?.model ?? h?.modelTier, h?.effort].filter(Boolean).join(" · ") || null;

  const devolve =
    t.devolveParaKind === "human"
      ? (t.reviewer?.email ?? "human")
      : t.devolveParaKind === "agent"
        ? (t.devolveParaAgentRef ?? "agent")
        : "workspace queue";

  const origem = t.createdBy?.email ?? t.origin?.agent ?? t.origin?.cli ?? "board";

  const latestAttempt = [...t.attempts].sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
  )[0];
  const latestHandoff = [...t.handoffs].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];

  // Typed execution trace: executor swaps recorded at claim time and spawn
  // failures posted by orchestrators, oldest first.
  const timeline = [...t.comments]
    .filter((c) => c.kind === "executor_swap" || c.kind === "spawn_failure")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((c) => ({
      kind: c.kind as "executor_swap" | "spawn_failure",
      body: c.body,
      author: c.authorAgentRef,
      at: fmtDate(c.createdAt),
    }));

  // Footer ladder: full usage > estimated usage (labeled) > server-measured
  // duration with "usage not reported". A delivered card never shows nothing.
  let telemetry: string | null = null;
  let estimated = false;
  if (latestAttempt) {
    const parts: string[] = [];
    const tokens =
      (latestAttempt.tokensIn ?? 0) +
      (latestAttempt.tokensOut ?? 0) +
      (latestAttempt.tokensCache ?? 0);
    const hasUsage =
      tokens > 0 ||
      latestAttempt.costUsd != null ||
      latestAttempt.durationMs != null ||
      latestAttempt.turns != null;
    // What each model actually spent. Stored before segments existed, or with
    // no tokens at all, the attempt still reads as one segment for its model.
    const segments = latestAttempt.usageSegments?.length
      ? latestAttempt.usageSegments
      : (() => {
          const folded = normalizeUsageSegments(
            {
              tokens_in: latestAttempt.tokensIn ?? undefined,
              tokens_out: latestAttempt.tokensOut ?? undefined,
              tokens_cache: latestAttempt.tokensCache ?? undefined,
            },
            latestAttempt.model,
          );
          return folded.length > 0 ? folded : [{ model: latestAttempt.model }];
        })();
    // One model, or the chain a run that switched models actually walked.
    const chain = modelChain(segmentModels(segments));
    if (hasUsage) {
      const duration = latestAttempt.durationMs ?? latestAttempt.serverDurationMs;
      if (duration != null) parts.push(fmtDurationMs(duration));
      if (tokens > 0) parts.push(fmtTokens(tokens));
      if (chain) parts.push(chain);
      // Money only when the workspace asked for it. When it did, the board
      // owns the arithmetic: tokens plus the price table beat the number the
      // agent volunteered, and every model is priced at its own rate.
      if (pricingEnabled) {
        const cost = resolveSegmentedCost(segments, prices, {
          costUsd: latestAttempt.costUsd != null ? Number(latestAttempt.costUsd) : null,
          usageEstimated: latestAttempt.usageEstimated,
        });
        if (cost.costUsd != null) parts.push(fmtCost(cost.costUsd, cost.source, tr));
      }
      telemetry = parts.join(" · ") || null;
      estimated = latestAttempt.usageEstimated;
    } else if (latestAttempt.serverDurationMs != null) {
      telemetry = [
        fmtDurationMs(latestAttempt.serverDurationMs),
        chain,
        tr.board.usageNotReported,
      ]
        .filter(Boolean)
        .join(" · ");
    }
  } else if (latestHandoff?.usage) {
    const u = latestHandoff.usage;
    const parts: string[] = [];
    if (u.duration_ms != null) parts.push(fmtDurationMs(u.duration_ms));
    const tokens = (u.tokens_in ?? 0) + (u.tokens_out ?? 0) + (u.tokens_cache ?? 0);
    if (tokens > 0) parts.push(fmtTokens(tokens));
    const chain = modelChain(segmentModels(normalizeUsageSegments(u, null)));
    if (chain) parts.push(chain);
    // No attempt to price: this is the agent's own number, labeled as such.
    if (pricingEnabled && u.cost_usd != null) {
      parts.push(fmtCost(u.cost_usd, u.estimated ? "estimated" : "reported", tr));
    }
    telemetry = parts.join(" · ") || null;
    estimated = u.estimated ?? false;
  }
  if (telemetry && estimated) {
    telemetry += ` · ${tr.board.estimated}`;
  } else if (telemetry && t.telemetryIncomplete && !telemetry.includes(tr.board.usageNotReported)) {
    telemetry += ` · ${tr.board.telemetryIncomplete}`;
  }

  return {
    id: t.id,
    shortId: t.shortId,
    title: t.title,
    tipo: t.tipo,
    status: t.status,
    isExample: t.isExample,
    oQue: t.oQue,
    porQue: t.porQue,
    comoConfirmo: parseComoConfirmo(t.comoConfirmo),
    validationTicks: t.validationTicks.map((tick) => ({
      index: tick.index,
      byEmail: tick.byEmail,
      at: tick.at,
    })),
    mission: t.mission?.title ?? null,
    harness,
    devolve,
    origem: `${origem} · ${fmtDate(t.createdAt)}`,
    executor: t.claimedByExecutor ?? latestAttempt?.executor ?? null,
    elapsed: t.claimedAt ? fmtElapsed(t.claimedAt, tr) : null,
    branch: t.branch ?? latestHandoff?.branch ?? null,
    timeline,
    telemetry,
    handoff: latestHandoff?.summary ?? null,
    howToVerify: latestHandoff?.howToVerify ?? null,
    projectId: t.projectId,
    missionId: t.missionId,
    history: buildCardHistory({
      task: {
        id: t.id,
        shortId: t.shortId,
        title: t.title,
        status: t.status,
        createdAt: t.createdAt,
        claimedAt: t.claimedAt,
        claimedByExecutor: t.claimedByExecutor,
        createdByEmail: t.createdBy?.email ?? null,
      },
      comments: t.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        authorEmail: comment.author?.email ?? null,
        authorAgentRef: comment.authorAgentRef,
      })),
      attempts: t.attempts.map((attempt) => ({
        id: attempt.id,
        executor: attempt.executor,
        model: attempt.model,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
        result: attempt.result,
        resultNote: attempt.resultNote,
      })),
      handoffs: t.handoffs.map((handoff) => ({
        id: handoff.id,
        summary: handoff.summary,
        branch: handoff.branch,
        prUrl: handoff.prUrl,
        createdAt: handoff.createdAt,
      })),
    }),
  };
}

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ws = await db().query.workspace.findFirst();
  if (!ws) redirect("/setup");
  const projects = await db().query.project.findMany({
    where: eq(project.workspaceId, ws.id),
    orderBy: asc(project.createdAt),
    columns: { id: true, name: true },
  });
  if (projects.length === 0) redirect("/setup");

  const missions = await db().query.mission.findMany({
    where: eq(mission.workspaceId, ws.id),
    orderBy: asc(mission.createdAt),
    columns: { id: true, title: true },
  });

  const [me] = await db()
    .select({
      boardProjectId: user.boardProjectId,
      boardMissionId: user.boardMissionId,
    })
    .from(user)
    .where(eq(user.id, session.userId))
    .limit(1);

  const t = dict(ws.language);
  // Opt-in only: with the toggle off this instance makes zero outbound calls.
  const release = ws.updateCheckEnabled ? await checkForUpdate() : null;
  const rows = await loadTasks(projects.map((item) => item.id));
  // Same rule as the Insights page: no money layer, no price table to read.
  const prices = ws.pricingEnabled ? await loadModelPrices(db(), ws.id) : [];
  const cards = rows.map((row) => toBoardCard(row, t, prices, ws.pricingEnabled));
  const initialFilter = resolveBoardFilter(
    { projectId: me?.boardProjectId ?? null, missionId: me?.boardMissionId ?? null },
    projects,
    missions,
  );

  return (
    <div className="nb nebula-surface">
      <NebulaAtmosphere />

      {release ? (
        <UpdateBanner
          version={release.version}
          changelog={release.changelog}
          url={release.url}
          helper={Boolean(updateHelperDir())}
          lang={ws.language}
        />
      ) : null}

      <HomeShell
        workspaceName={ws.name}
        lang={ws.language}
        projects={projects}
        missions={missions}
        cards={cards}
        initialFilter={initialFilter}
      />

      <div className="nebula-glass-fade viewport-fade" aria-hidden="true" />
    </div>
  );
}
