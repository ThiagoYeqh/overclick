"use client";

import type { TaskPriority, TaskType } from "@agent-board/db";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/icon";
import { TASK_PRIORITIES, TASK_TYPES } from "../../lib/board-filter";
import type { Dict } from "../../lib/i18n";

export function toggleFacet<T extends string>(
  current: T[],
  value: T,
  order: readonly T[],
): T[] {
  const selected = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  return order.filter((item) => selected.includes(item));
}

/** Type and priority share one compact control because both describe cards. */
export function FacetFilters({
  types,
  priorities,
  onTypesChange,
  onPrioritiesChange,
  onClear,
  defaultOpen = false,
  t,
}: {
  types: TaskType[];
  priorities: TaskPriority[];
  onTypesChange: (types: TaskType[]) => void;
  onPrioritiesChange: (priorities: TaskPriority[]) => void;
  onClear: () => void;
  /** Lets server-rendered UI tests inspect the panel without a browser. */
  defaultOpen?: boolean;
  t: Dict;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const root = useRef<HTMLDivElement | null>(null);
  const activeCount = types.length + priorities.length;
  const label =
    activeCount > 0 ? `${t.board.filters} · ${activeCount}` : t.board.filters;

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

  const typeLabels: Record<TaskType, string> = {
    bug: t.board.typeBug,
    feature: t.board.typeFeature,
    rfc: t.board.typeRfc,
  };
  const priorityLabels: Record<TaskPriority, string> = {
    urgente: t.board.priorityUrgent,
    alta: t.board.priorityHigh,
    media: t.board.priorityMedium,
    baixa: t.board.priorityLow,
  };

  function option<T extends string>(
    value: T,
    text: string,
    selected: boolean,
    onChange: () => void,
  ) {
    return (
      <label key={value} className={`ff-opt${selected ? " on" : ""}`}>
        <input type="checkbox" checked={selected} onChange={onChange} />
        <span className="ff-box" aria-hidden="true">
          {selected ? <Icon name="check" label={null} size={11} /> : null}
        </span>
        <span className="ff-opt-name">{text}</span>
      </label>
    );
  }

  return (
    <div className="facet-filters" ref={root}>
      <button
        type="button"
        className={`filter-chip ff-trigger${activeCount > 0 ? " on" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </button>

      {open ? (
        <div
          className="ff-panel nebula-glass"
          role="dialog"
          aria-label={t.board.filters}
        >
          <section className="ff-section" aria-labelledby="ff-types-label">
            <h3 id="ff-types-label">{t.board.typeFilter}</h3>
            <div className="ff-list">
              {TASK_TYPES.map((type) =>
                option(type, typeLabels[type], types.includes(type), () =>
                  onTypesChange(toggleFacet(types, type, TASK_TYPES)),
                ),
              )}
            </div>
          </section>
          <section className="ff-section" aria-labelledby="ff-priorities-label">
            <h3 id="ff-priorities-label">{t.board.priorityFilter}</h3>
            <div className="ff-list">
              {TASK_PRIORITIES.map((priority) =>
                option(
                  priority,
                  priorityLabels[priority],
                  priorities.includes(priority),
                  () =>
                    onPrioritiesChange(
                      toggleFacet(priorities, priority, TASK_PRIORITIES),
                    ),
                ),
              )}
            </div>
          </section>
          <button
            className="ff-clear"
            type="button"
            disabled={activeCount === 0}
            onClick={onClear}
          >
            {t.board.clearFilters}
          </button>
        </div>
      ) : null}
    </div>
  );
}
