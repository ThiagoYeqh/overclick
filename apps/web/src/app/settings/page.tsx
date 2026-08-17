import { asc, desc, eq, isNotNull, and } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  cardapioEntry,
  executionAttempt,
  factoryCardapioPolicy,
  findModelPrice,
  mcpToken,
  project,
  task,
} from "@agent-board/db";
import { getSession } from "../../lib/cookies";
import { db } from "../../lib/db";
import { isPairInConfig, selectionFromConfig } from "../../lib/executors";
import { loadModelPrices } from "../../lib/prices";
import { loadUsageRecipes } from "../../lib/recipes";
import { detectRuntime } from "../../lib/runtime";
import {
  SOURCE_UPDATE_COMMAND,
  UPDATE_COMMAND,
  UPDATER_ENABLE_COMMAND,
} from "../../lib/update-commands";
import { APP_VERSION, readUpdaterState } from "../../lib/updates";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ws = await db().query.workspace.findFirst();
  if (!ws) redirect("/setup");
  const projects = await db().query.project.findMany({
    where: eq(project.workspaceId, ws.id),
    orderBy: asc(project.createdAt),
  });

  const entries = await db()
    .select()
    .from(cardapioEntry)
    .where(eq(cardapioEntry.workspaceId, ws.id));

  // The table always shows every type: what is already stored overrides the
  // factory policy, the rest shows the default the agent already uses.
  const stored = new Map(entries.map((e) => [e.activityType, e]));
  const cardapioRows = factoryCardapioPolicy().map((f) => {
    const row = stored.get(f.type);
    return {
      activityType: f.type,
      cli: row ? row.cli : f.cli,
      model: row ? row.model : f.model,
      effort: row ? row.effort : f.effort,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row ? row.updatedAt.toISOString() : null,
    };
  });

  const tokens = await db()
    .select({
      id: mcpToken.id,
      label: mcpToken.label,
      tokenPrefix: mcpToken.tokenPrefix,
      canManage: mcpToken.canManage,
      revoked: mcpToken.revoked,
      lastUsedAt: mcpToken.lastUsedAt,
      createdAt: mcpToken.createdAt,
    })
    .from(mcpToken)
    .where(eq(mcpToken.workspaceId, ws.id))
    .orderBy(desc(mcpToken.createdAt));

  const prices = await loadModelPrices(db(), ws.id);
  const recipes = await loadUsageRecipes(db(), ws.id);

  // Models this board has actually run, or is configured to run, that the
  // price table cannot price yet. Offered in Settings so nobody has to guess
  // which name to type.
  const ranModels = await db()
    .selectDistinct({ model: executionAttempt.model })
    .from(executionAttempt)
    .innerJoin(task, eq(executionAttempt.taskId, task.id))
    .innerJoin(project, eq(task.projectId, project.id))
    .where(
      and(eq(project.workspaceId, ws.id), isNotNull(executionAttempt.model)),
    );
  const candidates = [
    ...ranModels.map((row) => row.model),
    ...ws.executors.flatMap((row) => row.models),
    ...ws.seenExecutors.map((row) => row.model),
  ].filter((model): model is string => Boolean(model?.trim()));
  const unpricedModels = [
    ...new Set(
      candidates
        .map((model) => model.trim())
        .filter((model) => findModelPrice(prices, model) == null),
    ),
  ].sort();

  const host = (await headers()).get("host") ?? "<your-host>";

  // Read on the server, from the volume the sidecar shares: a mounted trigger
  // directory says nothing, only a fresh heartbeat means somebody can pull.
  const updater = await readUpdaterState();

  // Which update advice can possibly apply here: a container can be recreated,
  // a checkout can only be pulled and restarted.
  const runtime = detectRuntime();

  // Pairs observed on real connections that the config still does not cover.
  const seenSuggestions = ws.seenExecutors
    .filter((s) => !isPairInConfig(ws.executors, s.cli, s.model))
    .map((s) => ({
      cli: s.cli,
      model: s.model,
      count: s.count,
      lastSeenAt: s.lastSeenAt,
    }));

  return (
    <div className="nb nebula-surface">
      <SettingsClient
        host={host}
        workspaceName={ws.name}
        projectName={projects[0]?.name ?? ws.name}
        projects={projects.map((item) => ({
          id: item.id,
          name: item.name,
          repoUrl: item.repoUrl ?? "",
          prefix: item.idPrefix,
          nextNumber: item.nextNumber,
        }))}
        executors={selectionFromConfig(ws.executors)}
        lang={ws.language}
        updateMode={ws.updateMode}
        updateLog={ws.updateLog}
        version={APP_VERSION}
        runtime={runtime}
        updater={updater}
        enableCommand={UPDATER_ENABLE_COMMAND}
        manualCommand={UPDATE_COMMAND}
        sourceCommand={SOURCE_UPDATE_COMMAND}
        seenSuggestions={seenSuggestions}
        cardapio={cardapioRows}
        prices={prices}
        unpricedModels={unpricedModels}
        recipes={recipes}
        pricingEnabled={ws.pricingEnabled}
        tokens={tokens.map((t) => ({
          id: t.id,
          label: t.label,
          masked: `${t.tokenPrefix ?? "ocb_"}••••••••`,
          canManage: t.canManage,
          revoked: t.revoked,
          createdAt: t.createdAt.toISOString(),
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
