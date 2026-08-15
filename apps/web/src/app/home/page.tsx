import { asc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { mission, project, task, user } from "@agent-board/db";
import { NebulaAtmosphere } from "../../components/nebula-atmosphere";
import { UpdateBanner } from "../../components/update-banner";
import { resolveBoardFilter } from "../../lib/board-filter";
import { getSession } from "../../lib/cookies";
import { db } from "../../lib/db";
import { dict, type Dict } from "../../lib/i18n";
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
    },
  });
}

function toBoardCard(t: TaskRow, tr: Dict): BoardCard {
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
    if (hasUsage) {
      const duration = latestAttempt.durationMs ?? latestAttempt.serverDurationMs;
      if (duration != null) parts.push(fmtDurationMs(duration));
      if (tokens > 0) parts.push(fmtTokens(tokens));
      if (latestAttempt.costUsd != null) parts.push(`~US$ ${Number(latestAttempt.costUsd).toFixed(2)}`);
      telemetry = parts.join(" · ") || null;
      estimated = latestAttempt.usageEstimated;
    } else if (latestAttempt.serverDurationMs != null) {
      telemetry = `${fmtDurationMs(latestAttempt.serverDurationMs)} · ${tr.board.usageNotReported}`;
    }
  } else if (latestHandoff?.usage) {
    const u = latestHandoff.usage;
    const parts: string[] = [];
    if (u.duration_ms != null) parts.push(fmtDurationMs(u.duration_ms));
    const tokens = (u.tokens_in ?? 0) + (u.tokens_out ?? 0) + (u.tokens_cache ?? 0);
    if (tokens > 0) parts.push(fmtTokens(tokens));
    if (u.cost_usd != null) parts.push(`~US$ ${u.cost_usd.toFixed(2)}`);
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
    telemetry,
    handoff: latestHandoff?.summary ?? null,
    howToVerify: latestHandoff?.howToVerify ?? null,
    projectId: t.projectId,
    missionId: t.missionId,
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
  const cards = rows.map((row) => toBoardCard(row, t));
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
