import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { DEFAULT_CARDAPIO, KNOWN_EXECUTORS } from "../defaults";
import type { Cardapio, ExecutorConfig, SeenExecutor } from "../types";

export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** UI language for this workspace. English default, pt-BR first translation. */
  language: text("language").notNull().default("en"),
  /**
   * Opt-in update check against GitHub Releases. OFF by default: the zero
   * phone-home promise means no outbound request unless the owner turns it on.
   */
  updateCheckEnabled: boolean("update_check_enabled").notNull().default(false),
  /**
   * Opt-in money layer. OFF by default: tokens and time are facts on every
   * plan, while a dollar figure is fiction on a flat subscription and a price
   * table goes stale and lies with confidence. Turn it on and the board adds a
   * clearly labeled approximate cost next to the numbers it measured.
   */
  pricingEnabled: boolean("pricing_enabled").notNull().default(false),
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
