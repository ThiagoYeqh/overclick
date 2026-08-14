import {
  type AnyPgColumn,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Harness, TaskOrigin } from "../types";
import {
  executionModeEnum,
  reviewerKindEnum,
  taskPriorityEnum,
  taskStatusEnum,
  taskTypeEnum,
} from "./enums";
import { mcpToken } from "./mcp-token";
import { mission } from "./mission";
import { project } from "./project";
import { user } from "./user";

export const task = pgTable(
  "task",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  missionId: uuid("mission_id").references(() => mission.id, {
    onDelete: "set null",
  }),
  parentId: uuid("parent_id").references((): AnyPgColumn => task.id, {
    onDelete: "cascade",
  }),
  shortId: text("short_id").notNull().unique(),
  title: text("title").notNull(),
  oQue: text("o_que").notNull().default(""),
  porQue: text("por_que").notNull().default(""),
  comoConfirmo: text("como_confirmo").notNull().default(""),
  tipo: taskTypeEnum("tipo").notNull().default("feature"),
  status: taskStatusEnum("status").notNull().default("aberto"),
  revisado: boolean("revisado").notNull().default(false),
  priority: taskPriorityEnum("priority").notNull().default("media"),
  devolveParaKind: reviewerKindEnum("devolve_para_kind")
    .notNull()
    .default("workspace_queue"),
  devolveParaUserId: uuid("devolve_para_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  devolveParaAgentRef: text("devolve_para_agent_ref"),
  harness: jsonb("harness").$type<Harness>(),
  branch: text("branch"),
  prUrl: text("pr_url"),
  origin: jsonb("origin").$type<TaskOrigin>(),
  mode: executionModeEnum("mode").notNull().default("solo"),
  telemetryIncomplete: boolean("telemetry_incomplete").notNull().default(false),
  isExample: boolean("is_example").notNull().default(false),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimedByExecutor: text("claimed_by_executor"),
  claimedByTokenId: uuid("claimed_by_token_id").references(() => mcpToken.id, {
    onDelete: "set null",
  }),
  createdByUserId: uuid("created_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  },
  (table) => [
    index("task_project_idx").on(table.projectId),
    index("task_status_idx").on(table.status),
    index("task_parent_idx").on(table.parentId),
  ],
);
