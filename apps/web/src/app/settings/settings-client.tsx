"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { saveCardapioAction, type CardapioInput } from "../../actions/cardapio";
import { addSeenExecutorAction, saveExecutorsAction } from "../../actions/executors";
import { saveLanguageAction } from "../../actions/language";
import { saveProjectAction } from "../../actions/onboarding";
import { savePricesAction, savePricingEnabledAction } from "../../actions/prices";
import { saveRecipesAction } from "../../actions/recipes";
import {
  createPairingCodeAction,
  createTokenAction,
  revokeTokenAction,
} from "../../actions/tokens";
import { saveUpdateCheckAction } from "../../actions/updates";
import { NebulaAtmosphere } from "../../components/nebula-atmosphere";
import { UpdatePanel } from "../../components/update-panel";
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
import type { Runtime } from "../../lib/runtime";
import type { UpdaterState } from "../../lib/updates";
import {
  buildMcpConnectCommand,
  mcpClientFromExecutorId,
} from "../../lib/mcp-command";
import type { ModelPriceRow, UsageRecipeRow } from "@agent-board/db";

type CardapioRow = {
  activityType: string;
  cli: string | null;
  model: string | null;
  effort: string;
  updatedBy: string | null;
  updatedAt: string | null;
};
type SeenSuggestion = { cli: string; model: string; count: number; lastSeenAt: string };
/** One line of the price table, as the form edits it (numbers stay strings). */
type PriceRow = {
  model: string;
  label: string;
  input: string;
  output: string;
  cache: string;
  source: "seed" | "custom";
  seededAt: string | null;
  updatedBy: string | null;
};
type TokenRow = {
  id: string;
  label: string;
  masked: string;
  canManage: boolean;
  revoked: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};
type ProjectRow = {
  id: string;
  name: string;
  repoUrl: string;
  prefix: string;
  nextNumber: number;
};

