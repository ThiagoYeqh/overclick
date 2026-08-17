"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { logoutAction } from "../../actions/auth";
import { setBoardFilterAction } from "../../actions/board-filter";
import { assignCardsToMissionAction } from "../../actions/missions";
import {
  countLooseCards,
  filterBoardCards,
  missionFilterOptions,
  projectFilterOptions,
  toggleProject,
  type BoardFilter,
} from "../../lib/board-filter";
import { dict, type Dict } from "../../lib/i18n";
import { Board, type BoardCard, type BoardMissionOption } from "./board";
import { MissionFilter } from "./mission-filter";
import { ProjectFilter } from "./project-filter";

export type BoardProjectOption = { id: string; name: string };
export type { BoardMissionOption };

/**
 * The bulk move: pick cards on the board, send the whole selection into a
 * mission, or out of one. An instance that ran before missions existed has
 * every card loose, and fixing that one detail panel at a time is not a fix.
 */
function BulkMissionBar({
  selected,
  missions,
  onDone,
  onClear,
  t,
}: {
  selected: string[];
  missions: BoardMissionOption[];
  onDone: () => void;
  onClear: () => void;
  t: Dict;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [missionId, setMissionId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const assign = () =>
    start(async () => {
      setErr(null);
      const r = await assignCardsToMissionAction(selected, missionId || null);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      onDone();
      router.refresh();
    });

  return (
    <div className="bulk-bar nebula-glass">
      <span className="bulk-count">
        {selected.length === 0
          ? t.board.pickCardsHint
          : t.board.selectedCount(selected.length)}
      </span>
      <label className="filter-chip">
        <select
          aria-label={t.board.assignTo}
          value={missionId}
          disabled={pending}
          onChange={(event) => setMissionId(event.target.value)}
        >
          <option value="">{t.board.noMission}</option>
          {missions.map((miss) => (
            <option key={miss.id} value={miss.id}>
              {miss.title}
            </option>
          ))}
        </select>
      </label>
      {err ? <span className="bulk-err">{err}</span> : null}
      <button
        className="btn-ghost"
        type="button"
        disabled={pending}
        onClick={onClear}
      >
        {t.board.cancelSelection}
      </button>
      <button
        className="d-btn-pri"
        type="button"
        disabled={pending || selected.length === 0}
        onClick={assign}
      >
        {pending ? t.board.assigning : t.board.assign}
      </button>
    </div>
  );
}

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
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const visible = useMemo(() => filterBoardCards(cards, filter), [cards, filter]);
  // What the mission filter may offer: the scope is the projects on screen, so
  // the options and their counts follow the selection, not the mission.
  const scope = useMemo(
    () => ({ projectIds: filter.projectIds, missionId: null }),
    [filter.projectIds],
  );
  const missionOptions = useMemo(
    () => missionFilterOptions(cards, missions, filter),
    [cards, missions, filter],
  );
  const looseCount = useMemo(
    () => countLooseCards(cards, scope),
    [cards, scope],
  );
  const scopeCount = useMemo(
    () => filterBoardCards(cards, scope).length,
    [cards, scope],
  );
  const projectOptions = useMemo(
    () => projectFilterOptions(cards, projects, filter),
    [cards, projects, filter],
  );
  // The prefix earns its place on the card only when more than one project is
  // on screen. Under a single project it would repeat itself 44 times.
  const mixedProjects = useMemo(
    () => new Set(visible.map((card) => card.projectId)).size > 1,
    [visible],
  );
  const running = visible.filter((card) => card.status === "em_execucao").length;
  const review = visible.filter((card) => card.status === "feito").length;

  function apply(next: BoardFilter) {
    setFilter(next);
    void setBoardFilterAction(next);
  }

  function toggleSelect(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function stopPicking() {
    setPicking(false);
    setSelected([]);
  }

  return (
    <>
      <div className="topbar nebula-glass">
        <div className="logo">
          over<span>click</span>
        </div>
        <div className="crumb">
          <span className="crumb-ws" title={workspaceName}>
            {workspaceName}
          </span>
          /{" "}
          <ProjectFilter
            options={projectOptions}
            value={filter.projectIds}
            onToggle={(projectId) =>
              apply({
                ...filter,
                projectIds: toggleProject(filter.projectIds, projectId, projects),
              })
            }
            onAll={() => apply({ ...filter, projectIds: [] })}
            t={t}
          />
        </div>
        <MissionFilter
          options={missionOptions}
          looseCount={looseCount}
          totalCount={scopeCount}
          value={filter.missionId}
          onChange={(missionId) => apply({ ...filter, missionId })}
          t={t}
        />
        <button
          className={`btn-ghost${picking ? " on" : ""}`}
          type="button"
          onClick={() => (picking ? stopPicking() : setPicking(true))}
        >
          {picking ? t.board.cancelSelection : t.board.moveToMission}
        </button>
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

      <Board
        cards={visible}
        lang={lang}
        missions={missions}
        showProject={mixedProjects}
        selectable={picking}
        selectedIds={selected}
        onToggleSelect={toggleSelect}
      />

      {picking ? (
        <BulkMissionBar
          selected={selected}
          missions={missions}
          onDone={stopPicking}
          onClear={stopPicking}
          t={t}
        />
      ) : null}
    </>
  );
}
