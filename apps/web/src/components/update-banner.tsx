"use client";

import { useState, useTransition } from "react";
import { triggerUpdateAction } from "../actions/updates";
import { dict } from "../lib/i18n";
import { UPDATE_COMMAND, UPDATER_ENABLE_COMMAND } from "../lib/update-commands";

export function UpdateBanner({
  version,
  changelog,
  url,
  helper,
  lang,
}: {
  version: string;
  changelog: string;
  url: string;
  helper: boolean;
  lang: string;
}) {
  const t = dict(lang);
  const [pending, start] = useTransition();
  const [showCmd, setShowCmd] = useState(false);
  const [requested, setRequested] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  // With the sidecar running the button does the work and the banner stays
  // quiet; without it, the only honest thing to offer is the two commands.
  const onUpdate = () =>
    start(async () => {
      setErr(null);
      if (!helper) {
        setShowCmd(true);
        return;
      }
      const r = await triggerUpdateAction();
      if (!r.ok) setErr(r.error);
      else if (r.triggered) setRequested(true);
      else setShowCmd(true);
    });

  const notes = changelog.trim();

  return (
    <div className="update-banner nebula-glass">
      <div className="ub-head">
        <b>{t.updates.newVersion(version)}</b>
        <a href={url} target="_blank" rel="noreferrer">
          {t.updates.releaseNotes}
        </a>
        <div className="spacer" />
        <button className="btn-ghost" onClick={() => setHidden(true)}>
          {t.updates.dismiss}
        </button>
        <button className="btn-new" disabled={pending || requested} onClick={onUpdate}>
          {t.updates.updateBtn}
        </button>
      </div>
      {notes ? <pre className="ub-notes">{notes.slice(0, 800)}</pre> : null}
      {requested ? <p className="wok">{t.updates.updateRequested}</p> : null}
      {showCmd ? (
        <>
          <div className="ub-cmd">
            <span>{t.updates.runOnServer}</span>
            <code>{UPDATE_COMMAND}</code>
          </div>
          <div className="ub-cmd">
            <span>{t.updates.updaterAbsent}</span>
            <code>{UPDATER_ENABLE_COMMAND}</code>
          </div>
        </>
      ) : null}
      {err ? <p className="werr">{err}</p> : null}
    </div>
  );
}
