"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  reopenTaskAction,
  tickValidationStepAction,
  validateTaskAction,
} from "../../actions/review";

export type ConfirmStep = { step: string; expected: string };
export type ValidationTickView = { index: number; byEmail: string; at: string };

export type BoardCard = {
  id: string;
  shortId: string;
  title: string;
  tipo: "feature" | "bug" | "rfc";
  status: "aberto" | "em_execucao" | "feito" | "validado";
  isExample: boolean;
  oQue: string;
  porQue: string;
  comoConfirmo: ConfirmStep[];
  validationTicks: ValidationTickView[];
  howToVerify: string | null;
  mission: string | null;
  harness: string | null;
  devolve: string;
  origem: string;
  executor: string | null;
  elapsed: string | null;
  branch: string | null;
  telemetry: string | null;
  handoff: string | null;
};

const COLUMNS = [
  { status: "aberto", label: "Open" },
  { status: "em_execucao", label: "In progress" },
  { status: "feito", label: "Done · review" },
  { status: "validado", label: "Validated" },
] as const;

type ColumnStatus = (typeof COLUMNS)[number]["status"];

const STATUS_LABEL: Record<ColumnStatus, string> = {
  aberto: "open",
  em_execucao: "in progress",
  feito: "done · review",
  validado: "validated",
};

const STATUS_CHIP: Record<ColumnStatus, string> = {
  aberto: "",
  em_execucao: "exec",
  feito: "feito",
  validado: "ok",
};

/** Empty-state microcopy (briefing §4.2). */
function EmptyState({ status }: { status: ColumnStatus }) {
  if (status === "aberto") {
    return (
      <div className="empty-col">
        Nothing queued. Create a card or tell your agent: <i>register this as a task</i>.
      </div>
    );
  }
  if (status === "em_execucao") {
    return <div className="empty-col">No agent working right now.</div>;
  }
  if (status === "feito") {
    return (
      <div className="empty-col">
        This is where the agent&apos;s work lands, with evidence and cost.
      </div>
    );
  }
  return (
    <div className="empty-col">
      What passed your review. Only you stamp this column.
    </div>
  );
}

function Telemetry({ text }: { text: string }) {
  // highlighted numbers, as in the mockup (bold on duration and cost)
  const parts = text.split(" · ");
  return (
    <span className="telemetry">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? " · " : ""}
          {p.includes("tok") ? p : <b>{p}</b>}
        </span>
      ))}
    </span>
  );
}

function Card({ card, corner, onOpen }: { card: BoardCard; corner: boolean; onOpen: (c: BoardCard) => void }) {
  const dim = card.status === "validado";
  return (
    <div
      className={`card nebula-glass${corner ? " nebula-corners" : ""}${dim ? " dim" : ""}`}
      onClick={() => onOpen(card)}
    >
      <div className="id-row">
        <span className="cid">{card.shortId}</span>
        <span className={`tag ${card.tipo}`}>{card.tipo}</span>
        {card.isExample ? <span className="selo">EXAMPLE</span> : null}
        {card.status === "feito" ? <span className="review-chip">awaiting review</span> : null}
      </div>
      <h4>{card.title}</h4>
      {card.mission ? <div className="mission">{card.mission}</div> : null}
      {card.harness ? <div className="harness">{card.harness}</div> : null}
      <div className="card-foot">
        {card.status === "aberto" ? (
          <span className="telemetry">
            returns → <b>{card.devolve}</b>
          </span>
        ) : null}
        {card.status === "em_execucao" ? (
          <>
            <div className="exec-pulse">
              <span className="dot-exec" /> {card.executor ?? "agent"}
              {card.elapsed ? ` · ${card.elapsed}` : ""}
            </div>
            {card.branch ? <span className="telemetry">{card.branch}</span> : null}
          </>
        ) : null}
        {card.status === "feito" || card.status === "validado" ? (
          card.telemetry ? <Telemetry text={card.telemetry} /> : <span className="telemetry">no telemetry</span>
        ) : null}
      </div>
    </div>
  );
}

