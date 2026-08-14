"use server";

import { workspace, type ExecutorConfig } from "@agent-board/db";
import { eq } from "drizzle-orm";
import type { ActionResult } from "../lib/action-result";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import {
  CUSTOM_EXECUTOR_ID,
  EXECUTOR_CATALOG,
  type ExecutorSelection,
} from "../lib/executors";

/** Persists the executor selection into the workspace config (jsonb). */
export async function saveExecutorsAction(
  sel: ExecutorSelection,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace not found." };

  const config: ExecutorConfig[] = EXECUTOR_CATALOG.map((d) => ({
    id: d.id,
    label: d.label,
    enabled: d.id in sel.enabled,
    models: sel.enabled[d.id] ?? [],
  }));
  config.push({
    id: CUSTOM_EXECUTOR_ID,
    label: sel.customName.trim() || "Custom",
    enabled: sel.customEnabled,
    models: [],
  });

  await db().update(workspace).set({ executors: config }).where(eq(workspace.id, ws.id));
  return { ok: true };
}
