import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { mcpToken, project } from "@agent-board/db";
import { getSession } from "../../lib/cookies";
import { db } from "../../lib/db";
import { selectionFromConfig } from "../../lib/executors";
import { Wizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const ws = await db().query.workspace.findFirst();
  if (!ws) redirect("/setup");

  // An already-configured instance (an agent really connected once) skips the
  // wizard. Deep link ?step=N reopens it for adjustments.
  const sp = await searchParams;
  const usedToken = await db().query.mcpToken.findFirst({
    where: and(eq(mcpToken.workspaceId, ws.id), eq(mcpToken.revoked, false)),
    columns: { lastUsedAt: true },
  });
  if (usedToken?.lastUsedAt && sp.step === undefined) redirect("/home");

  const proj = await db().query.project.findFirst({
    where: eq(project.workspaceId, ws.id),
  });
  const host = (await headers()).get("host") ?? "<your-host>";

  const rawStep = Number(Array.isArray(sp.step) ? sp.step[0] : sp.step);
  const initialStep = rawStep >= 1 && rawStep <= 3 ? Math.floor(rawStep) : 1;

  return (
    <div className="nb nebula-surface nb-center">
      <Wizard
        host={host}
        initialStep={initialStep}
        project={
          proj
            ? {
                name: proj.name,
                repoUrl: proj.repoUrl ?? "",
                prefix: proj.idPrefix,
                nextNumber: proj.nextNumber,
              }
            : null
        }
        executors={selectionFromConfig(ws.executors)}
      />
    </div>
  );
}
