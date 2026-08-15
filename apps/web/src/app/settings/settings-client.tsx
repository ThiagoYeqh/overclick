"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCardapioAction, type CardapioInput } from "../../actions/cardapio";
import { saveExecutorsAction } from "../../actions/executors";
import { createTokenAction, revokeTokenAction } from "../../actions/tokens";
import { NebulaAtmosphere } from "../../components/nebula-atmosphere";
import {
  ExecutorsGrid,
  type ExecutorSelection,
} from "../../components/executors-grid";
import {
  CUSTOM_EXECUTOR_ID,
  EXECUTOR_CATALOG,
  cardapioLabel,
} from "../../lib/executors";

type CardapioRow = { activityType: string; cli: string | null; model: string | null; effort: string };
type TokenRow = {
  id: string;
  label: string;
  masked: string;
  revoked: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

const TABS = [
  { id: "exec", label: "Executors" },
  { id: "policy", label: "Harness policy" },
  { id: "tokens", label: "MCP tokens" },
] as const;

const EFFORTS = ["low", "medium", "high"] as const;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtLastUse(iso: string | null): string {
  if (!iso) return "never used";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} d ago`;
}

export function SettingsClient({
  host,
  workspaceName,
  projectName,
  executors,
  cardapio,
  tokens,
}: {
  host: string;
  workspaceName: string;
  projectName: string;
  executors: ExecutorSelection;
  cardapio: CardapioRow[];
  tokens: TokenRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<string>("exec");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ---- executors
  const [sel, setSel] = useState<ExecutorSelection>(executors);
  const saveExec = () =>
    start(async () => {
      setErr(null); setMsg(null);
      const r = await saveExecutorsAction(sel);
      if (!r.ok) setErr(r.error);
      else { setMsg("Executors saved."); router.refresh(); }
    });

  // ---- harness policy (cardapio)
  const [rows, setRows] = useState<CardapioRow[]>(cardapio);
  const cliOptions = [
    ...Object.keys(sel.enabled).map((id) => ({
      id,
      label: EXECUTOR_CATALOG.find((d) => d.id === id)?.label ?? id,
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
      else { setMsg("Policy saved. The agent already reads the new one."); router.refresh(); }
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
          <a className="btn-ghost" href="/home">← Board</a>
        </div>

        <h1>Settings</h1>
        <p className="page-sub">Executors, harness policy, and MCP access for this instance.</p>

        <div className="settabs">
          {TABS.map((t) => (
            <span key={t.id} className={tab === t.id ? "on" : ""} onClick={() => { setTab(t.id); setErr(null); setMsg(null); }}>
              {t.label}
            </span>
          ))}
        </div>

        {err ? <p className="werr">{err}</p> : null}
        {msg ? <p className="wok">{msg}</p> : null}

        {/* ---- EXECUTORS ---- */}
        <div className={`tabpane${tab === "exec" ? " active" : ""}`}>
          <ExecutorsGrid value={sel} onChange={setSel} />
          <div className="hint">
            <b>The executors checked here feed the harness policy.</b> The policy
            tab next door only offers the CLIs that are turned on.
          </div>
          <div className="save-row">
            <button className="btn-new" disabled={pending} onClick={saveExec}>
              {pending ? "Saving…" : "Save executors"}
            </button>
          </div>
        </div>

        {/* ---- HARNESS POLICY ---- */}
        <div className={`tabpane${tab === "policy" ? " active" : ""}`}>
          <table className="policy">
            <thead>
              <tr><th>Activity type</th><th>CLI</th><th>Model</th><th>Effort</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const meta = cardapioLabel(r.activityType);
                const models = modelsFor(r.cli);
                return (
                  <tr key={r.activityType}>
                    <td className="act">{meta.label}<small>{meta.hint}</small></td>
                    <td>
                      <select className="sel" value={r.cli ?? ""} onChange={(e) => setRow(i, { cli: e.target.value || null })}>
                        <option value="">no preference</option>
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
            the agent reads this policy via <b>harness_list</b> · each card&apos;s recommendation is born here
          </div>
          <div className="save-row">
            <button className="btn-new" disabled={pending} onClick={savePolicy}>
              {pending ? "Saving…" : "Save policy"}
            </button>
          </div>
        </div>

        {/* ---- TOKENS ---- */}
        <div className={`tabpane${tab === "tokens" ? " active" : ""}`}>
          <div className="tok-list">
            {tokens.length === 0 ? (
              <div className="empty-col">No tokens yet. Generate one to connect your first agent.</div>
            ) : (
              tokens.map((t) => (
                <div key={t.id} className={`tok${t.revoked ? " revoked" : ""}`}>
                  <div className="meta">
                    <div className="label">{t.label}</div>
                    <div className="sub">created {fmtDate(t.createdAt)} · {t.revoked ? "revoked" : fmtLastUse(t.lastUsedAt)}</div>
                  </div>
                  <span className="val">{t.masked}</span>
                  <button className="btn-rev" disabled={pending || t.revoked} onClick={() => revoke(t.id)}>
                    {t.revoked ? "Revoked" : "Revoke"}
                  </button>
                </div>
              ))
            )}
          </div>

          {fresh ? (
            <div className="fresh-tok">
              <div className="lbl">Token created. It is shown only once.</div>
              <div className="cmd">{fresh.secret}
                <button className={`copy${copied ? " ok" : ""}`} onClick={copyFresh}>
                  {copied ? "Copied" : "Copy command"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="gen-row">
            <input
              className="input"
              style={{ maxWidth: 320 }}
              placeholder="token name (e.g. Codex CI)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <button className="btn-new" disabled={pending} onClick={genToken}>
              {pending ? "Generating…" : "+ Generate token"}
            </button>
          </div>

          <div className="sec-cap">connect an agent</div>
          <div className="cmd">
{`claude mcp add --transport http overclick \\
  http://${host}/mcp \\
  --header "Authorization: Bearer ocb_••••••••••••"`}
          </div>
          <div className="policy-note" style={{ borderTop: 0, paddingTop: 8 }}>
            the full token is shown only once, at generation time · here it stays masked
          </div>
        </div>
      </div>
    </>
  );
}
