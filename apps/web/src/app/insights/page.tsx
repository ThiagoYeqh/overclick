import { redirect } from "next/navigation";
import { NebulaAtmosphere } from "../../components/nebula-atmosphere";
import { getSession } from "../../lib/cookies";
import { db } from "../../lib/db";
import {
  computeInsights,
  loadInsightAttemptRows,
  loadReopenRows,
  type GroupInsight,
  type ModelReopenInsight,
  type UsageTotals,
} from "../../lib/insights";
import { loadModelPrices } from "../../lib/prices";
import { insightsCopy, type InsightsCopy } from "./copy";
import { CostTable } from "./cost-table";
import { fmtCostUsd, fmtDurationMs, fmtRate, fmtTokens } from "./format";

export const dynamic = "force-dynamic";

/** "2 estimated · 1 usage not reported", or the all-clear. Never a silent sum. */
function honestyNote(totals: UsageTotals, t: InsightsCopy): string {
  const parts: string[] = [];
  if (totals.estimated > 0) parts.push(t.estimatedCount(totals.estimated));
  if (totals.missing > 0) parts.push(t.missingCount(totals.missing));
  return parts.length > 0 ? parts.join(" · ") : t.allReported;
}

/** Where the dollars in a sum came from: computed, reported, or estimated. */
function sourceNote(totals: UsageTotals, t: InsightsCopy): string {
  const parts: string[] = [];
  if (totals.costComputed > 0) parts.push(t.computedCount(totals.costComputed));
  if (totals.costReported > 0) parts.push(t.reportedCount(totals.costReported));
  if (totals.costEstimated > 0) parts.push(t.estimatedCount(totals.costEstimated));
  if (totals.costUnpriced > 0) parts.push(t.unpricedCount(totals.costUnpriced));
  return parts.length > 0 ? parts.join(" · ") : t.noCostSource;
}

