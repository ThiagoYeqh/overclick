"use client";

import { useCallback, useEffect, useState } from "react";
import { readUpdaterStateAction, triggerUpdateAction } from "../actions/updates";
import { dict } from "../lib/i18n";
import type { UpdaterState } from "../lib/updates";

/** How often the panel asks the shared volume what the sidecar is doing. */
const POLL_MS = 2000;

/**
 * The Update button, and the honest version of what it can do.
 *
 * With the optional updater profile running, the button asks it to pull the
 * new image and recreate the app, then follows the run to its result. The app
 * is recreated in the middle of that run, so the progress is read from the
 * volume both containers share and survives the restart that kills this page's
 * own server.
 *
 * Without the sidecar there is nothing on this machine allowed to restart a
 * container, so the panel says so and shows the one command that changes it,
 * with what that command costs.
 */
export function UpdatePanel({
  version,
  enableCommand,
  manualCommand,
  initialState,
  lang,
}: {
  version: string;
  enableCommand: string;
  manualCommand: string;
  initialState: UpdaterState;
  lang: string;
}) {
  const t = dict(lang);
  const [state, setState] = useState(initialState);
  const [running, setRunning] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const phase = state.status?.phase ?? null;
  const finished = phase === "done" || phase === "failed";

  const poll = useCallback(async () => {
    const result = await readUpdaterStateAction().catch(() => null);
    // A null result is the app being recreated under us. That is the update
    // working, not an error: keep polling until it answers again.
    if (!result) {
      setUnreachable(true);
      return;
    }
    setUnreachable(false);
    if (result.ok) setState(result.state);
    else setErr(result.error);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [running, poll]);

  // The sidecar reached an end state: stop asking.
  useEffect(() => {
    if (running && finished) setRunning(false);
  }, [running, finished]);

  const update = async () => {
    setErr(null);
    // The previous run's result must not read as this one's: the server drops
    // the status file, this drops the copy already on screen.
    setState((current) => ({ ...current, status: null }));
    setRunning(true);
    const result = await triggerUpdateAction().catch(() => null);
    if (!result) {
      setUnreachable(true);
      return;
    }
    if (!result.ok) {
      setErr(result.error);
      setRunning(false);
      return;
    }
    if (!result.triggered) {
      // The sidecar stopped between the page load and the click.
      setRunning(false);
      await poll();
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  const phaseLabel = phase ? t.updates.phase[phase] : null;

  return (
    <div className="upd-panel">
      <p className="upd-version">{t.updates.runningVersion(version)}</p>

      {state.running ? (
        <>
          <p className="upd-state ok">{t.updates.updaterDetected}</p>
          <div className="save-row">
            <button className="btn-new" disabled={running} onClick={update}>
              {running ? t.updates.updating : t.updates.updateBtn}
            </button>
          </div>
          {unreachable ? <p className="upd-state">{t.updates.appRestarting}</p> : null}
          {phaseLabel ? (
            <p className={`upd-state${phase === "failed" ? " bad" : phase === "done" ? " ok" : ""}`}>
              {phaseLabel}
            </p>
          ) : null}
          {state.status?.detail ? (
            <pre className="upd-log">{state.status.detail}</pre>
          ) : null}
          <div className="policy-note" style={{ borderTop: 0, paddingTop: 8 }}>
            {t.updates.socketNote}
          </div>
        </>
      ) : (
        <>
          <p className="upd-state">{t.updates.updaterAbsent}</p>
          <div className="upd-cmd-row">
            <code>{enableCommand}</code>
            <button className="btn-ghost" onClick={() => void copy(enableCommand)}>
              {copied === enableCommand ? t.detail.copied : t.wizard.copy}
            </button>
          </div>
          <div className="policy-note" style={{ borderTop: 0, paddingTop: 8 }}>
            {t.updates.socketNote}
          </div>
          <p className="upd-state">{t.updates.manualPath}</p>
          <div className="upd-cmd-row">
            <code>{manualCommand}</code>
            <button className="btn-ghost" onClick={() => void copy(manualCommand)}>
              {copied === manualCommand ? t.detail.copied : t.wizard.copy}
            </button>
          </div>
        </>
      )}
      {err ? <p className="werr">{err}</p> : null}
    </div>
  );
}
