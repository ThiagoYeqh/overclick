import type { Database } from "@agent-board/db";

export type AuthContext = {
  tokenId: string;
  workspaceId: string;
  tokenLabel: string;
};

/** Postgres or PGlite drizzle client — the query surface the tools use. */
export type McpDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "transaction"
>;
