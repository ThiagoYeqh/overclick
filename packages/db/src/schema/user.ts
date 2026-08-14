import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Local auth only. Email is an identifier, not a channel. */
export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
