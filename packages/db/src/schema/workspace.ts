import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { DEFAULT_CARDAPIO, KNOWN_EXECUTORS } from "../defaults";
import type { Cardapio, ExecutorConfig } from "../types";

export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  executors: jsonb("executors")
    .$type<ExecutorConfig[]>()
    .notNull()
    .default(KNOWN_EXECUTORS),
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
