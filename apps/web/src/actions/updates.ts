"use server";

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { workspace } from "@agent-board/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "../lib/action-result";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import { updateHelperDir } from "../lib/updates";

/** Persists the opt-in GitHub Releases update check. OFF by default. */
export async function saveUpdateCheckAction(
  enabled: boolean,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const ws = await db().query.workspace.findFirst();
  if (!ws) return { ok: false, error: "Workspace not found." };

  await db()
    .update(workspace)
    .set({ updateCheckEnabled: enabled })
    .where(eq(workspace.id, ws.id));
  revalidatePath("/home");
  revalidatePath("/settings");
  return { ok: true };
}

export type TriggerUpdateResult =
  | { ok: true; triggered: boolean }
  | { ok: false; error: string };

/**
 * Asks the optional compose updater profile to pull the new image and
 * recreate the app. When the helper is not mounted, reports triggered: false
 * so the UI shows the copy-paste command instead.
 */
export async function triggerUpdateAction(): Promise<TriggerUpdateResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const dir = updateHelperDir();
  if (!dir) return { ok: true, triggered: false };
  try {
    await writeFile(join(dir, "update-requested"), new Date().toISOString());
    return { ok: true, triggered: true };
  } catch {
    return { ok: false, error: "Could not write the update trigger." };
  }
}
