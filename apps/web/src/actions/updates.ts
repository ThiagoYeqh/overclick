"use server";

import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { workspace } from "@agent-board/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "../lib/action-result";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import {
  readUpdaterState,
  STATUS_FILE,
  TRIGGER_FILE,
  updateHelperDir,
  type UpdaterState,
} from "../lib/updates";

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
 * recreate the app. Reports triggered: false when no sidecar is running, so
 * the UI shows the command that enables it instead of pretending to work.
 */
export async function triggerUpdateAction(): Promise<TriggerUpdateResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };

  const dir = updateHelperDir();
  if (!dir) return { ok: true, triggered: false };
  const state = await readUpdaterState();
  if (!state.running) return { ok: true, triggered: false };
  try {
    // The stale status of the previous run goes first: the UI polls this file
    // and must not read the last update's "done" as this one's result.
    await rm(join(dir, STATUS_FILE), { force: true });
    await writeFile(join(dir, TRIGGER_FILE), new Date().toISOString());
    return { ok: true, triggered: true };
  } catch {
    return { ok: false, error: "Could not write the update trigger." };
  }
}

export type UpdaterStateResult =
  | { ok: true; state: UpdaterState }
  | { ok: false; error: string };

/**
 * What the sidecar is doing right now. The Settings panel polls this while an
 * update runs: the app itself is recreated halfway through, so the progress
 * lives in the shared volume and survives its own restart.
 */
export async function readUpdaterStateAction(): Promise<UpdaterStateResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };
  return { ok: true, state: await readUpdaterState() };
}
