"use client";

import type { TaskPriority, TaskType } from "@agent-board/db";
import {
  TASK_PRIORITIES,
  TASK_TYPES,
} from "../../lib/board-filter";
import type { Dict } from "../../lib/i18n";

function toggle<T extends string>(
  current: T[],
  value: T,
  order: readonly T[],
): T[] {
  const selected = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
  return order.filter((item) => selected.includes(item));
}

/**
 * The two facets are direct chips, not selects: a triager can combine bug +
 * urgent + high without reopening a menu between choices. The same groups
 * wrap inside the compact filters panel at narrower widths.
 */
export function FacetFilters({
  types,
  priorities,
  onTypesChange,
  onPrioritiesChange,
  t,
}: {
  types: TaskType[];
  priorities: TaskPriority[];
  onTypesChange: (types: TaskType[]) => void;
  onPrioritiesChange: (priorities: TaskPriority[]) => void;
  t: Dict;
}) {
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

  return (
    <div className="facet-filters">
      <div className="facet-group" role="group" aria-label={t.board.typeFilter}>
        <span className="facet-label">{t.board.typeFilter}</span>
        {TASK_TYPES.map((type) => {
          const active = types.includes(type);
          return (
            <button
              key={type}
              type="button"
              className={`facet-chip facet-${type}${active ? " on" : ""}`}
              aria-pressed={active}
              onClick={() => onTypesChange(toggle(types, type, TASK_TYPES))}
            >
              {typeLabels[type]}
            </button>
          );
        })}
      </div>
      <div
        className="facet-group"
        role="group"
        aria-label={t.board.priorityFilter}
      >
        <span className="facet-label">{t.board.priorityFilter}</span>
        {TASK_PRIORITIES.map((priority) => {
          const active = priorities.includes(priority);
          return (
            <button
              key={priority}
              type="button"
              className={`facet-chip facet-${priority}${active ? " on" : ""}`}
              aria-pressed={active}
              onClick={() =>
                onPrioritiesChange(
                  toggle(priorities, priority, TASK_PRIORITIES),
                )
              }
            >
              {priorityLabels[priority]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
