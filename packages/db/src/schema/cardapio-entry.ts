import { index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { workspace } from "./workspace";

/** Per-workspace cardápio policy: activity type → CLI · model · effort. No skills. */
export const cardapioEntry = pgTable(
  "cardapio_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    activityType: text("activity_type").notNull(),
    cli: text("cli"),
    model: text("model"),
    effort: text("effort").notNull(),
  },
  (table) => [
    unique("cardapio_entry_workspace_type").on(table.workspaceId, table.activityType),
    index("cardapio_entry_workspace_idx").on(table.workspaceId),
  ],
);
