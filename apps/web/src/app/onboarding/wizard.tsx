"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveExecutorsAction } from "../../actions/executors";
import { saveProjectAction } from "../../actions/onboarding";
import { createTokenAction, pollTokenAction } from "../../actions/tokens";
import { NebulaAtmosphere } from "../../components/nebula-atmosphere";
import {
  ExecutorsGrid,
  type ExecutorSelection,
} from "../../components/executors-grid";

type ProjectData = {
  name: string;
  repoUrl: string;
  prefix: string;
  nextNumber: number;
};

const CMD_TABS = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "gemini-cli", label: "Gemini" },
  { id: "outro", label: "Other" },
] as const;

function commandFor(cli: string, baseUrl: string, secret: string): string {
  const header = `--header "Authorization: Bearer ${secret}"`;
  switch (cli) {
    case "claude-code":
      return `claude mcp add --transport http overclick \\\n  ${baseUrl} \\\n  ${header}`;
    case "codex":
      return `codex mcp add overclick --url ${baseUrl} \\\n  ${header}`;
    case "gemini-cli":
      return `gemini mcp add --transport http overclick ${baseUrl} \\\n  ${header}`;
    default:
      return `# generic MCP over HTTP\n# url:    ${baseUrl}\n# header: Authorization: Bearer ${secret}`;
  }
}