const EFFORTS = ["low", "medium", "high"] as const;
const CONNECT_CLIENTS = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "gemini-cli", label: "Gemini" },
  { id: "generic", label: "Other" },
] as const;

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
  projects,
  executors,
  seenSuggestions,
  cardapio,
  prices,
  pricingEnabled,
  unpricedModels,
  recipes,
  tokens,
  lang,
  updateCheckEnabled,
  version,
  runtime,
  updater,
  enableCommand,
  manualCommand,
  sourceCommand,
}: {
  host: string;
  workspaceName: string;
  projectName: string;
  projects: ProjectRow[];
  executors: ExecutorSelection;
  seenSuggestions: SeenSuggestion[];
  cardapio: CardapioRow[];
  prices: ModelPriceRow[];
  pricingEnabled: boolean;
  unpricedModels: string[];
  recipes: UsageRecipeRow[];
  tokens: TokenRow[];
  lang: string;
  updateCheckEnabled: boolean;
  version: string;
  /** Read on the server: whether this instance runs from an image or a checkout. */
  runtime: Runtime;
  /** Read on the server: whether the optional updater sidecar is alive. */
  updater: UpdaterState;
  enableCommand: string;
  manualCommand: string;
  sourceCommand: string;
}) {
  const t = dict(lang);
  const dateLocale = lang === "pt-BR" ? "pt-BR" : "en-US";
  const router = useRouter();
  const [tab, setTab] = useState<string>("projects");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const tabs = [
    { id: "projects", label: t.settings.tabProjects },
    { id: "exec", label: t.settings.tabExecutors },
    { id: "policy", label: t.settings.tabPolicy },
    { id: "prices", label: t.settings.tabPrices },
    { id: "recipes", label: t.settings.tabRecipes },
    { id: "tokens", label: t.settings.tabTokens },
    { id: "language", label: t.settings.tabLanguage },
    { id: "updates", label: t.updates.tabUpdates },
  ];

  // ---- projects
  const [projectRows, setProjectRows] = useState<ProjectRow[]>(projects);
  const [newProject, setNewProject] = useState({ name: "", repoUrl: "", prefix: "" });
  useEffect(() => setProjectRows(projects), [projects]);
  const setProjectRow = (id: string, patch: Partial<ProjectRow>) => {
    setProjectRows((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };
  const saveProject = (row: ProjectRow) =>
    start(async () => {
      setErr(null); setMsg(null);
      const result = await saveProjectAction({
        projectId: row.id,
        name: row.name,
        repoUrl: row.repoUrl,
        prefix: row.prefix,
      });
      if (!result.ok) setErr(result.error);
      else { setMsg(t.settings.projectSaved); router.refresh(); }
    });
  const createProject = () =>
    start(async () => {
      setErr(null); setMsg(null);
      const result = await saveProjectAction({
        createNew: true,
        name: newProject.name,
        repoUrl: newProject.repoUrl,
        prefix: newProject.prefix,
      });
      if (!result.ok) setErr(result.error);
      else {
        setMsg(t.settings.projectCreated);
        setNewProject({ name: "", repoUrl: "", prefix: "" });
        router.refresh();
      }
    });

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

  // ---- cost layer, opt-in and off by default
  const [pricingOn, setPricingOn] = useState(pricingEnabled);
  const savePricing = (next: boolean) =>
    start(async () => {
      setErr(null); setMsg(null);
      setPricingOn(next);
      const r = await savePricingEnabledAction(next);
      if (!r.ok) { setPricingOn(!next); setErr(r.error); }
      else { setMsg(t.settings.pricingSaved); router.refresh(); }
    });

  // ---- model prices
  const [priceRows, setPriceRows] = useState<PriceRow[]>(
    prices.map((p) => ({
      model: p.model,
      label: p.label,
      input: String(p.inputPerMtok),
      output: String(p.outputPerMtok),
      cache: String(p.cachePerMtok),
      source: p.source,
      seededAt: p.seededAt,
      updatedBy: p.updatedBy,
    })),
  );
  const [addedModels, setAddedModels] = useState<string[]>([]);
  const [newModel, setNewModel] = useState("");
  const setPrice = (i: number, patch: Partial<PriceRow>) =>
    setPriceRows(priceRows.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const addPriceRow = (model: string) => {
    const label = model.trim();
    if (!label) return;
    if (priceRows.some((row) => row.label.toLowerCase() === label.toLowerCase())) return;
    setPriceRows([
      ...priceRows,
      {
        model: label,
        label,
        input: "0",
        output: "0",
        cache: "0",
        source: "custom",
        seededAt: null,
        updatedBy: null,
      },
    ]);
    setAddedModels((prev) => [...prev, label]);
    setNewModel("");
  };
  const removePriceRow = (i: number) =>
    setPriceRows(priceRows.filter((_, j) => j !== i));
  const savePrices = () =>
    start(async () => {
      setErr(null); setMsg(null);
      const r = await savePricesAction(
        priceRows.map((row) => ({
          model: row.model,
          label: row.label,
          inputPerMtok: Number(row.input),
          outputPerMtok: Number(row.output),
          cachePerMtok: Number(row.cache),
        })),
      );
      if (!r.ok) setErr(r.error);
      else { setMsg(t.settings.pricesSaved); router.refresh(); }
    });

  // ---- usage recipes
  const [recipeRows, setRecipeRows] = useState<UsageRecipeRow[]>(recipes);
  // A save refreshes the server data; adopt it, so the badge stops claiming a
  // recipe is the shipped one right after somebody rewrote it.
  const [recipesSeen, setRecipesSeen] = useState(recipes);
  if (recipesSeen !== recipes) {
    setRecipesSeen(recipes);
    setRecipeRows(recipes);
  }
  const setRecipe = (i: number, patch: Partial<UsageRecipeRow>) =>
    setRecipeRows(recipeRows.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const saveRecipes = () =>
    start(async () => {
      setErr(null); setMsg(null);
      const r = await saveRecipesAction(
        recipeRows.map((row) => ({
          cli: row.cli,
          label: row.label,
          instructions: row.instructions,
          command: row.command,
        })),
      );
      if (!r.ok) setErr(r.error);
      else { setMsg(t.settings.recipesSaved); router.refresh(); }
    });

  // ---- tokens
  const [newLabel, setNewLabel] = useState("");
  const [fresh, setFresh] = useState<{ secret: string } | null>(null);
  const [connectClient, setConnectClient] = useState<string>("claude-code");
  const [copied, setCopied] = useState(false);
  const [newCanManage, setNewCanManage] = useState(false);
  const genToken = () =>
    start(async () => {
      setErr(null); setMsg(null);
      const r = await createTokenAction(newLabel || "unnamed token", newCanManage);
      if (!r.ok) return setErr(r.error);
      setFresh({ secret: r.secret });
      setNewLabel("");
      setNewCanManage(false);
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
        buildMcpConnectCommand({
          client: mcpClientFromExecutorId(connectClient),
          baseUrl: `http://${host}/mcp`,
          token: fresh.secret,
        }),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };
  const maskedCommand = buildMcpConnectCommand({
    client: mcpClientFromExecutorId(connectClient),
    baseUrl: `http://${host}/mcp`,
    token: "ocb_••••••••••••",
  });

  // ---- pairing code: the token never travels through a chat
  const [pairFresh, setPairFresh] = useState<{ code: string } | null>(null);
  const [pairCopied, setPairCopied] = useState(false);
  const pairCmd = pairFresh
    ? `curl -sX POST http://${host}/api/pair \\\n  -H 'Content-Type: application/json' -d '{"code":"${pairFresh.code}"}'`
    : "";
  const genPair = () =>
    start(async () => {
      setErr(null); setMsg(null);
      const r = await createPairingCodeAction(newLabel || "paired agent");
      if (!r.ok) return setErr(r.error);
      setPairFresh({ code: r.code });
      setNewLabel("");
    });
  const copyPair = async () => {
    if (!pairFresh) return;
    try {
      await navigator.clipboard.writeText(pairCmd);
      setPairCopied(true);
      setTimeout(() => setPairCopied(false), 2000);
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

        {/* ---- PROJECTS ---- */}
        <div className={`tabpane${tab === "projects" ? " active" : ""}`}>
          <div className="projects-list">
            {projectRows.map((item) => (
              <div className="project-row nebula-glass" key={item.id}>
                <div className="project-fields">
                  <div className="field">
                    <label>Project name</label>
                    <input
                      className="input"
                      value={item.name}
                      onChange={(event) => setProjectRow(item.id, { name: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Repository URL <span className="opt">optional</span></label>
                    <input
                      className="input mono"
                      value={item.repoUrl}
                      placeholder="github.com/you/repo"
                      onChange={(event) => setProjectRow(item.id, { repoUrl: event.target.value })}
                    />
                  </div>
                  <div className="field project-prefix">
                    <label>ID prefix</label>
                    <input
                      className="input mono"
                      value={item.prefix}
                      maxLength={4}
                      onChange={(event) =>
                        setProjectRow(item.id, { prefix: event.target.value.toUpperCase() })
                      }
                    />
                  </div>
                </div>
                <div className="project-meta">
                  <span>next {item.prefix || "ID"}-{item.nextNumber}</span>
                  <button className="btn-new" disabled={pending} onClick={() => saveProject(item)}>
                    {pending ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="project-row project-new nebula-glass">
            <div className="project-fields">
              <div className="field">
                <label>New project</label>
                <input
                  className="input"
                  value={newProject.name}
                  placeholder="API"
                  onChange={(event) => setNewProject({ ...newProject, name: event.target.value })}
                />
              </div>
              <div className="field">
                <label>Repository URL <span className="opt">optional</span></label>
                <input
                  className="input mono"
                  value={newProject.repoUrl}
                  placeholder="github.com/you/repo"
                  onChange={(event) => setNewProject({ ...newProject, repoUrl: event.target.value })}
                />
              </div>
              <div className="field project-prefix">
                <label>ID prefix</label>
                <input
                  className="input mono"
                  value={newProject.prefix}
                  maxLength={4}
                  placeholder="API"
                  onChange={(event) =>
                    setNewProject({ ...newProject, prefix: event.target.value.toUpperCase() })
                  }
                />
              </div>
            </div>
            <div className="project-meta">
              <span>starts at 1</span>
              <button className="btn-new" disabled={pending} onClick={createProject}>
                {pending ? "Creating…" : "+ Add project"}
              </button>
            </div>
          </div>
        </div>

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
              <tr><th>{t.settings.thActivity}</th><th>{t.settings.thCli}</th><th>{t.settings.thModel}</th><th>{t.settings.thEffort}</th><th>{t.settings.thLastChange}</th></tr>
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
                    <td className="who">
                      {r.updatedBy && r.updatedAt ? (
                        <>{r.updatedBy}<small>{fmtDate(r.updatedAt, dateLocale)}</small></>
                      ) : (
                        <span className="dim">{t.settings.neverChanged}</span>
                      )}
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

        {/* ---- MODEL PRICES ---- */}
        <div className={`tabpane${tab === "prices" ? " active" : ""}`}>
          <p className="page-sub">{t.settings.pricesSub}</p>
          {/* The switch comes first: everything below it only matters once
              somebody decides this board should talk about money at all. */}
          <label className="upd-toggle">
            <input
              type="checkbox"
              checked={pricingOn}
              disabled={pending}
              onChange={(e) => savePricing(e.target.checked)}
            />
            <span>{t.settings.pricingToggle}</span>
          </label>
          <div className="policy-note" style={{ borderTop: 0, paddingTop: 8 }}>
            {pricingOn ? t.settings.pricingOnNote : t.settings.pricingOffNote}
          </div>
          <table className="policy">
            <thead>
              <tr>
                <th>{t.settings.thPriceModel}</th>
                <th>{t.settings.thPriceInput}</th>
                <th>{t.settings.thPriceOutput}</th>
                <th>{t.settings.thPriceCache}</th>
                <th>{t.settings.thPriceOrigin}</th>
              </tr>
            </thead>
            <tbody>
              {priceRows.map((row, i) => (
                <tr key={row.model}>
                  <td className="act">{row.label}</td>
                  {(["input", "output", "cache"] as const).map((field) => (
                    <td key={field}>
                      <input
                        className="input"
                        style={{ maxWidth: 110 }}
                        type="number"
                        min="0"
                        step="0.01"
                        value={row[field]}
                        onChange={(e) => setPrice(i, { [field]: e.target.value })}
                      />
                    </td>
                  ))}
                  <td className="who">
                    {row.source === "seed" && row.seededAt ? (
                      <span className="dim">{t.settings.priceSeeded(row.seededAt)}</span>
                    ) : (
                      <>
                        {t.settings.priceEdited}
                        {row.updatedBy ? <small>{row.updatedBy}</small> : null}
                      </>
                    )}
                    {addedModels.includes(row.label) ? (
                      <button className="seen-add" onClick={() => removePriceRow(i)}>
                        {t.settings.priceRemove}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {unpricedModels.filter((m) => !addedModels.includes(m)).length > 0 ? (
            <div className="seen-sugg">
              <div className="sec-cap">{t.settings.priceSeenModels}</div>
              <div className="seen-row">
                {unpricedModels
                  .filter((m) => !addedModels.includes(m))
                  .map((model) => (
                    <span key={model} className="seen-chip">
                      <b>{model}</b>
                      <button className="seen-add" onClick={() => addPriceRow(model)}>
                        {t.settings.add}
                      </button>
                    </span>
                  ))}
              </div>
            </div>
          ) : null}

          <div className="gen-row">
            <input
              className="input"
              style={{ maxWidth: 320 }}
              placeholder={t.settings.priceAddModel}
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
            />
            <button className="btn-new" onClick={() => addPriceRow(newModel)}>
              {t.settings.priceAdd}
            </button>
          </div>

          <div className="policy-note">{t.settings.priceCacheNote}</div>
          <div className="save-row">
            <button className="btn-new" disabled={pending} onClick={savePrices}>
              {pending ? t.settings.saving : t.settings.savePrices}
            </button>
          </div>
        </div>

        {/* ---- USAGE RECIPES ---- */}
        <div className={`tabpane${tab === "recipes" ? " active" : ""}`}>
          <p className="page-sub">{t.settings.recipesSub}</p>
          {recipeRows.map((row, i) => (
            <div key={row.cli} className="seen-sugg">
              <div className="sec-cap">
                {row.label}
                <span className="dim">
                  {" · "}
                  {row.command.trim()
                    ? t.settings.recipeYieldsTokens
                    : t.settings.recipeYieldsNone}
                  {" · "}
                  {row.source === "seed"
                    ? t.settings.recipeShipped
                    : `${t.settings.recipeEdited}${row.updatedBy ? ` — ${row.updatedBy}` : ""}`}
                </span>
              </div>
              <label className="lbl">{t.settings.recipeInstructions}</label>
              <textarea
                className="input"
                rows={3}
                value={row.instructions}
                onChange={(e) => setRecipe(i, { instructions: e.target.value })}
              />
              <label className="lbl">{t.settings.recipeCommand}</label>
              <textarea
                className="input d-mono"
                rows={row.command ? 12 : 2}
                placeholder={t.settings.recipeNoCommand}
                value={row.command}
                onChange={(e) => setRecipe(i, { command: e.target.value })}
              />
            </div>
          ))}
          <div className="gen-row">
            <button className="btn-new" disabled={pending} onClick={saveRecipes}>
              {pending ? t.settings.saving : t.settings.saveRecipes}
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
                    <div className="label">
                      {tok.label}
                      {tok.canManage ? (
                        <span className="tok-cap">{t.settings.manageBadge}</span>
                      ) : null}
                    </div>
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
              <div className="cmd">{buildMcpConnectCommand({
                client: mcpClientFromExecutorId(connectClient),
                baseUrl: `http://${host}/mcp`,
                token: fresh.secret,
              })}
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
            <button className="btn-new" disabled={pending} onClick={genPair}>
              {pending ? t.wizard.generating : t.settings.generatePairBtn}
            </button>
            <button className="btn-new" disabled={pending} onClick={genToken}>
              {pending ? t.wizard.generating : t.settings.generateTokenBtn}
            </button>
          </div>

          <label className="upd-toggle">
            <input
              type="checkbox"
              checked={newCanManage}
              onChange={(e) => setNewCanManage(e.target.checked)}
            />
            <span>{t.settings.manageLabel}</span>
          </label>
          <div className="policy-note" style={{ borderTop: 0, paddingTop: 8 }}>
            {t.settings.manageNote}
          </div>

          {pairFresh ? (
            <div className="fresh-tok">
              <div className="lbl">{t.settings.freshPair}</div>
              <div className="pair-code">{pairFresh.code}</div>
              <div className="cmd">{pairCmd}
                <button className={`copy${pairCopied ? " ok" : ""}`} onClick={copyPair}>
                  {pairCopied ? t.wizard.copied : t.wizard.copy}
                </button>
              </div>
              <div className="policy-note" style={{ borderTop: 0, paddingTop: 8 }}>
                {t.settings.pairNote}
              </div>
            </div>
          ) : null}

          <div className="sec-cap">{t.settings.connectAgent}</div>
          <div className="settabs compact">
            {CONNECT_CLIENTS.map((client) => (
              <span
                key={client.id}
                className={connectClient === client.id ? "on" : ""}
                onClick={() => setConnectClient(client.id)}
              >
                {client.label}
              </span>
            ))}
          </div>
          <div className="cmd">
            {maskedCommand}
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
          <UpdatePanel
            version={version}
            runtime={runtime}
            enableCommand={enableCommand}
            manualCommand={manualCommand}
            sourceCommand={sourceCommand}
            initialState={updater}
            lang={lang}
          />
        </div>
      </div>
    </>
  );
}
