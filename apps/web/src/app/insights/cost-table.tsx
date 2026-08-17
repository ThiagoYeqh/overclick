"use client";

import { useMemo, useState } from "react";
import type { CardInsight } from "../../lib/insights";
import { insightsCopy, type InsightsCopy } from "./copy";
import { fmtCostUsd, fmtDurationMs, fmtTokens } from "./format";

type SortKey = "cost" | "tokens" | "time" | "attempts";

/** Every dollar figure on this table says where it came from. */
function sourceLabel(source: CardInsight["costSource"], t: InsightsCopy): string {
  if (source === "computed") return t.sourceComputed;
  if (source === "reported") return t.sourceReported;
  if (source === "estimated") return t.sourceEstimated;
  if (source === "mixed") return t.sourceMixed;
  return t.sourceNone;
}

function valueOf(card: CardInsight, key: SortKey): number {
  // Cards that never reported a cost sort below a real $0 instead of mixing in.
  if (key === "cost") return card.costUsd ?? -1;
  if (key === "tokens") return card.tokens;
  if (key === "time") return card.durationMs;
  return card.attempts;
}

/** The per-card table. Sort state is view-only, so it stays client-side. */
export function CostTable({
  cards,
  lang,
  pricingEnabled,
}: {
  cards: CardInsight[];
  lang: string;
  /** Money is opt-in: with it off there is no cost column to sort by. */
  pricingEnabled: boolean;
}) {
  const t = insightsCopy(lang);
  const [sortKey, setSortKey] = useState<SortKey>(
    pricingEnabled ? "cost" : "tokens",
  );
  const [descending, setDescending] = useState(true);

  const sorted = useMemo(() => {
    const dir = descending ? -1 : 1;
    return [...cards].sort(
      (a, b) => dir * (valueOf(a, sortKey) - valueOf(b, sortKey)),
    );
  }, [cards, sortKey, descending]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setDescending((d) => !d);
    else {
      setSortKey(key);
      setDescending(true);
    }
  };

  const arrow = (key: SortKey) =>
    key === sortKey ? (descending ? " ↓" : " ↑") : "";

  const sortable: { key: SortKey; label: string }[] = [
    ...(pricingEnabled ? [{ key: "cost" as const, label: t.colCost }] : []),
    { key: "tokens", label: t.colTokens },
    { key: "time", label: t.colTime },
    { key: "attempts", label: t.colAttempts },
  ];

  return (
    <table className="ins-table">
      <thead>
        <tr>
          <th>{t.colCard}</th>
          <th>{t.colMission}</th>
          <th>{t.colModel}</th>
          {pricingEnabled ? <th>{t.colSource}</th> : null}
          {sortable.map((col) => (
            <th
              key={col.key}
              className={`ins-sort num${col.key === sortKey ? " on" : ""}`}
              onClick={() => toggle(col.key)}
              title={t.sortHint}
            >
              {col.label}
              {arrow(col.key)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((card) => (
          <tr key={card.taskId}>
            <td>
              <span className="ins-cid">{card.shortId}</span>
              <span className="ins-card-title">{card.title}</span>
              {card.estimated ? (
                <span className="ins-flag">{t.estimatedTag}</span>
              ) : null}
              {card.missing ? (
                <span className="ins-flag">{t.missingTag}</span>
              ) : null}
            </td>
            <td className="ins-dim">{card.missionTitle ?? t.noMission}</td>
            <td className="ins-mono">
              {card.models.length > 0 ? card.models.join(", ") : t.noModel}
            </td>
            {pricingEnabled ? (
              <td className={card.costSource ? "" : "ins-dim"}>
                {sourceLabel(card.costSource, t)}
              </td>
            ) : null}
            {pricingEnabled ? (
              <td className="num">
                {card.costUsd != null ? (
                  <b>{fmtCostUsd(card.costUsd)}</b>
                ) : (
                  <span className="ins-dim">{t.costNotReported}</span>
                )}
              </td>
            ) : null}
            <td className="num">{fmtTokens(card.tokens)}</td>
            <td className="num">{fmtDurationMs(card.durationMs)}</td>
            <td className="num">{card.attempts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
