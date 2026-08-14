"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { reopenTaskAction, validateTaskAction } from "../../actions/review";

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
  { status: "aberto", label: "Aberto" },
  { status: "em_execucao", label: "Em execução" },
  { status: "feito", label: "Feito · revisão" },
  { status: "validado", label: "Validado" },
] as const;

type ColumnStatus = (typeof COLUMNS)[number]["status"];

const STATUS_LABEL: Record<ColumnStatus, string> = {
  aberto: "aberto",
  em_execucao: "em execução",
  feito: "feito · revisão",
  validado: "validado",
};

const STATUS_CHIP: Record<ColumnStatus, string> = {
  aberto: "",
  em_execucao: "exec",
  feito: "feito",
  validado: "ok",
};

/** Microcopy dos estados vazios — briefing §4.2. */
function EmptyState({ status }: { status: ColumnStatus }) {
  if (status === "aberto") {
    return (
      <div className="empty-col">
        Nada na fila. Crie um card ou peça ao agente: <i>registra isso como task</i>.
      </div>
    );
  }
  if (status === "em_execucao") {
    return <div className="empty-col">Nenhum agente trabalhando agora.</div>;
  }
  if (status === "feito") {
    return (
      <div className="empty-col">
        Aqui chega o que o agente entregou — com evidência e custo.
      </div>
    );
  }
  return (
    <div className="empty-col">
      O que passou pelo seu olho. Só você carimba aqui.
    </div>
  );
}

function Telemetry({ text }: { text: string }) {
  // números em destaque, como no mockup (b em duração e custo)
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
        {card.isExample ? <span className="selo">EXEMPLO</span> : null}
        {card.status === "feito" ? <span className="review-chip">aguarda revisão</span> : null}
      </div>
      <h4>{card.title}</h4>
      {card.mission ? <div className="mission">{card.mission}</div> : null}
      {card.harness ? <div className="harness">{card.harness}</div> : null}
      <div className="card-foot">
        {card.status === "aberto" ? (
          <span className="telemetry">
            devolve → <b>{card.devolve}</b>
          </span>
        ) : null}
        {card.status === "em_execucao" ? (
          <>
            <div className="exec-pulse">
              <span className="dot-exec" /> {card.executor ?? "agente"}
              {card.elapsed ? ` · ${card.elapsed}` : ""}
            </div>
            {card.branch ? <span className="telemetry">{card.branch}</span> : null}
          </>
        ) : null}
        {card.status === "feito" || card.status === "validado" ? (
          card.telemetry ? <Telemetry text={card.telemetry} /> : <span className="telemetry">sem telemetria</span>
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
          placeholder="O que ficou faltando? O agente lê este comentário no próximo claim."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {err ? <p className="d-err">{err}</p> : null}
        <div className="d-actions-row">
          <button className="d-btn-sec" disabled={pending} onClick={() => { setReopening(false); setErr(null); }}>
            Cancelar
          </button>
          <button className="d-btn-pri" disabled={pending || !comment.trim()} onClick={reopen}>
            {pending ? "Reabrindo…" : "Reabrir"}
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
          Reabrir com comentário
        </button>
        <button className="d-btn-pri" disabled={pending} onClick={validate}>
          {pending ? "Validando…" : "Validar"}
        </button>
      </div>
    </div>
  );
}

function Detail({ card, onClose }: { card: BoardCard; onClose: () => void }) {
  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="detail nebula-glass nebula-corners">
        <button className="d-close" onClick={onClose} aria-label="Fechar">✕</button>
        <div className="d-head">
          <span>{card.shortId}</span>
          <span className={`tag ${card.tipo}`}>{card.tipo}</span>
          <span className={`d-status ${STATUS_CHIP[card.status]}`}>{STATUS_LABEL[card.status]}</span>
        </div>
        <h3>{card.title}</h3>
        <div className="d-sec">
          <div className="lbl">O quê</div>
          <p>{card.oQue}</p>
        </div>
        <div className="d-sec">
          <div className="lbl">Por quê</div>
          <p>{card.porQue}</p>
        </div>
        <div className="d-sec">
          <div className="lbl">Como confirmo</div>
          <p>{card.comoConfirmo}</p>
        </div>
        <div className="d-sec d-grid">
          <div>
            <div className="lbl">Missão</div>
            <p>{card.mission ?? "—"}</p>
          </div>
          <div>
            <div className="lbl">Harness</div>
            <p className="d-mono">{card.harness ?? "—"}</p>
          </div>
        </div>
        <div className="d-sec">
          <div className="lbl">Papéis</div>
          <div className="d-roles">
            <span className="rl">origem <b>{card.origem}</b></span>
            <span className="rl">executor <b>{card.executor ?? "—"}</b></span>
            <span className="rl">devolve para <b>{card.devolve}</b></span>
          </div>
        </div>
        <div className="d-sec d-grid">
          <div>
            <div className="lbl">Branch</div>
            <p className="d-mono">{card.branch ?? "—"}</p>
          </div>
          {card.telemetry ? (
            <div>
              <div className="lbl">Telemetria</div>
              <p className="d-tel">{card.telemetry}</p>
            </div>
          ) : null}
        </div>
        {card.handoff ? (
          <div className="d-sec">
            <div className="lbl">Handoff do agente</div>
            <div className="d-evid">{card.handoff}</div>
          </div>
        ) : null}
        <DetailActions card={card} onClose={onClose} />
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
