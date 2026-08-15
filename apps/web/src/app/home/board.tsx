"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  reopenTaskAction,
  tickValidationStepAction,
  validateTaskAction,
} from "../../actions/review";
import { dict, type Dict } from "../../lib/i18n";

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

const COLUMN_STATUSES = ["aberto", "em_execucao", "feito", "validado"] as const;

type ColumnStatus = (typeof COLUMN_STATUSES)[number];

function columnLabels(t: Dict): Record<ColumnStatus, string> {
  return {
    aberto: t.board.colOpen,
    em_execucao: t.board.colInProgress,
    feito: t.board.colDone,
    validado: t.board.colValidated,
  };
}

function statusLabels(t: Dict): Record<ColumnStatus, string> {
  return {
    aberto: t.board.statusOpen,
    em_execucao: t.board.statusInProgress,
    feito: t.board.statusDone,
    validado: t.board.statusValidated,
  };
}

const STATUS_CHIP: Record<ColumnStatus, string> = {
  aberto: "",
  em_execucao: "exec",
  feito: "feito",
  validado: "ok",
};

/** Empty-state microcopy (briefing §4.2). */
function EmptyState({ status, t }: { status: ColumnStatus; t: Dict }) {
  if (status === "aberto") {
    return (
      <div className="empty-col">
        {t.board.emptyOpenBefore}
        <i>{t.board.emptyOpenCmd}</i>
        {t.board.emptyOpenAfter}
      </div>
    );
  }
  if (status === "em_execucao") {
    return <div className="empty-col">{t.board.emptyInProgress}</div>;
  }
  if (status === "feito") {
    return <div className="empty-col">{t.board.emptyDone}</div>;
  }
  return <div className="empty-col">{t.board.emptyValidated}</div>;
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

function Card({
  card,
  onOpen,
  t,
}: {
  card: BoardCard;
  onOpen: (c: BoardCard) => void;
  t: Dict;
}) {
  const exec = card.status === "em_execucao";
  const dim = card.status === "validado";
  return (
    <div
      className={`card nebula-glass${exec ? " exec nebula-corners" : ""}${dim ? " dim" : ""}`}
      onClick={() => onOpen(card)}
    >
      <div className="id-row">
        <span className="cid">{card.shortId}</span>
        <span className={`tag ${card.tipo}`}>{card.tipo}</span>
        {card.isExample ? <span className="selo">{t.board.example}</span> : null}
        {card.status === "feito" ? (
          <span className="review-chip">{t.board.awaitingReview}</span>
        ) : null}
      </div>
      <h4>{card.title}</h4>
      {card.mission ? <div className="mission">{card.mission}</div> : null}
      {card.harness ? <div className="harness">{card.harness}</div> : null}
      <div className="card-foot">
        {card.status === "aberto" ? (
          <span className="telemetry">
            {t.board.returnsTo} <b>{card.devolve}</b>
          </span>
        ) : null}
        {card.status === "em_execucao" ? (
          <>
            <div className="exec-pulse">
              <span className="dot-exec" /> {card.executor ?? t.board.agent}
              {card.elapsed ? ` · ${card.elapsed}` : ""}
            </div>
            {card.branch ? <span className="telemetry">{card.branch}</span> : null}
          </>
        ) : null}
        {card.status === "feito" || card.status === "validado" ? (
          card.telemetry ? (
            <Telemetry text={card.telemetry} />
          ) : (
            // Never a bare "no telemetry" on a delivered card: without any
            // numbers the honest label is that usage went unreported.
            <span className="telemetry">{t.board.usageNotReported}</span>
          )
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
  t,
}: {
  card: BoardCard;
  ticks: ValidationTickView[];
  onToggle?: (index: number, checked: boolean) => void;
  disabled?: boolean;
  t: Dict;
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
              <span className="d-check-expected">
                {t.detail.expected} {step.expected}
              </span>
              {tick ? (
                <span className="d-check-meta">
                  {t.detail.checkedBy} {tick.byEmail} · {fmtTickWhen(tick.at)}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** "For checking, open...": the agent's entry point for lay validation. */
function HowToVerify({ value, t }: { value: string; t: Dict }) {
  const isUrl = /^https?:\/\//.test(value.trim());
  return (
    <div className="d-verify">
      <span className="d-verify-lbl">{t.detail.forCheckingOpen}</span>
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
  t,
}: {
  card: BoardCard;
  allTicked: boolean;
  onClose: () => void;
  t: Dict;
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
          placeholder={t.detail.reopenPlaceholder}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {err ? <p className="d-err">{err}</p> : null}
        <div className="d-actions-row">
          <button className="d-btn-sec" disabled={pending} onClick={() => { setReopening(false); setErr(null); }}>
            {t.detail.cancel}
          </button>
          <button className="d-btn-pri" disabled={pending || !comment.trim()} onClick={reopen}>
            {pending ? t.detail.reopening : t.detail.reopen}
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
            title={t.detail.validateAnywayTitle}
          >
            {t.detail.validateAnyway}
          </button>
        ) : null}
        <button className="d-btn-sec" disabled={pending} onClick={() => setReopening(true)}>
          {t.detail.reopenWithComment}
        </button>
        <button
          className="d-btn-pri"
          disabled={pending || !allTicked}
          title={allTicked ? undefined : t.detail.validateDisabledTitle}
          onClick={() => validate(false)}
        >
          {pending ? t.detail.validating : t.detail.validate}
        </button>
      </div>
    </div>
  );
}

function Detail({ card, onClose, t }: { card: BoardCard; onClose: () => void; t: Dict }) {
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
          <span className={`d-status ${STATUS_CHIP[card.status]}`}>
            {statusLabels(t)[card.status]}
          </span>
        </div>
        <h3>{card.title}</h3>
        <div className="d-sec">
          <div className="lbl">{t.detail.what}</div>
          <p>{card.oQue}</p>
        </div>
        <div className="d-sec">
          <div className="lbl">{t.detail.why}</div>
          <p>{card.porQue}</p>
        </div>
        <div className={`d-sec${reviewing ? " d-sec-validate" : ""}`}>
          <div className="lbl">
            <span>
              {reviewing ? t.detail.validationHowToConfirm : t.detail.howToConfirm}
            </span>
            {(card.status === "feito" || card.status === "validado") &&
            card.comoConfirmo.length > 0 ? (
              <span className={`d-progress${allTicked ? " done" : ""}`}>
                {ticks.length}/{card.comoConfirmo.length}
              </span>
            ) : null}
          </div>
          {reviewing && card.howToVerify ? <HowToVerify value={card.howToVerify} t={t} /> : null}
          {card.comoConfirmo.length === 0 ? (
            <p>—</p>
          ) : (
            <ConfirmChecklist
              card={card}
              ticks={ticks}
              onToggle={reviewing ? toggleTick : undefined}
              t={t}
            />
          )}
          {tickErr ? <p className="d-err">{tickErr}</p> : null}
        </div>
        <div className="d-sec d-grid">
          <div>
            <div className="lbl">{t.detail.mission}</div>
            <p>{card.mission ?? "—"}</p>
          </div>
          <div>
            <div className="lbl">{t.detail.harness}</div>
            <p className="d-mono">{card.harness ?? "—"}</p>
          </div>
        </div>
        <div className="d-sec">
          <div className="lbl">{t.detail.roles}</div>
          <div className="d-roles">
            <span className="rl">{t.detail.origin} <b>{card.origem}</b></span>
            <span className="rl">{t.detail.executor} <b>{card.executor ?? "—"}</b></span>
            <span className="rl">{t.board.returnsTo} <b>{card.devolve}</b></span>
          </div>
        </div>
        <div className="d-sec d-grid">
          <div>
            <div className="lbl">{t.detail.branch}</div>
            <p className="d-mono">{card.branch ?? "—"}</p>
          </div>
          {card.telemetry ? (
            <div>
              <div className="lbl">{t.detail.telemetry}</div>
              <p className="d-tel">{card.telemetry}</p>
            </div>
          ) : null}
        </div>
        {card.handoff ? (
          <div className="d-sec">
            <div className="lbl">{t.detail.agentHandoff}</div>
            <div className="d-evid">{card.handoff}</div>
          </div>
        ) : null}
        <DetailActions card={card} allTicked={allTicked} onClose={onClose} t={t} />
      </div>
    </div>
  );
}

export function Board({ cards, lang }: { cards: BoardCard[]; lang: string }) {
  const t = dict(lang);
  const colLabel = columnLabels(t);
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
        {COLUMN_STATUSES.map((status) => {
          const list = cards.filter((c) => c.status === status);
          return (
            <div key={status}>
              <div className="col-head">
                {colLabel[status]} <span className="count">{list.length}</span>
              </div>
              <div className="col">
                {list.length === 0 ? (
                  <EmptyState status={status} t={t} />
                ) : (
                  list.map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      onOpen={setOpen}
                      t={t}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      {open ? <Detail card={open} onClose={() => setOpen(null)} t={t} /> : null}
    </>
  );
}
