"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCardapioAction, type CardapioInput } from "../../actions/cardapio";
import { addSeenExecutorAction, saveExecutorsAction } from "../../actions/executors";
import { saveLanguageAction } from "../../actions/language";
import { createTokenAction, revokeTokenAction } from "../../actions/tokens";
import { saveUpdateCheckAction } from "../../actions/updates";
import { NebulaAtmosphere } from "../../components/nebula-atmosphere";
import {
  ExecutorsGrid,
  type ExecutorSelection,
} from "../../components/executors-grid";
import {
  CUSTOM_EXECUTOR_ID,
  EXECUTOR_CATALOG,
  cardapioLabel,
  resolveCatalogCli,
} from "../../lib/executors";
import { LANGUAGES, dict, type Dict } from "../../lib/i18n";

type CardapioRow = { activityType: string; cli: string | null; model: string | null; effort: string };
type SeenSuggestion = { cli: string; model: string; count: number; lastSeenAt: string };
type TokenRow = {
  id: string;
  label: string;
  masked: string;
  revoked: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

const EFFORTS = ["low", "medium", "high"] as const;

function fmtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}
function fmtLastUse(iso: string | null, t: Dict): string {
  if (!iso) return t.settings.neverUsed;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return t.settings.justNow;
  if (m < 60) return t.board.minAgo(m);
  const h = Math.round(m / 60);
  if (h < 24) return t.board.hAgo(h);
  const d = Math.round(h / 24);
  return d === 1 ? t.settings.yesterday : t.board.dAgo(d);
}