export function Wizard({
  host,
  initialStep,
  project,
  executors,
}: {
  host: string;
  initialStep: number;
  project: ProjectData | null;
  executors: ExecutorSelection;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // ---- T1
  const [name, setName] = useState(project?.name ?? "");
  const [repo, setRepo] = useState(project?.repoUrl ?? "");
  const [prefix, setPrefix] = useState(project?.prefix ?? "");
  const [prefixTouched, setPrefixTouched] = useState(Boolean(project));
  const nextNumber = project?.nextNumber ?? 1;

  const derivePrefix = (n: string) => {
    const words = n.trim().split(/\s+/).filter(Boolean);
    let p = words.map((w) => w[0]).join("").toUpperCase().slice(0, 3);
    if (p.length < 2) p = n.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
    return p;
  };

  // ---- T2
  const [sel, setSel] = useState<ExecutorSelection>(executors);
  const execCount = Object.keys(sel.enabled).length + (sel.customEnabled ? 1 : 0);

  // ---- T3
  const [label, setLabel] = useState("Claude Code on this machine");
  const [tab, setTab] = useState<string>("claude-code");
  const [token, setToken] = useState<{ id: string; secret: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connected, setConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const baseUrl = `http://${host}/mcp`;

  useEffect(() => {
    if (!token || connected) return;
    let stopped = false;
    const check = async () => {
      if (stopped) return;
      const r = await pollTokenAction(token.id);
      if (r.used && !stopped) setConnected(true);
    };
    // This step asks the user to leave and paste the command in a terminal;
    // with the tab in the background Chrome throttles setInterval (down to
    // 1x/min). We check again as soon as they come back, so the indicator is
    // already lit when they look.
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    void check();
    pollRef.current = setInterval(check, 2000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [token, connected]);

  const goNext = () =>
    start(async () => {
      setErr(null);
      if (step === 1) {
        const r = await saveProjectAction({ name, repoUrl: repo, prefix });
        if (!r.ok) return setErr(r.error);
        setStep(2);
      } else if (step === 2) {
        if (execCount === 0) {
          return setErr("Check at least one CLI. Without an executor the board goes nowhere.");
        }
        const r = await saveExecutorsAction(sel);
        if (!r.ok) return setErr(r.error);
        setStep(3);
      } else {
        router.push("/home");
      }
    });

  const genToken = () =>
    start(async () => {
      setErr(null);
      const r = await createTokenAction(label);
      if (!r.ok) return setErr(r.error);
      setToken({ id: r.id, secret: r.secret });
    });

  const copyCmd = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(commandFor(tab, baseUrl, token.secret));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable; the text stays selectable */
    }
  };

  const maskedSecret = token
    ? revealed
      ? token.secret
      : `${token.secret.slice(0, 7)}${"•".repeat(12)}`
    : `ocb_${"•".repeat(12)}`;

  return (
    <>
      <NebulaAtmosphere />
      <div className="stage">
        <div className="panel wizard">
          <div className="steps-ind">
            <span className={step === 1 ? "cur" : step > 1 ? "done" : ""}>01 · project</span>
            <span className={step === 2 ? "cur" : step > 2 ? "done" : ""}>02 · executors</span>
            <span className={step === 3 ? "cur" : ""}>03 · agent</span>
          </div>

          {/* T1: project */}
          <div className={`wstep${step === 1 ? " active" : ""}`}>
            <h2>First, which project are you working on?</h2>
            <p className="sub">One project ↔ one repository. You can create more later.</p>
            <div className="grid2">
              <div className="field">
                <label>Project name</label>
                <input
                  className="input"
                  value={name}
                  placeholder="Agent Board"
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!prefixTouched) setPrefix(derivePrefix(e.target.value));
                  }}
                />
              </div>
              <div className="field">
                <label>
                  Repository URL <span className="opt">optional</span>
                </label>
                <input
                  className="input mono"
                  value={repo}
                  placeholder="github.com/you/repo"
                  onChange={(e) => setRepo(e.target.value)}
                />
              </div>
            </div>
            <div className="field" style={{ maxWidth: 180 }}>
              <label>ID prefix</label>
              <input
                className="input mono"
                value={prefix}
                maxLength={4}
                placeholder="AGB"
                style={{ textTransform: "uppercase" }}
                onChange={(e) => {
                  setPrefixTouched(true);
                  setPrefix(e.target.value.toUpperCase());
                }}
              />
            </div>
            <div className={`preview${prefix.length >= 2 ? "" : " ghost"}`}>
              <span className="cap">this project&apos;s convention</span>
              Your cards will be named <b>{prefix || "…"}-{nextNumber}</b>,{" "}
              <b>{prefix || "…"}-{nextNumber + 1}</b>… and branches,{" "}
              <b>{(prefix || "…").toLowerCase()}-{nextNumber}-card-name</b>.
            </div>
          </div>

          {/* T2: executors */}
          <div className={`wstep${step === 2 ? " active" : ""}`}>
            <h2>Who runs the cards?</h2>
            <p className="sub">Check the CLIs your team already uses. You can change this later in Settings.</p>
            <ExecutorsGrid value={sel} onChange={setSel} />
            <div className="hint">
              <b>With no executor checked, the board is just a pretty wall.</b> A
              connected agent is what moves cards.
            </div>
          </div>

          {/* T3: connect the agent */}
          <div className={`wstep${step === 3 ? " active" : ""}`}>
            <h2>Now connect your agent.</h2>
            <p className="sub">One command in your terminal and the board stops being a wall and becomes a work contract.</p>
            <div className="field" style={{ maxWidth: 420 }}>
              <label>Token name</label>
              <input
                className="input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={Boolean(token)}
              />
            </div>
            {!token ? (
              <button className="btn-next" style={{ marginBottom: 18 }} disabled={pending} onClick={genToken}>
                {pending ? "Generating…" : "Generate token"}
              </button>
            ) : (
              <>
                <div className="tabs">
                  {CMD_TABS.map((t) => (
                    <span
                      key={t.id}
                      className={tab === t.id ? "on" : ""}
                      onClick={() => setTab(t.id)}
                    >
                      {t.label}
                    </span>
                  ))}
                </div>
                <div className="cmd">
                  {commandFor(tab, baseUrl, revealed ? token.secret : maskedSecret)}
                  <button className={`copy${copied ? " ok" : ""}`} onClick={copyCmd}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="tok-note">
                  the token is shown only once · store it in your secrets manager ·{" "}
                  <span className="reveal" onClick={() => setRevealed(!revealed)}>
                    {revealed ? "hide" : "reveal"}
                  </span>
                </div>
                <div className={`conn${connected ? " lit" : ""}`}>
                  <div className="l1">
                    <span className={`pip${connected ? " green" : ""}`} />
                    <span>{connected ? "Agent connected." : "Waiting for the first connection…"}</span>
                  </div>
                  <div className="l2">
                    {connected
                      ? `${label} · just now`
                      : "Paste the command in your terminal. I'll keep watch."}
                  </div>
                  <div className="cap">{connected ? "FIRST CALL ✓" : "POLLING · 2s ⟳"}</div>
                </div>
              </>
            )}
          </div>

          {err ? <p className="werr">{err}</p> : null}

          <div className="wfoot">
            <div className="progress">
              <i style={{ width: `${step * 33}%` }} />
            </div>
            <div className="wbtns">
              <button className="btn-back" disabled={step === 1 || pending} onClick={() => setStep(step - 1)}>
                ‹ Back
              </button>
              <div>
                {step === 3 ? (
                  <span className="skip" onClick={() => router.push("/home")}>
                    Configure later
                  </span>
                ) : null}
                <button
                  className={`btn-next${connected ? " go" : ""}`}
                  disabled={pending || (step === 3 && !connected)}
                  onClick={goNext}
                >
                  {step === 3 ? (connected ? "See my board ›" : "Finish") : "Next ›"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
