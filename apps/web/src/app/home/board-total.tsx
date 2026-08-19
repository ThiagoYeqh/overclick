"use client";

import { useEffect, useRef, useState } from "react";
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

/** A caveat the total carries, with where to go to do something about it. */
type Warn = { text: string; href: string };

/**
 * Everything the bar shows about the total, computed once for the stat, the
 * popover and the menu line: the lead figure, the support numbers, the hover
 * reading and the caveats. A run that reported an estimate, a run that
 * reported nothing, and a model with no price in the table are each named,
 * because a total that swallows them is worth less than no total.
 */
function totalParts(totals: BoardTotals, filter: BoardFilter, t: Dict) {
  const href = `/insights?${boardFilterToQuery(filter)}`;
  const estimated = totals.estimated > 0;
  const tokens = approx(fmtTokens(totals.tokens), estimated);
  const time = approx(fmtDuration(totals.durationMs), estimated);
  // With money on, the dollars lead and the rest supports them. With money
  // off, or with nothing this selection could price, tokens lead instead: a
  // figure the board cannot establish is never printed as a zero.
  const lead = totals.costUsd != null ? `~$${totals.costUsd.toFixed(2)}` : tokens;
  const support = totals.costUsd != null ? `${tokens} · ${time}` : time;

  const warns: Warn[] = [];
  if (totals.costUnpriced > 0) {
    // The fix for an unpriced model lives in the price table, not in
    // Insights, so this one caveat points at Settings instead.
    warns.push({
      text: t.board.totalUnpriced(totals.costUnpriced),
      href: "/settings?tab=prices",
    });
  }
  if (totals.estimated > 0) {
    warns.push({ text: t.board.totalEstimated(totals.estimated), href });
  }
  if (totals.missing > 0) {
    warns.push({ text: t.board.totalMissing(totals.missing), href });
  }
  if (totals.suspect > 0) {
    warns.push({
      text: t.board.totalSuspect(totals.suspect, fmtTokens(totals.suspectTokens)),
      href,
    });
  }

  const detail = [
    totals.costComputed > 0
      ? `${totals.costComputed} ${t.board.costComputed}`
      : null,
    totals.costReported > 0
      ? `${totals.costReported} ${t.board.costReported}`
      : null,
    totals.costEstimated > 0
      ? `${totals.costEstimated} ${t.board.costEstimated}`
      : null,
    totals.elapsedOnly > 0 ? t.board.openFor(fmtElapsed(totals.elapsedMs)) : null,
  ].filter(Boolean) as string[];

  const title = [t.board.totalLabel, ...detail, ...warns.map((w) => w.text)]
    .filter(Boolean)
    .join(" · ");

  return { href, lead, support, tokens, time, warns, detail, title };
}

/**
 * The running total of what the work on screen consumed: a compact stat in
 * the bar that opens a popover with the full reading. The bar shows the
 * figure and, when there is anything the figure does not include, a discreet
 * count of how many caveats ride with it — the caveats themselves live in
 * the popover, each linked to where it is resolved: unpriced models to
 * Settings › Prices, the rest to the cards in Insights under this filter.
 *
 * The numbers come from the aggregation the Insights page runs, narrowed by
 * the same filter, so the two pages show the same selection.
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
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const parts = totalParts(totals, filter, t);

  // Same closing gesture as the filter panels: click away, or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (totals.attempts === 0) {
    return (
      <a className="board-total" href={parts.href} title={parts.title}>
        <span className="bt-none">{t.board.totalNone}</span>
      </a>
    );
  }

  return (
    <div className="board-total-wrap" ref={root}>
      <button
        type="button"
        className="board-total"
        title={parts.title}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <b className="bt-lead">{parts.lead}</b>
        <span className="bt-sub">{parts.support}</span>
        {parts.warns.length > 0 ? (
          <span className="bt-warn">{parts.warns.length}</span>
        ) : null}
      </button>
      {open ? (
        <div className="bt-popover nebula-glass" role="dialog" aria-label={t.board.totalLabel}>
          <div className="bt-figure">
            <b className="bt-lead">{parts.lead}</b>
            <span className="bt-sub">
              {parts.tokens} · {parts.time}
            </span>
          </div>
          {parts.detail.map((line) => (
            <span key={line} className="bt-line">
              {line}
            </span>
          ))}
          {parts.warns.map((warn) => (
            <a key={warn.text} className="bt-line bt-link" href={warn.href}>
              {warn.text}
            </a>
          ))}
          <a className="bt-line bt-link bt-insights" href={parts.href}>
            {t.board.totalOpenInsights}
          </a>
        </div>
      ) : null}
    </div>
  );
}
