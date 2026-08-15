import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { DEFAULT_CARDAPIO, KNOWN_EXECUTORS } from "../defaults";
import type { Cardapio, ExecutorConfig, SeenExecutor } from "../types";

export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** UI language for this workspace. English default, pt-BR first translation. */
  language: text("language").notNull().default("en"),
  executors: jsonb("executors")
    .$type<ExecutorConfig[]>()
    .notNull()
    .default(KNOWN_EXECUTORS),
  seenExecutors: jsonb("seen_executors")
    .$type<SeenExecutor[]>()
    .notNull()
    .default([]),
  cardapio: jsonb("cardapio")
    .$type<Cardapio>()
    .notNull()
    .default(DEFAULT_CARDAPIO),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
