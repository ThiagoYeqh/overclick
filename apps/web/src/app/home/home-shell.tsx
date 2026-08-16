"use client";

import { useMemo, useState } from "react";
import { logoutAction } from "../../actions/auth";
import { setBoardFilterAction } from "../../actions/board-filter";
import {
  ALL_PROJECTS,
  filterBoardCards,
  type BoardFilter,
} from "../../lib/board-filter";
import { dict } from "../../lib/i18n";
import { Board, type BoardCard } from "./board";

export type BoardProjectOption = { id: string; name: string };
export type BoardMissionOption = { id: string; title: string };

export function HomeShell({
  workspaceName,
  lang,
  projects,
  missions,
  cards,
  initialFilter,
}: {
  workspaceName: string;
  lang: string;
  projects: BoardProjectOption[];
  missions: BoardMissionOption[];
  cards: BoardCard[];
  initialFilter: BoardFilter;
}) {
  const t = dict(lang);
  const [filter, setFilter] = useState<BoardFilter>(initialFilter);
  const visible = useMemo(() => filterBoardCards(cards, filter), [cards, filter]);
  const running = visible.filter((card) => card.status === "em_execucao").length;
  const review = visible.filter((card) => card.status === "feito").length;

  function apply(next: BoardFilter) {
    setFilter(next);
    void setBoardFilterAction(next);
  }

  return (
    <>
      <div className="topbar nebula-glass">
        <div className="logo">
          over<span>click</span>
        </div>
        <div className="crumb">
          {workspaceName} /{" "}
          <select
            aria-label={t.board.allProjects}
            value={filter.projectId}
            onChange={(event) =>
              apply({ ...filter, projectId: event.target.value })
            }
          >
            {projects.map((proj) => (
              <option key={proj.id} value={proj.id}>
                {proj.name}
              </option>
            ))}
            <option value={ALL_PROJECTS}>{t.board.allProjects}</option>
          </select>
        </div>
        <label className="filter-chip">
          <select
            aria-label={t.board.allMissions}
            value={filter.missionId ?? ""}
            onChange={(event) =>
              apply({
                ...filter,
                missionId: event.target.value || null,
              })
            }
          >
            <option value="">{t.board.allMissions}</option>
            {missions.map((miss) => (
              <option key={miss.id} value={miss.id}>
                {miss.title}
              </option>
            ))}
          </select>
        </label>
        <div className="spacer" />
        <span className="btn-ghost pill">
          {t.board.myReview} <span className="badge">{review}</span>
        </span>
        <div className="agent-status">
          <span className={`dot${running === 0 ? " idle" : ""}`} />
          {running > 0 ? t.board.running(running) : t.board.noAgentRunning}
        </div>
        <a className="btn-ghost" href="/insights">Insights</a>
        <a className="btn-ghost" href="/settings">
          {t.board.settings}
        </a>
        <form action={logoutAction}>
          <button className="btn-ghost" type="submit">
            {t.board.logout}
          </button>
        </form>
      </div>

      <Board cards={visible} lang={lang} />
    </>
  );
}
