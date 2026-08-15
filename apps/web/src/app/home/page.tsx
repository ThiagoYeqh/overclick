import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { project, task, workspace } from "@agent-board/db";
import { logoutAction } from "../../actions/auth";
import { NebulaAtmosphere } from "../../components/nebula-atmosphere";
import { getSession } from "../../lib/cookies";
import { db } from "../../lib/db";
import { Board } from "./board";
import { toBoardCard } from "./board-card";

export const dynamic = "force-dynamic";

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
      comments: {
        with: {
          author: { columns: { email: true } },
        },
      },
    },
  });
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
