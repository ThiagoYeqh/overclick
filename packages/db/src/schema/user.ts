import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Local auth only. Email is an identifier, not a channel. */
export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** `all` or a project uuid. Null = first project (single-project default). */
  boardProjectId: text("board_project_id"),
  /**
   * `none` or a mission uuid. Null = every mission. `none` is what makes the
   * cards nobody put in a mission a place you can actually go to.
   */
  boardMissionId: text("board_mission_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
