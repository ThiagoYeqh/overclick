import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { task } from "./task";
import { user } from "./user";

export const taskComment = pgTable("task_comment", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => task.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  authorAgentRef: text("author_agent_ref"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
