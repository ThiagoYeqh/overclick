import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  cardapioEntry,
  factoryCardapioPolicy,
  mcpToken,
  project,
} from "@agent-board/db";
import { getSession } from "../../lib/cookies";
import { db } from "../../lib/db";
import { selectionFromConfig } from "../../lib/executors";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ws = await db().query.workspace.findFirst();
  if (!ws) redirect("/setup");
  const proj = await db().query.project.findFirst({
    where: eq(project.workspaceId, ws.id),
  });

  const entries = await db()
    .select()
    .from(cardapioEntry)
    .where(eq(cardapioEntry.workspaceId, ws.id));

  // A tabela mostra sempre todos os tipos: o que já está gravado sobrescreve
  // a política de fábrica, o resto aparece com o padrão que o agente já usa.
  const stored = new Map(entries.map((e) => [e.activityType, e]));
  const cardapioRows = factoryCardapioPolicy().map((f) => {
    const row = stored.get(f.type);
    return {
      activityType: f.type,
      cli: row ? row.cli : f.cli,
      model: row ? row.model : f.model,
      effort: row ? row.effort : f.effort,
    };
  });

  const tokens = await db()
    .select({
      id: mcpToken.id,
      label: mcpToken.label,
      tokenPrefix: mcpToken.tokenPrefix,
      revoked: mcpToken.revoked,
      lastUsedAt: mcpToken.lastUsedAt,
      createdAt: mcpToken.createdAt,
    })
    .from(mcpToken)
    .where(eq(mcpToken.workspaceId, ws.id))
    .orderBy(desc(mcpToken.createdAt));

  const host = (await headers()).get("host") ?? "<seu-host>";

  return (
    <div className="nb nebula-surface">
      <SettingsClient
        host={host}
        workspaceName={ws.name}
        projectName={proj?.name ?? ws.name}
        executors={selectionFromConfig(ws.executors)}
        cardapio={cardapioRows}
        tokens={tokens.map((t) => ({
          id: t.id,
          label: t.label,
          masked: `${t.tokenPrefix ?? "ocb_"}••••••••`,
          revoked: t.revoked,
          createdAt: t.createdAt.toISOString(),
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
