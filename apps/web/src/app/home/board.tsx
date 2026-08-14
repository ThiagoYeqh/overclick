"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState, useTransition } from "react";
import { reopenTaskAction, validateTaskAction } from "../../actions/review";
import { createBoardTaskAction } from "../../actions/tasks";

export type BoardCard = {
  id: string;
  shortId: string;
  title: string;
  tipo: "feature" | "bug" | "rfc";
  status: "aberto" | "em_execucao" | "feito" | "validado";
  isExample: boolean;
  oQue: string;
  porQue: string;
  comoConfirmo: string;
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

function DetailActions({ card, onClose }: { card: BoardCard; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reopening, setReopening] = useState(false);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);

  if (card.status !== "feito") return null;

  const validate = () =>
    start(async () => {
      setErr(null);
      const r = await validateTaskAction(card.id);
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
        <button className="d-btn-sec" disabled={pending} onClick={() => setReopening(true)}>
          Reopen with a comment
        </button>
        <button className="d-btn-pri" disabled={pending} onClick={validate}>
          {pending ? "Validating…" : "Validate"}
        </button>
      </div>
    </div>
  );
}

function Detail({ card, onClose }: { card: BoardCard; onClose: () => void }) {
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
          <div className="lbl">How to confirm</div>
          <p>{card.comoConfirmo}</p>
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
        <DetailActions card={card} onClose={onClose} />
      </div>
    </div>
  );
}

function CreateCardModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));

    start(async () => {
      setErr(null);
      const result = await createBoardTaskAction(input);
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      form.reset();
      onClose();
      router.refresh();
    });
  };

  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="detail create-detail nebula-glass nebula-corners">
        <button className="d-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="d-head">
          <span>NEW CARD</span>
          <span className="d-status">contract</span>
        </div>
        <h3>Create a card</h3>
        <p className="create-sub">
          Write the contract before the agent starts: what changes, why it matters, and how a human confirms it.
        </p>
        <form className="create-form" onSubmit={submit}>
          <div className="field">
            <label>Title</label>
            <input className="input" name="title" maxLength={200} autoFocus required />
          </div>
          <div className="create-grid">
            <div className="field">
              <label>Type</label>
              <select className="input" name="type" defaultValue="feature">
                <option value="feature">Feature</option>
                <option value="bug">Bug</option>
                <option value="rfc">RFC</option>
              </select>
            </div>
            <div className="field">
              <label>Priority</label>
              <select className="input" name="priority" defaultValue="media">
                <option value="urgente">Urgent</option>
                <option value="alta">High</option>
                <option value="media">Medium</option>
                <option value="baixa">Low</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>What</label>
            <textarea className="input create-textarea" name="what" rows={3} required />
          </div>
          <div className="field">
            <label>Why</label>
            <textarea className="input create-textarea" name="why" rows={3} required />
          </div>
          <div className="field">
            <label>How to confirm</label>
            <textarea className="input create-textarea" name="howToConfirm" rows={3} required />
          </div>
          {err ? <p className="d-err">{err}</p> : null}
          <div className="d-actions-row create-actions">
            <button className="d-btn-sec" type="button" disabled={pending} onClick={onClose}>
              Cancel
            </button>
            <button className="d-btn-pri" type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create card"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Board({ cards }: { cards: BoardCard[] }) {
  const [open, setOpen] = useState<BoardCard | null>(null);
  const [creating, setCreating] = useState(false);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(null);
      setCreating(false);
    }
  }, []);
  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKey]);

  return (
    <>
      <div className="board-tools">
        <div>
          <div className="board-tools-title">Cards</div>
          <div className="board-tools-sub">Create contracts for agents, then validate the result.</div>
        </div>
        <button className="btn-new" type="button" onClick={() => setCreating(true)}>
          + New card
        </button>
      </div>
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
      {creating ? <CreateCardModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}
