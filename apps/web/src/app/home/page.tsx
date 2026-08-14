import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { project, task, workspace } from "@agent-board/db";
import { logoutAction } from "../../actions/auth";
import { NebulaAtmosphere } from "../../components/nebula-atmosphere";
import { getSession } from "../../lib/cookies";
import { db } from "../../lib/db";
import { Board, type BoardCard } from "./board";

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

function fmtElapsed(from: Date): string {
  const m = Math.max(1, Math.round((Date.now() - from.getTime()) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "2-digit" });
}

type TaskRow = Awaited<ReturnType<typeof loadTasks>>[number];

async function loadTasks(projectId: string) {
  return db().query.task.findMany({
    where: eq(task.projectId, projectId),
    orderBy: asc(task.createdAt),
    with: {
      mission: { columns: { title: true } },
      createdBy: { columns: { email: true } },
      reviewer: { columns: { email: true } },
      attempts: true,
      handoffs: true,
    },
  });
}

function toBoardCard(t: TaskRow): BoardCard {
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

  let telemetry: string | null = null;
  if (latestAttempt) {
    const parts: string[] = [];
    if (latestAttempt.durationMs != null) parts.push(fmtDurationMs(latestAttempt.durationMs));
    const tokens =
      (latestAttempt.tokensIn ?? 0) +
      (latestAttempt.tokensOut ?? 0) +
      (latestAttempt.tokensCache ?? 0);
    if (tokens > 0) parts.push(fmtTokens(tokens));
    if (latestAttempt.costUsd != null) parts.push(`~US$ ${Number(latestAttempt.costUsd).toFixed(2)}`);
    telemetry = parts.join(" · ") || null;
  } else if (latestHandoff?.usage) {
    const u = latestHandoff.usage;
    const parts: string[] = [];
    if (u.durationMs != null) parts.push(fmtDurationMs(u.durationMs));
    const tokens = (u.tokensIn ?? 0) + (u.tokensOut ?? 0) + (u.tokensCache ?? 0);
    if (tokens > 0) parts.push(fmtTokens(tokens));
    if (u.costUsd != null) parts.push(`~US$ ${u.costUsd.toFixed(2)}`);
    telemetry = parts.join(" · ") || null;
  }
  if (telemetry && t.telemetryIncomplete) telemetry += " · telemetry incomplete";

  return {
    id: t.id,
    shortId: t.shortId,
    title: t.title,
    tipo: t.tipo,
    status: t.status,
    isExample: t.isExample,
    oQue: t.oQue,
    porQue: t.porQue,
    comoConfirmo: t.comoConfirmo,
    mission: t.mission?.title ?? null,
    harness,
    devolve,
    origem: `${origem} · ${fmtDate(t.createdAt)}`,
    executor: t.claimedByExecutor ?? latestAttempt?.executor ?? null,
    elapsed: t.claimedAt ? fmtElapsed(t.claimedAt) : null,
    branch: t.branch ?? latestHandoff?.branch ?? null,
    telemetry,
    handoff: latestHandoff?.summary ?? null,
  };
}

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ws = await db().query.workspace.findFirst();
  if (!ws) redirect("/setup");
  const proj = await db().query.project.findFirst({
    where: eq(project.workspaceId, ws.id),
  });
  if (!proj) redirect("/setup");

  const rows = await loadTasks(proj.id);
  const cards = rows.map(toBoardCard);
  const running = cards.filter((c) => c.status === "em_execucao").length;
  const review = cards.filter((c) => c.status === "feito").length;

  return (
    <div className="nb nebula-surface">
      <NebulaAtmosphere />

      <div className="topbar nebula-glass">
        <div className="logo">
          over<span>click</span>
        </div>
        <div className="crumb">
          {ws.name} / <b>{proj.name}</b>
        </div>
        <div className="spacer" />
        <span className="btn-ghost pill">
          My review <span className="badge">{review}</span>
        </span>
        <div className="agent-status">
          <span className={`dot${running === 0 ? " idle" : ""}`} />
          {running > 0 ? `${running} in progress` : "no agent running"}
        </div>
        <a className="btn-ghost" href="/insights">
          Insights
        </a>
        <a className="btn-ghost" href="/settings">
          Settings
        </a>
        <form action={logoutAction}>
          <button className="btn-ghost" type="submit">
            Log out
          </button>
        </form>
      </div>

      <Board cards={cards} />

      <div className="nebula-glass-fade viewport-fade" aria-hidden="true" />
    </div>
  );
}
