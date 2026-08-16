import { index, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { workspace } from "./workspace";

/**
 * Per-workspace price table: model → dollars per million tokens. Rows only
 * exist once someone edits a price; the seeded public list is the default the
 * board shows and computes with until then.
 */
export const modelPrice = pgTable(
  "model_price",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    /** Normalized model key, so every spelling of a model hits one row. */
    model: text("model").notNull(),
    /** Display name as the human typed it. */
    label: text("label").notNull(),
    inputPerMtok: numeric("input_per_mtok", { precision: 12, scale: 6 }).notNull(),
    outputPerMtok: numeric("output_per_mtok", { precision: 12, scale: 6 }).notNull(),
    /** Applied to the tokens_cache counter of the usage contract. */
    cachePerMtok: numeric("cache_per_mtok", { precision: 12, scale: 6 }).notNull(),
    /**
     * Date the public prices in this row were captured, when it still carries
     * the seeded numbers. Null once a human types their own.
     */
    seededAt: text("seeded_at"),
    /** Email when the edit came from Settings, token label when over MCP. */
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("model_price_workspace_model").on(table.workspaceId, table.model),
    index("model_price_workspace_idx").on(table.workspaceId),
  ],
);