function fmtTickWhen(at: string): string {
  const d = new Date(at);
  return d.toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The How-to-confirm contract. Read-only list before delivery; on a done card
 * each step is a checkbox the reviewer ticks while following the script.
 */
function ConfirmChecklist({
  card,
  ticks,
  onToggle,
  disabled,
}: {
  card: BoardCard;
  ticks: ValidationTickView[];
  onToggle?: (index: number, checked: boolean) => void;
  disabled?: boolean;
}) {
  const interactive = Boolean(onToggle);
  const showTicks = card.status === "feito" || card.status === "validado";
  return (
    <div className="d-checklist">
      {card.comoConfirmo.map((step, index) => {
        const tick = showTicks ? ticks.find((t) => t.index === index) : undefined;
        return (
          <label
            key={index}
            className={`d-check-row${tick ? " ticked" : ""}${interactive ? " interactive" : ""}`}
          >
            {showTicks ? (
              <input
                type="checkbox"
                checked={Boolean(tick)}
                disabled={!interactive || disabled}
                onChange={(e) => onToggle?.(index, e.target.checked)}
              />
            ) : (
              <span className="d-check-num">{index + 1}</span>
            )}
            <span className="d-check-body">
              <span className="d-check-step">{step.step}</span>
              <span className="d-check-expected">expected: {step.expected}</span>
              {tick ? (
                <span className="d-check-meta">
                  checked by {tick.byEmail} · {fmtTickWhen(tick.at)}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** "For checking, open..." — the agent's entry point for lay validation. */
function HowToVerify({ value }: { value: string }) {
  const isUrl = /^https?:\/\//.test(value.trim());
  return (
    <div className="d-verify">
      <span className="d-verify-lbl">For checking, open</span>
      {isUrl ? (
        <a href={value} target="_blank" rel="noreferrer" className="d-verify-value">
          {value}
        </a>
      ) : (
        <span className="d-verify-value d-mono">{value}</span>
      )}
    </div>
  );
}

function DetailActions({
  card,
  allTicked,
  onClose,
}: {
  card: BoardCard;
  allTicked: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reopening, setReopening] = useState(false);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (card.status !== "feito") return null;

  const validate = (override: boolean) =>
    start(async () => {
      setErr(null);
      const r = await validateTaskAction(card.id, { override });
      if (!r.ok) setErr(r.error);
      else {
        onClose();
        router.refresh();
      }
    });

  const reopen = () =>
    start(async () => {
      setErr(null);
      const r = await reopenTaskAction(card.id, comment);
      if (!r.ok) setErr(r.error);
      else {
        onClose();
        router.refresh();
      }
    });

  if (reopening) {
    return (
      <div className="d-actions d-actions-reopen">
        <textarea
          className="d-textarea"
          autoFocus
          rows={3}
          placeholder="What's missing? The agent reads this comment on its next claim."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {err ? <p className="d-err">{err}</p> : null}
        <div className="d-actions-row">
          <button className="d-btn-sec" disabled={pending} onClick={() => { setReopening(false); setErr(null); }}>
            Cancel
          </button>
          <button className="d-btn-pri" disabled={pending || !comment.trim()} onClick={reopen}>
            {pending ? "Reopening…" : "Reopen"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="d-actions">
      {err ? <p className="d-err">{err}</p> : null}
      <div className="d-actions-row">
        {!allTicked ? (
          <button
            className="d-btn-ghost"
            disabled={pending}
            onClick={() => validate(true)}
            title="Skips the checklist. The ticks stay as they are."
          >
            validate anyway
          </button>
        ) : null}
        <button className="d-btn-sec" disabled={pending} onClick={() => setReopening(true)}>
          Reopen with a comment
        </button>
        <button
          className="d-btn-pri"
          disabled={pending || !allTicked}
          title={allTicked ? undefined : "Check every step of How to confirm first."}
          onClick={() => validate(false)}
        >
          {pending ? "Validating…" : "Validate"}
        </button>
      </div>
    </div>
  );
}

function Detail({ card, onClose }: { card: BoardCard; onClose: () => void }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [ticks, setTicks] = useState<ValidationTickView[]>(card.validationTicks);
  const [tickErr, setTickErr] = useState<string | null>(null);

  const reviewing = card.status === "feito";
  const allTicked = card.comoConfirmo.every((_, index) =>
    ticks.some((t) => t.index === index),
  );

  const toggleTick = (index: number, checked: boolean) => {
    const previous = ticks;
    setTickErr(null);
    // Optimistic: the server records the real who/when on refresh.
    setTicks(
      checked
        ? [
            ...previous.filter((t) => t.index !== index),
            { index, byEmail: "you", at: new Date().toISOString() },
          ]
        : previous.filter((t) => t.index !== index),
    );
    start(async () => {
      const r = await tickValidationStepAction(card.id, index, checked);
      if (!r.ok) {
        setTicks(previous);
        setTickErr(r.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="detail nebula-glass nebula-corners">
        <button className="d-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="d-head">
          <span>{card.shortId}</span>
          <span className={`tag ${card.tipo}`}>{card.tipo}</span>
          <span className={`d-status ${STATUS_CHIP[card.status]}`}>{STATUS_LABEL[card.status]}</span>
        </div>
        <h3>{card.title}</h3>
        <div className="d-sec">
          <div className="lbl">What</div>
          <p>{card.oQue}</p>
        </div>
        <div className="d-sec">
          <div className="lbl">Why</div>
          <p>{card.porQue}</p>
        </div>
        <div className="d-sec">
          <div className="lbl">{reviewing ? "Validation · How to confirm" : "How to confirm"}</div>
          {reviewing && card.howToVerify ? <HowToVerify value={card.howToVerify} /> : null}
          {card.comoConfirmo.length === 0 ? (
            <p>—</p>
          ) : (
            <ConfirmChecklist
              card={card}
              ticks={ticks}
              onToggle={reviewing ? toggleTick : undefined}
            />
          )}
          {tickErr ? <p className="d-err">{tickErr}</p> : null}
        </div>
        <div className="d-sec d-grid">
          <div>
            <div className="lbl">Mission</div>
            <p>{card.mission ?? "—"}</p>
          </div>
          <div>
            <div className="lbl">Harness</div>
            <p className="d-mono">{card.harness ?? "—"}</p>
          </div>
        </div>
        <div className="d-sec">
          <div className="lbl">Roles</div>
          <div className="d-roles">
            <span className="rl">origin <b>{card.origem}</b></span>
            <span className="rl">executor <b>{card.executor ?? "—"}</b></span>
            <span className="rl">returns to <b>{card.devolve}</b></span>
          </div>
        </div>
        <div className="d-sec d-grid">
          <div>
            <div className="lbl">Branch</div>
            <p className="d-mono">{card.branch ?? "—"}</p>
          </div>
          {card.telemetry ? (
            <div>
              <div className="lbl">Telemetry</div>
              <p className="d-tel">{card.telemetry}</p>
            </div>
          ) : null}
        </div>
        {card.handoff ? (
          <div className="d-sec">
            <div className="lbl">Agent handoff</div>
            <div className="d-evid">{card.handoff}</div>
          </div>
        ) : null}
        <DetailActions card={card} allTicked={allTicked} onClose={onClose} />
      </div>
    </div>
  );
}

export function Board({ cards }: { cards: BoardCard[] }) {
  const [open, setOpen] = useState<BoardCard | null>(null);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(null);
  }, []);
  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKey]);

  return (
    <>
      <div className="board">
        {COLUMNS.map((col) => {
          const list = cards.filter((c) => c.status === col.status);
          return (
            <div key={col.status}>
              <div className="col-head">
                {col.label} <span className="count">{list.length}</span>
              </div>
              <div className="col">
                {list.length === 0 ? (
                  <EmptyState status={col.status} />
                ) : (
                  list.map((card, i) => (
                    <Card
                      key={card.id}
                      card={card}
                      corner={col.status === "em_execucao" && i === 0}
                      onOpen={setOpen}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      {open ? <Detail card={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