export function SettingsClient({
  host,
  workspaceName,
  projectName,
  executors,
  seenSuggestions,
  cardapio,
  tokens,
  lang,
  updateCheckEnabled,
}: {
  host: string;
  workspaceName: string;
  projectName: string;
  executors: ExecutorSelection;
  seenSuggestions: SeenSuggestion[];
  cardapio: CardapioRow[];
  tokens: TokenRow[];
  lang: string;
  updateCheckEnabled: boolean;
}) {
  const t = dict(lang);
  const dateLocale = lang === "pt-BR" ? "pt-BR" : "en-US";
  const router = useRouter();
  const [tab, setTab] = useState<string>("exec");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const tabs = [
    { id: "exec", label: t.settings.tabExecutors },
    { id: "policy", label: t.settings.tabPolicy },
    { id: "tokens", label: t.settings.tabTokens },
    { id: "language", label: t.settings.tabLanguage },
    { id: "updates", label: t.updates.tabUpdates },
  ];

  // ---- update check (opt-in, off by default)
  const [updCheck, setUpdCheck] = useState(updateCheckEnabled);
  const saveUpd = () =>
    start(async () => {
      setErr(null); setMsg(null);
      const r = await saveUpdateCheckAction(updCheck);
      if (!r.ok) setErr(r.error);
      else { setMsg(t.updates.checkSaved); router.refresh(); }
    });

  // ---- language
  const [langSel, setLangSel] = useState(lang);
  const saveLang = () =>
    start(async () => {
      setErr(null); setMsg(null);
      const r = await saveLanguageAction(langSel);
      if (!r.ok) setErr(r.error);
      else { setMsg(dict(langSel).settings.langSaved); router.refresh(); }
    });

  // ---- executors
  const [sel, setSel] = useState<ExecutorSelection>(executors);
  const [added, setAdded] = useState<string[]>([]);
  const saveExec = () =>
    start(async () => {
      setErr(null); setMsg(null);
      const r = await saveExecutorsAction(sel);
      if (!r.ok) setErr(r.error);
      else { setMsg(t.settings.execSaved); router.refresh(); }
    });
  const addSeen = (s: SeenSuggestion) =>
    start(async () => {
      setErr(null); setMsg(null);
      const r = await addSeenExecutorAction(s.cli, s.model);
      if (!r.ok) setErr(r.error);
      else {
        const targetId = resolveCatalogCli(s.cli) ?? s.cli.toLowerCase();
        // Mirror the server change locally so the grid and the policy
        // selects pick the pair up without a reload.
        setSel((prev) => ({
          ...prev,
          models: {
            ...prev.models,
            [targetId]: [...new Set([...(prev.models[targetId] ?? []), s.model])],
          },
          enabled: {
            ...prev.enabled,
            [targetId]: [...new Set([...(prev.enabled[targetId] ?? []), s.model])],
          },
          labels: EXECUTOR_CATALOG.some((d) => d.id === targetId)
            ? prev.labels
            : { ...prev.labels, [targetId]: s.cli },
        }));
        setAdded((prev) => [...prev, `${s.cli}·${s.model}`]);
        setMsg(t.settings.addedMsg(s.cli, s.model));
        router.refresh();
      }
    });

  // ---- harness policy (cardapio)
  const [rows, setRows] = useState<CardapioRow[]>(cardapio);
  const cliOptions = [
    ...Object.keys(sel.enabled).map((id) => ({
      id,
      label: EXECUTOR_CATALOG.find((d) => d.id === id)?.label ?? sel.labels[id] ?? id,
    })),
    ...(sel.customEnabled
      ? [{ id: CUSTOM_EXECUTOR_ID, label: sel.customName.trim() || "Custom" }]
      : []),
  ];
  const modelsFor = (cli: string | null): string[] => {
    if (!cli) {
      const all = cliOptions.flatMap((o) => sel.enabled[o.id] ?? []);
      return [...new Set(all)];
    }
    if (cli === CUSTOM_EXECUTOR_ID) return ["generic-mcp"];
    return sel.enabled[cli]?.length
      ? sel.enabled[cli]
      : (sel.models[cli] ?? EXECUTOR_CATALOG.find((d) => d.id === cli)?.models ?? []);
  };
  const setRow = (i: number, patch: Partial<CardapioRow>) => {
    setRows(rows.map((r, j) => {
      if (j !== i) return r;
      const next = { ...r, ...patch };
      if (patch.cli !== undefined) {
        const models = modelsFor(patch.cli || null);
        if (!next.model || !models.includes(next.model)) next.model = models[0] ?? null;
      }
      return next;
    }));
  };
  const savePolicy = () =>
    start(async () => {
      setErr(null); setMsg(null);
      const r = await saveCardapioAction(rows as CardapioInput[]);
      if (!r.ok) setErr(r.error);
      else { setMsg(t.settings.policySaved); router.refresh(); }
    });

  // ---- tokens
  const [newLabel, setNewLabel] = useState("");
  const [fresh, setFresh] = useState<{ secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const genToken = () =>
    start(async () => {
      setErr(null); setMsg(null);
      const r = await createTokenAction(newLabel || "unnamed token");
      if (!r.ok) return setErr(r.error);
      setFresh({ secret: r.secret });
      setNewLabel("");
      router.refresh();
    });
  const revoke = (id: string) =>
    start(async () => {
      setErr(null);
      const r = await revokeTokenAction(id);
      if (!r.ok) setErr(r.error);
      else router.refresh();
    });
  const copyFresh = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(
        `claude mcp add --transport http overclick \\\n  http://${host}/mcp \\\n  --header "Authorization: Bearer ${fresh.secret}"`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <>
      <NebulaAtmosphere />
      <div className="page">
        <div className="topbar nebula-glass">
          <div className="logo">over<span>click</span></div>
          <div className="crumb">{workspaceName} / <b>{projectName}</b></div>
          <div className="spacer" />
          <a className="btn-ghost" href="/home">{t.settings.backToBoard}</a>
        </div>

        <h1>{t.settings.title}</h1>
        <p className="page-sub">{t.settings.sub}</p>

        <div className="settabs">
          {tabs.map((tb) => (
            <span key={tb.id} className={tab === tb.id ? "on" : ""} onClick={() => { setTab(tb.id); setErr(null); setMsg(null); }}>
              {tb.label}
            </span>
          ))}
        </div>

        {err ? <p className="werr">{err}</p> : null}
        {msg ? <p className="wok">{msg}</p> : null}

        {/* ---- EXECUTORS ---- */}
        <div className={`tabpane${tab === "exec" ? " active" : ""}`}>
          {seenSuggestions.filter((s) => !added.includes(`${s.cli}·${s.model}`)).length > 0 ? (
            <div className="seen-sugg">
              <div className="sec-cap">{t.settings.seenCap}</div>
              <div className="seen-row">
                {seenSuggestions
                  .filter((s) => !added.includes(`${s.cli}·${s.model}`))
                  .map((s) => (
                    <span key={`${s.cli}·${s.model}`} className="seen-chip">
                      <b>{s.cli}</b> · {s.model}
                      <small>{t.settings.connections(s.count)}</small>
                      <button
                        className="seen-add"
                        disabled={pending}
                        onClick={() => addSeen(s)}
                      >
                        {t.settings.add}
                      </button>
                    </span>
                  ))}
              </div>
              <div className="seen-note">{t.settings.seenNote}</div>
            </div>
          ) : null}
          <ExecutorsGrid value={sel} onChange={setSel} />
          <div className="hint">
            <b>{t.settings.execHintStrong}</b> {t.settings.execHint}
          </div>
          <div className="save-row">
            <button className="btn-new" disabled={pending} onClick={saveExec}>
              {pending ? t.settings.saving : t.settings.saveExecutors}
            </button>
          </div>
        </div>

        {/* ---- HARNESS POLICY ---- */}
        <div className={`tabpane${tab === "policy" ? " active" : ""}`}>
          <table className="policy">
            <thead>
              <tr><th>{t.settings.thActivity}</th><th>{t.settings.thCli}</th><th>{t.settings.thModel}</th><th>{t.settings.thEffort}</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const meta = t.cardapio[r.activityType] ?? cardapioLabel(r.activityType);
                const models = modelsFor(r.cli);
                return (
                  <tr key={r.activityType}>
                    <td className="act">{meta.label}<small>{meta.hint}</small></td>
                    <td>
                      <select className="sel" value={r.cli ?? ""} onChange={(e) => setRow(i, { cli: e.target.value || null })}>
                        <option value="">{t.settings.noPreference}</option>
                        {cliOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="sel" value={r.model ?? ""} onChange={(e) => setRow(i, { model: e.target.value || null })}>
                        {r.model && !models.includes(r.model) ? <option value={r.model}>{r.model}</option> : null}
                        {models.map((m) => <option key={m} value={m}>{m}</option>)}
                        {!r.model ? <option value="">—</option> : null}
                      </select>
                    </td>
                    <td>
                      <select className="sel eff" value={r.effort} onChange={(e) => setRow(i, { effort: e.target.value })}>
                        {EFFORTS.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="policy-note">
            {t.settings.policyNote} <b>harness_list</b> {t.settings.policyNoteAfter}
          </div>
          <div className="save-row">
            <button className="btn-new" disabled={pending} onClick={savePolicy}>
              {pending ? t.settings.saving : t.settings.savePolicy}
            </button>
          </div>
        </div>

        {/* ---- TOKENS ---- */}
        <div className={`tabpane${tab === "tokens" ? " active" : ""}`}>
          <div className="tok-list">
            {tokens.length === 0 ? (
              <div className="empty-col">{t.settings.tokensEmpty}</div>
            ) : (
              tokens.map((tok) => (
                <div key={tok.id} className={`tok${tok.revoked ? " revoked" : ""}`}>
                  <div className="meta">
                    <div className="label">{tok.label}</div>
                    <div className="sub">
                      {t.settings.created} {fmtDate(tok.createdAt, dateLocale)} ·{" "}
                      {tok.revoked ? t.settings.revoked : fmtLastUse(tok.lastUsedAt, t)}
                    </div>
                  </div>
                  <span className="val">{tok.masked}</span>
                  <button className="btn-rev" disabled={pending || tok.revoked} onClick={() => revoke(tok.id)}>
                    {tok.revoked ? t.settings.revoked : t.settings.revoke}
                  </button>
                </div>
              ))
            )}
          </div>

          {fresh ? (
            <div className="fresh-tok">
              <div className="lbl">{t.settings.freshToken}</div>
              <div className="cmd">{fresh.secret}
                <button className={`copy${copied ? " ok" : ""}`} onClick={copyFresh}>
                  {copied ? t.wizard.copied : t.settings.copyCommand}
                </button>
              </div>
            </div>
          ) : null}

          <div className="gen-row">
            <input
              className="input"
              style={{ maxWidth: 320 }}
              placeholder={t.settings.tokenPlaceholder}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <button className="btn-new" disabled={pending} onClick={genToken}>
              {pending ? t.wizard.generating : t.settings.generateTokenBtn}
            </button>
          </div>

          <div className="sec-cap">{t.settings.connectAgent}</div>
          <div className="cmd">
{`claude mcp add --transport http overclick \\
  http://${host}/mcp \\
  --header "Authorization: Bearer ocb_••••••••••••"`}
          </div>
          <div className="policy-note" style={{ borderTop: 0, paddingTop: 8 }}>
            {t.settings.maskedNote}
          </div>
        </div>

        {/* ---- LANGUAGE ---- */}
        <div className={`tabpane${tab === "language" ? " active" : ""}`}>
          <div className="field" style={{ maxWidth: 320 }}>
            <label>{t.settings.langLabel}</label>
            <select
              className="sel"
              value={langSel}
              onChange={(e) => setLangSel(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div className="policy-note" style={{ borderTop: 0, paddingTop: 8 }}>
            {t.settings.langNote}
          </div>
          <div className="save-row">
            <button className="btn-new" disabled={pending} onClick={saveLang}>
              {pending ? t.settings.saving : t.settings.saveLanguage}
            </button>
          </div>
        </div>

        {/* ---- UPDATES ---- */}
        <div className={`tabpane${tab === "updates" ? " active" : ""}`}>
          <label className="upd-toggle">
            <input
              type="checkbox"
              checked={updCheck}
              onChange={(e) => setUpdCheck(e.target.checked)}
            />
            <span>{t.updates.checkLabel}</span>
          </label>
          <div className="policy-note" style={{ borderTop: 0, paddingTop: 8 }}>
            {t.updates.checkNote}
          </div>
          <div className="save-row">
            <button className="btn-new" disabled={pending} onClick={saveUpd}>
              {pending ? t.settings.saving : t.updates.saveCheck}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
