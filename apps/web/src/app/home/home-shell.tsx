"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { logoutAction } from "../../actions/auth";
import { Wordmark } from "../../components/wordmark";
import {
  boardTotalsAction,
  setBoardFilterAction,
} from "../../actions/board-filter";
import { assignCardsToMissionAction } from "../../actions/missions";
import {
  countLooseCards,
  filterBoardCards,
  missionFilterOptions,
  projectFilterOptions,
  toggleProject,
  type BoardFilter,
} from "../../lib/board-filter";
import type { BoardTotals } from "../../lib/board-totals";
import { dict, type Dict } from "../../lib/i18n";
import { Icon } from "../../components/icon";
import { Board, type BoardCard, type BoardMissionOption } from "./board";
import { BoardTotal, BoardTotalLink } from "./board-total";
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

/**
 * The account and navigation menu (OCL-20): one button on the hard right of
 * the bar holding what is not a filter and not work state — Insights,
 * Settings and the way out. Under 1100px it also carries the telemetry stat,
 * which the bar can no longer hold next to whole filter labels. The dropdown
 * closes on the same gesture as every other panel here: click away, Escape.
 */
function AccountMenu({
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

  return (
    <div className="account-menu" ref={root}>
      <button
        type="button"
        className="am-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.board.accountMenu}
        onClick={() => setOpen((current) => !current)}
      >
        {/* The button is named, so the three dots stay silent. */}
        <Icon name="more" label={null} size={16} />
      </button>
      {open ? (
        <div className="am-panel nebula-glass" role="menu" aria-label={t.board.accountMenu}>
          {/* In the bar at full width; here only when the bar gave it up. */}
          <div className="am-total">
            <BoardTotalLink totals={totals} filter={filter} t={t} />
          </div>
          <a className="am-opt" role="menuitem" href="/insights">
            <Icon name="insights" label={null} size={14} />
            Insights
          </a>
          <a className="am-opt" role="menuitem" href="/settings">
            <Icon name="settings" label={null} size={14} />
            {t.board.settings}
          </a>
          <form action={logoutAction}>
            <button className="am-opt" role="menuitem" type="submit">
              <Icon name="logout" label={null} size={14} />
              {t.board.logout}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function HomeShell({
  lang,
  projects,
  missions,
  cards,
  initialFilter,
  initialTotals,
}: {
  lang: string;
  projects: BoardProjectOption[];
  missions: BoardMissionOption[];
  cards: BoardCard[];
  initialFilter: BoardFilter;
  /** What the initial filter consumed, already aggregated on the server. */
  initialTotals: BoardTotals;
}) {
  const t = dict(lang);
  const [filter, setFilter] = useState<BoardFilter>(initialFilter);
  const [totals, setTotals] = useState<BoardTotals>(initialTotals);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  // Phone only: the filters leave the compact bar for the panel behind this
  // one button. On the desktop the panel never opens because the button is
  // hidden and the wrapper is transparent to the bar.
  const [filtersOpen, setFiltersOpen] = useState(false);
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
    // The total is aggregated where Insights aggregates it, so a new filter
    // asks the server for its numbers instead of adding cards up here.
    void boardTotalsAction(next).then(setTotals);
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
        <Wordmark label={t.board.homeLink} current />
        {/* OCL-20: the bar is two zones now. On the left, the filters — what
            the person on the board uses most — with the room the right side
            used to spend. On the right, the work state (review, running),
            the telemetry stat and the account menu, nothing else. On the
            phone the left zone collapses behind the Filtros button and the
            wrapper becomes the panel that holds it: same controls, same
            order, nothing dropped (AGB-65). */}
        <div className={`topbar-more${filtersOpen ? " open" : ""}`}>
          <div className="crumb">
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
            onClick={() => {
              setFiltersOpen(false);
              if (picking) stopPicking();
              else setPicking(true);
            }}
          >
            {picking ? t.board.cancelSelection : t.board.moveToMission}
          </button>
        </div>
        <button
          className="filters-btn"
          type="button"
          aria-expanded={filtersOpen}
          aria-label={t.board.filters}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <Icon name="filter" label={null} size={14} />
          <span>{t.board.filters}</span>
        </button>
        <div className="spacer" />
        {/* Work state stays visible: it is not navigation, it is what the
            board is doing. Each chip jumps to the column it counts. */}
        <a className="state-chip" href="#board-col-feito">
          <Icon name="review" label={null} size={13} />
          <span className="sc-label">{t.board.myReview}</span>
          <span className="badge">{review}</span>
        </a>
        <a className="state-chip agent-status" href="#board-col-em_execucao">
          <span className={`dot${running === 0 ? " idle" : ""}`} />
          {running > 0 ? <span className="badge">{running}</span> : null}
          <span className="sc-label">
            {running > 0 ? t.board.running(running) : t.board.noAgentRunning}
          </span>
        </a>
        {/* The figure that justifies the board stays readable at a glance;
            the reading of it moved into the popover it opens. */}
        <BoardTotal totals={totals} filter={filter} t={t} />
        <AccountMenu totals={totals} filter={filter} t={t} />
      </div>
      {/* Tap-away target for the phone filters panel; rendered only while it
          is open, which the desktop never does. */}
      {filtersOpen ? (
        <div className="menu-backdrop" onClick={() => setFiltersOpen(false)} />
      ) : null}

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
