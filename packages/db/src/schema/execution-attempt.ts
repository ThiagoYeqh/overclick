import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { task } from "./task";

export const executionAttempt = pgTable(
  "execution_attempt",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => task.id, { onDelete: "cascade" }),
  executor: text("executor"),
  model: text("model"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  tokensCache: integer("tokens_cache"),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
  durationMs: integer("duration_ms"),
  turns: integer("turns"),
  result: text("result"),
  resultNote: text("result_note"),
  },
  (table) => [index("execution_attempt_task_idx").on(table.taskId)],
);
