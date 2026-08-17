"use server";

import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { workspace } from "@agent-board/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "../lib/action-result";
import { getSession } from "../lib/cookies";
import { db } from "../lib/db";
import { detectRuntime } from "../lib/runtime";
import {
  RESTART_ENV,
  restartOptInFrom,
  runSourceUpdate,
  type Exec,
  type ProcessMode,
  type SourceUpdateReport,
} from "../lib/source-update";
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

/** How long any single update step may run before it is given up on. */
const STEP_TIMEOUT_MS = 10 * 60_000;
/** Output a step may print before the rest is dropped. Only the tail is shown. */
const STEP_MAX_BUFFER = 4 * 1024 * 1024;
/** Grace for the response to reach the browser before the process ends. */
const EXIT_DELAY_MS = 1500;

/**
 * Runs one command and reports how it went instead of throwing. A step that
 * fails is a result the panel shows, not an exception: the runner decides
 * whether the update can continue.
 */
const shellExec: Exec = (command, args, cwd) =>
  new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { cwd, timeout: STEP_TIMEOUT_MS, maxBuffer: STEP_MAX_BUFFER },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as { code?: unknown }).code === "number"
            ? ((error as { code: number }).code as number)
            : error
              ? 1
              : 0;
        resolve({
          code,
          stdout: stdout?.toString() ?? "",
          // A command that is not installed at all never prints anything, so
          // the spawn error is the only sentence explaining the failure.
          stderr: (stderr?.toString() ?? "") + (error && !stderr ? error.message : ""),
        });
      },
    );
  });

function processMode(): ProcessMode {
  return process.env.NODE_ENV === "production" ? "production" : "dev";
}

export type SourceUpdateResult =
  | { ok: true; report: SourceUpdateReport }
  | { ok: false; error: string };

/**
 * The Update button on a source install. It runs the update here, in this
 * process's own checkout, and returns the whole step log at once: no socket to
 * hand out, no sidecar to trust, and nothing to poll, because unlike a
 * container being recreated this server survives its own update.
 *
 * Signed-in owners only, and only where the instance really runs from source:
 * a container has an image to pull and its own path for that.
 */
export async function runSourceUpdateAction(
  options: { force?: boolean } = {},
): Promise<SourceUpdateResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Session expired. Sign in again." };
  if (detectRuntime() !== "source") {
    return {
      ok: false,
      error: "This instance runs in a container: update it the container way.",
    };
  }

  const report = await runSourceUpdate({
    exec: shellExec,
    cwd: process.cwd(),
    mode: processMode(),
    restartOptIn: restartOptInFrom(process.env[RESTART_ENV]),
    force: options.force === true,
  });

  if (report.outcome === "updated") revalidatePath("/settings");

  // Only after the report is on its way out: the panel has to be able to show
  // what ran before the process that ran it goes away.
  if (report.restart === "exit") {
    setTimeout(() => process.exit(0), EXIT_DELAY_MS).unref();
  }

  return { ok: true, report };
}
