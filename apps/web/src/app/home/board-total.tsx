"use client";

import { boardFilterToQuery, type BoardFilter } from "../../lib/board-filter";
import type { BoardTotals } from "../../lib/board-totals";
import type { Dict } from "../../lib/i18n";

/*
 * The topbar has one line for this, so the numbers are spelled the way the
 * card line spells them: no unit words, a tilde on whatever is not exact.
 */

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}

function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}`;
}

function fmtElapsed(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 72) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function approx(text: string, isApprox: boolean): string {
  return isApprox ? `~${text}` : text;
}

/**
 * The running total of what the work on screen consumed, as the headline
 * figure of the topbar rather than a caption: this is the number that
 * justifies the board, so it is the one thing in that bar you can read at a
 * glance. Money leads when the pricing layer is on, tokens and time lead
 * when it is off, and whatever does not lead sits small beside it.
 *
 * The numbers come from the aggregation the Insights page runs, narrowed by
 * the same filter, and clicking through hands that filter to Insights so the
 * two pages show the same selection.
 *
 * Nothing is folded in silently. A run that reported an estimate, a run that
 * reported nothing, and a model with no price in the table are each named
 * beside the figure, because a total that swallows them is worth less than
 * no total.
 */
export function BoardTotal({
  totals,
  filter,
  t,
}: {
  totals: BoardTotals;
  filter: BoardFilter;
  t: Dict;
}) {
  const href = `/insights?${boardFilterToQuery(filter)}`;
  const estimated = totals.estimated > 0;

  const title = [
    t.board.totalLabel,
    totals.costComputed > 0
      ? `${totals.costComputed} ${t.board.costComputed}`
      : null,
    totals.costReported > 0
      ? `${totals.costReported} ${t.board.costReported}`
      : null,
    totals.costEstimated > 0
      ? `${totals.costEstimated} ${t.board.costEstimated}`
      : null,
    totals.costUnpriced > 0 ? t.board.totalUnpriced(totals.costUnpriced) : null,
    totals.estimated > 0 ? t.board.totalEstimated(totals.estimated) : null,
    totals.missing > 0 ? t.board.totalMissing(totals.missing) : null,
    totals.elapsedOnly > 0 ? t.board.openFor(fmtElapsed(totals.elapsedMs)) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (totals.attempts === 0) {
    return (
      <a className="board-total" href={href} title={title}>
        <span className="bt-none">{t.board.totalNone}</span>
      </a>
    );
  }

  const tokens = approx(fmtTokens(totals.tokens), estimated);
  const time = approx(fmtDuration(totals.durationMs), estimated);
  // With money on, the dollars lead and the rest supports them. With money
  // off, or with nothing this selection could price, tokens lead instead: a
  // figure the board cannot establish is never printed as a zero.
  const lead = totals.costUsd != null ? `~$${totals.costUsd.toFixed(2)}` : tokens;
  const support =
    totals.costUsd != null ? `${tokens} · ${time}` : time;

  return (
    <a className="board-total" href={href} title={title}>
      <b className="bt-lead">{lead}</b>
      <span className="bt-sub">{support}</span>
      {totals.costUnpriced > 0 ? (
        <span className="bt-mark">
          {t.board.totalUnpricedShort(totals.costUnpriced)}
        </span>
      ) : null}
      {totals.estimated > 0 ? (
        <span className="bt-mark">{t.board.totalEstShort(totals.estimated)}</span>
      ) : null}
      {totals.missing > 0 ? (
        <span className="bt-mark">{t.board.totalMissingShort(totals.missing)}</span>
      ) : null}
    </a>
  );
}
