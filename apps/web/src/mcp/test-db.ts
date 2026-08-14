import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  mcpToken,
  mission,
  project,
  workspace,
  type Cardapio,
  type ExecutorConfig,
} from "@agent-board/db";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@agent-board/db/schema";
import { generateTokenSecret, hashToken } from "./token";
import type { McpDatabase } from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = resolve(
  here,
  "../../../../packages/db/drizzle/0000_robust_wild_pack.sql",
);

export type TestWorld = {
  db: McpDatabase;
  client: PGlite;
  workspaceId: string;
  projectId: string;
  missionId: string;
  tokenId: string;
  secret: string;
  revokedSecret: string;
  secondSecret: string;
  secondTokenId: string;
};

const TEST_CARDAPIO: Cardapio = {
  bug: {
    model: "sonnet-5",
    modelTier: "mid",
    effort: "medium",
    skills: ["qa-fix-protocol"],
    agent: null,
  },
  feature: {
    model: "sonnet-5",
    modelTier: "mid",
    effort: "medium",
    skills: ["ui-ux-pro-max"],
    agent: null,
  },
  rfc: {
    model: "opus-4-8",
    modelTier: "top",
    effort: "high",
    skills: [],
    agent: null,
  },
};

const TEST_EXECUTORS: ExecutorConfig[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    enabled: true,
    models: ["opus-4-8", "sonnet-5", "haiku-4"],
  },
];

export async function createTestWorld(): Promise<TestWorld> {
  const client = new PGlite();
  const sql = readFileSync(MIGRATION_SQL, "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    const trimmed = statement.trim();
    if (trimmed) await client.exec(trimmed);
  }

  const db = drizzle(client, { schema }) as unknown as McpDatabase;

  const [ws] = await db
    .insert(workspace)
    .values({
      name: "OverClick Test",
      executors: TEST_EXECUTORS,
      cardapio: TEST_CARDAPIO,
    })
    .returning({ id: workspace.id });
  if (!ws) throw new Error("failed to insert workspace");

  const [proj] = await db
    .insert(project)
    .values({
      workspaceId: ws.id,
      name: "OverClick",
      idPrefix: "OC",
      nextNumber: 1,
    })
    .returning({ id: project.id });
  if (!proj) throw new Error("failed to insert project");

  const [miss] = await db
    .insert(mission)
    .values({
      workspaceId: ws.id,
      title: "Norte do board",
      objective: "Fechar o loop MCP do MVP.",
      status: "ativa",
    })
    .returning({ id: mission.id });
  if (!miss) throw new Error("failed to insert mission");

  const secret = generateTokenSecret();
  const secondSecret = generateTokenSecret();
  const revokedSecret = generateTokenSecret();

  const [tok] = await db
    .insert(mcpToken)
    .values({
      workspaceId: ws.id,
      label: "test-agent",
      hash: hashToken(secret),
      tokenPrefix: secret.slice(0, 12),
    })
    .returning({ id: mcpToken.id });
  if (!tok) throw new Error("failed to insert token");

  const [tok2] = await db
    .insert(mcpToken)
    .values({
      workspaceId: ws.id,
      label: "second-agent",
      hash: hashToken(secondSecret),
      tokenPrefix: secondSecret.slice(0, 12),
    })
    .returning({ id: mcpToken.id });
  if (!tok2) throw new Error("failed to insert second token");

  const [revoked] = await db
    .insert(mcpToken)
    .values({
      workspaceId: ws.id,
      label: "revoked-agent",
      hash: hashToken(revokedSecret),
      tokenPrefix: revokedSecret.slice(0, 12),
      revoked: true,
      revokedAt: new Date(),
    })
    .returning({ id: mcpToken.id });
  if (!revoked) throw new Error("failed to insert revoked token");

  return {
    db,
    client,
    workspaceId: ws.id,
    projectId: proj.id,
    missionId: miss.id,
    tokenId: tok.id,
    secret,
    revokedSecret,
    secondSecret,
    secondTokenId: tok2.id,
  };
}

export async function closeTestWorld(world: TestWorld): Promise<void> {
  await world.client.close();
}