function GroupTable({
  rows,
  fallbackLabel,
  t,
  pricingEnabled,
}: {
  rows: GroupInsight[];
  fallbackLabel: string;
  t: InsightsCopy;
  /** Money is opt-in: with it off the cost column is not there at all. */
  pricingEnabled: boolean;
}) {
  return (
    <table className="ins-table">
      <thead>
        <tr>
          <th>{t.colName}</th>
          {pricingEnabled ? <th className="num">{t.colCost}</th> : null}
          <th className="num">{t.colTokens}</th>
          <th className="num">{t.colTime}</th>
          <th className="num">{t.colAttempts}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>
              {row.label ?? <span className="ins-dim">{fallbackLabel}</span>}
              {row.estimated > 0 || row.missing > 0 ? (
                <span className="ins-flag">{honestyNote(row, t)}</span>
              ) : null}
            </td>
            {pricingEnabled ? (
              <td className="num">
                <b>{fmtCostUsd(row.costUsd)}</b>
              </td>
            ) : null}
            <td className="num">{fmtTokens(row.tokens)}</td>
            <td className="num">{fmtDurationMs(row.durationMs)}</td>
            <td className="num">{row.attempts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReopenTable({
  rows,
  t,
}: {
  rows: ModelReopenInsight[];
  t: InsightsCopy;
}) {
  if (rows.length === 0) {
    return <p className="ins-dim">{t.emptyReopens}</p>;
  }
  return (
    <table className="ins-table">
      <thead>
        <tr>
          <th>{t.colModel}</th>
          <th className="num">{t.colDeliveries}</th>
          <th className="num">{t.colReopened}</th>
          <th className="num">{t.colRate}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.model ?? "__unknown__"}>
            <td className="ins-mono">
              {row.model ?? <span className="ins-dim">{t.noModel}</span>}
            </td>
            <td className="num">{row.deliveries}</td>
            <td className="num">{row.reopened}</td>
            <td className="num">
              <b>{fmtRate(row.rate)}</b>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function InsightsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const ws = await db().query.workspace.findFirst();
  if (!ws) redirect("/setup");

  // No price table to read when the money layer is off: there is nothing on
  // this page for it to fill.
  const [attemptRows, reopenRows, prices] = await Promise.all([
    loadInsightAttemptRows(db(), ws.id),
    loadReopenRows(db(), ws.id),
    ws.pricingEnabled ? loadModelPrices(db(), ws.id) : Promise.resolve([]),
  ]);
  const insights = computeInsights(attemptRows, reopenRows, prices);
  const t = insightsCopy(ws.language);
  const switchedRuns = insights.switchedRuns;
  const pricingEnabled = ws.pricingEnabled;
  const { totals } = insights;

  return (
    <div className="nb nebula-surface">
      <NebulaAtmosphere />

      <div className="page">
        <div className="topbar nebula-glass">
          <div className="logo">
            over<span>click</span>
          </div>
          <div className="crumb">
            {ws.name} / <b>{t.title}</b>
          </div>
          <div className="spacer" />
          <a className="btn-ghost" href="/home">
            {t.backToBoard}
          </a>
        </div>

        <h1>{t.title}</h1>
        <p className="page-sub">{t.sub}</p>

        {totals.attempts === 0 ? (
          <div className="ins-empty nebula-glass">{t.empty}</div>
        ) : (
          <>
            <div className="ins-tiles">
              {/* Tokens and time first: they are true on every plan. Money is
                  a layer this workspace switched on, or it is simply absent. */}
              <div className="ins-tile nebula-glass">
                <div className="ins-lbl">{t.totalTokens}</div>
                <div className="ins-num">{fmtTokens(totals.tokens)}</div>
                <div className="ins-note">{honestyNote(totals, t)}</div>
              </div>
              <div className="ins-tile nebula-glass">
                <div className="ins-lbl">{t.totalTime}</div>
                <div className="ins-num">{fmtDurationMs(totals.durationMs)}</div>
              </div>
              {pricingEnabled ? (
                <div className="ins-tile nebula-glass">
                  <div className="ins-lbl">{t.totalCost}</div>
                  <div className="ins-num">{fmtCostUsd(totals.costUsd)}</div>
                  <div className="ins-note">{sourceNote(totals, t)}</div>
                </div>
              ) : null}
              <div className="ins-tile nebula-glass">
                <div className="ins-lbl">{t.attempts}</div>
                <div className="ins-num">{totals.attempts}</div>
              </div>
            </div>

            <div className="ins-grid">
              <div className="ins-sec">
                <div className="sec-cap">{t.byProject}</div>
                <GroupTable
                  rows={insights.byProject}
                  fallbackLabel="—"
                  t={t}
                  pricingEnabled={pricingEnabled}
                />
              </div>
              <div className="ins-sec">
                <div className="sec-cap">{t.byMission}</div>
                <GroupTable
                  rows={insights.byMission}
                  fallbackLabel={t.noMission}
                  t={t}
                  pricingEnabled={pricingEnabled}
                />
              </div>
              <div className="ins-sec">
                <div className="sec-cap">{t.byModel}</div>
                {/* Runs that switched model split their tokens but not their
                    clock: say so instead of letting the times look additive. */}
                {switchedRuns > 0 ? (
                  <p className="ins-dim">{t.sharedModelsNote(switchedRuns)}</p>
                ) : null}
                <GroupTable
                  rows={insights.byModel}
                  fallbackLabel={t.noModel}
                  t={t}
                  pricingEnabled={pricingEnabled}
                />
              </div>
              <div className="ins-sec">
                <div className="sec-cap">{t.reopenedByModel}</div>
                <ReopenTable rows={insights.reopensByModel} t={t} />
              </div>
            </div>

            <div className="ins-sec">
              <div className="sec-cap">
                {pricingEnabled ? t.perCard : t.perCardNoMoney}
              </div>
              {pricingEnabled ? <p className="ins-dim">{t.pricesNote}</p> : null}
              <CostTable
                cards={insights.perCard}
                lang={ws.language}
                pricingEnabled={pricingEnabled}
              />
            </div>
          </>
        )}
      </div>

      <div className="nebula-glass-fade viewport-fade" aria-hidden="true" />
    </div>
  );
}
