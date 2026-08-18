"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectCount } from "../../lib/board-filter";
import type { Dict } from "../../lib/i18n";
import { Icon } from "../../components/icon";

/**
 * The project filter of the board. A single choice dropdown forced looking at
 * one project at a time, so work that spans projects could never be seen
 * together, which is exactly when a board earns its keep. Here any combination
 * is a valid answer, and All projects stays as the shortcut it always was.
 */
export function ProjectFilter({
  options,
  /** Empty is the All projects shortcut. */
  value,
  onToggle,
  onAll,
  t,
}: {
  options: Array<ProjectCount & { hasContext?: boolean }>;
  value: string[];
  onToggle: (projectId: string) => void;
  onAll: () => void;
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

  const all = value.length === 0;
  // One line whatever the selection: the name while it is one project, the
  // count once naming them all would push the topbar into a second line.
  const label = all
    ? t.board.allProjects
    : value.length === 1
      ? (options.find((item) => item.id === value[0])?.name ??
        t.board.allProjects)
      : t.board.projectsPicked(value.length);

  return (
    <div className="project-filter" ref={root}>
      <button
        type="button"
        className="pf-trigger"
        aria-label={t.board.projectFilter}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="pf-label" title={label}>
          {label}
        </span>
      </button>

      {open ? (
        <div className="pf-panel nebula-glass">
          <div className="pf-list" role="listbox" aria-multiselectable="true" aria-label={t.board.projectFilter}>
            <button
              type="button"
              role="option"
              aria-selected={all}
              className={`pf-opt${all ? " on" : ""}`}
              onClick={() => {
                onAll();
                setOpen(false);
              }}
            >
              <span className="pf-box">
                {all ? <Icon name="check" label={null} size={11} /> : null}
              </span>
              <span className="pf-opt-name">{t.board.allProjects}</span>
            </button>
            {options.map((option) => {
              // Under the shortcut every project is on screen, so every box
              // is ticked: the panel says what the board shows, not what was
              // clicked to get there.
              const picked = all || value.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={picked}
                  className={`pf-opt${picked ? " on" : ""}`}
                  onClick={() => onToggle(option.id)}
                >
                  <span className="pf-box">
                    {picked ? <Icon name="check" label={null} size={11} /> : null}
                  </span>
                  <span className="pf-opt-name" title={option.name}>
                    {option.name}
                  </span>
                  {option.hasContext ? (
                    <span
                      className="pf-opt-count"
                      aria-label={t.board.projectContextAvailable}
                      title={t.board.projectContextAvailable}
                    >
                      ctx
                    </span>
                  ) : null}
                  <span className="pf-opt-count">{option.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
