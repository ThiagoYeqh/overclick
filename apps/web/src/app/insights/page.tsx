import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { project, task } from "@agent-board/db";
import { logoutAction } from "../../actions/auth";
import { NebulaAtmosphere } from "../../components/nebula-atmosphere";
import { getSession } from "../../lib/cookies";
import { db } from "../../lib/db";
import { aggregateInsights } from "./aggregate";

export const dynamic = "force-dynamic";

function formatDuration(durationMs: number): string {
  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(".0", "")}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

export default async function InsightsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ws = await db().query.workspace.findFirst();
  if (!ws) redirect("/setup");
  const proj = await db().query.project.findFirst({
    where: eq(project.workspaceId, ws.id),
  });
  if (!proj) redirect("/setup");

  const rows = await db().query.task.findMany({
    where: eq(task.projectId, proj.id),
    with: { attempts: true, handoffs: true },
  });
  const insights = aggregateInsights(rows);

  const metrics = [
    { label: "Total cost", value: `US$ ${insights.totalCostUsd.toFixed(2)}`, detail: "Recorded execution and unlinked handoff usage" },
    { label: "Total tokens", value: formatTokens(insights.totalTokens), detail: "Input, output, and cache tokens" },
    { label: "Recorded duration", value: formatDuration(insights.totalDurationMs), detail: "Across reported executions" },
    {
      label: "Incomplete telemetry",
      value: String(insights.incompleteTelemetryCount),
      detail: insights.incompleteTelemetryCount === 1 ? "task needs a telemetry check" : "tasks need a telemetry check",
    },
  ];

  return (
    <div className="nb nebula-surface">
      <NebulaAtmosphere />
      <div className="topbar nebula-glass">
        <a className="logo" href="/home">
          over<span>click</span>
        </a>
        <div className="crumb">
          {ws.name} / <b>{proj.name}</b> / <b>Insights</b>
        </div>
        <div className="spacer" />
        <a className="btn-ghost" href="/home">Board</a>
        <a className="btn-ghost" href="/settings">Settings</a>
        <form action={logoutAction}>
          <button className="btn-ghost" type="submit">Log out</button>
        </form>
      </div>

      <main className="insights-page">
        <p className="insights-eyebrow">Operational overview</p>
        <h1>Cost and operation insights</h1>
        <p className="page-sub">A project-level view of the telemetry your agents have reported.</p>

        <section className="insights-grid" aria-label="Cost and operation metrics">
          {metrics.map((metric) => (
            <article className="insights-metric nebula-glass" key={metric.label}>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.detail}</span>
            </article>
          ))}
        </section>

        <p className="insights-note">
          Linked handoff usage is excluded because it is already recorded on its execution attempt.
        </p>
      </main>
      <div className="nebula-glass-fade viewport-fade" aria-hidden="true" />
    </div>
  );
}
