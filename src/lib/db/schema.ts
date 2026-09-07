import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * Schema rules (see docs/agent-reports/E-architecture.md):
 * - Only column types with 1:1 Postgres equivalents (text, integer, real) — pg migration is mechanical.
 * - Dates are ISO-8601 TEXT (UTC). Enums are TEXT validated against src/lib/constants.ts.
 * - IDs are prefixed nanoids (obj_, ws_, ms_, task_, blk_, upd_, mem_, act_).
 * - Progress is NEVER stored: only milestone current/target/weight are; % is derived at read time.
 */

export const workspace = sqliteTable("workspace", {
  id: text("id").primaryKey(), // singleton row, id = 'workspace'
  name: text("name").notNull(),
  focusObjectiveId: text("focus_objective_id"),
  createdAt: text("created_at").notNull(),
});

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role"),
  authUserId: text("auth_user_id"), // reserved for Supabase Auth; unused in MVP
  isActive: integer("is_active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

export const objectives = sqliteTable("objectives", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"), // the hypothesis: what we're trying to prove & why
  ownerId: text("owner_id").notNull(),
  startDate: text("start_date"),
  targetDate: text("target_date"),
  status: text("status").notNull().default("active"),
  confidence: text("confidence").notNull().default("medium"),
  confidenceNote: text("confidence_note"), // WHY confidence is what it is
  confidenceUpdatedAt: text("confidence_updated_at"),
  // 期間(objective)の ← → 並び順。同点は start_date → created_at で解決。
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const workstreams = sqliteTable(
  "workstreams",
  {
    id: text("id").primaryKey(),
    objectiveId: text("objective_id").notNull(),
    name: text("name").notNull(),
    ownerId: text("owner_id").notNull(),
    status: text("status").notNull().default("active"),
    health: text("health").notNull().default("on_track"),
    healthNote: text("health_note"), // one line: why at_risk / off_track
    healthUpdatedAt: text("health_updated_at").notNull(), // staleness signal
    nextAction: text("next_action"), // one manually-curated line
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("ws_objective_idx").on(t.objectiveId)],
);

export const milestones = sqliteTable(
  "milestones",
  {
    id: text("id").primaryKey(),
    workstreamId: text("workstream_id").notNull(),
    // 積み木ブロックの担当者。null = ワークストリームのオーナーにフォールバック。
    ownerId: text("owner_id"),
    // 積み木の「下にある土台」。null = 紙に直置き(board_x/board_y を使う)。
    // 子の座標は保存しない — 土台の座標と親子関係から毎回計算する。
    parentId: text("parent_id"),
    // 手で立てた「重要」の旗。0 = 期限とブロッカーから自動で決める。
    important: integer("important").notNull().default(0),
    title: text("title").notNull(), // "30 Indonesian users answered the survey"
    targetValue: real("target_value").notNull(), // binary milestone → 1
    currentValue: real("current_value").notNull().default(0),
    unit: text("unit"), // "responses" | "people" | null for binary
    weight: integer("weight").notNull().default(1), // relative weight within the OBJECTIVE
    status: text("status").notNull().default("not_started"),
    dueDate: text("due_date"),
    sortOrder: integer("sort_order").notNull().default(0),
    // ホワイトボード上の自由配置座標。null = 自動レイアウト(いま/次/その先)に追従。
    // 盤座標は会社状態ではないので activity_log には記録しない。
    boardX: real("board_x"),
    boardY: real("board_y"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("ms_workstream_idx").on(t.workstreamId)],
);

/**
 * 「いま誰がこの積み木に取り組んでいるか」。担当者(milestones.owner_id)とは別物 —
 * 担当は「持ち主」、こちらは「今まさに手をつけている人」で、複数人が同時に立てられる。
 */
export const blockWorkers = sqliteTable(
  "block_workers",
  {
    id: text("id").primaryKey(),
    milestoneId: text("milestone_id").notNull(),
    memberId: text("member_id").notNull(),
    startedAt: text("started_at").notNull(),
  },
  (t) => [index("bw_milestone_idx").on(t.milestoneId), index("bw_member_idx").on(t.memberId)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    workstreamId: text("workstream_id"), // nullable: unassigned tasks live in the Inbox
    milestoneId: text("milestone_id"), // nullable: which evidence state this advances
    ownerId: text("owner_id").notNull(),
    status: text("status").notNull().default("todo"),
    priority: text("priority").notNull().default("p1"),
    dueDate: text("due_date"),
    note: text("note"),
    completedAt: text("completed_at"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("task_owner_idx").on(t.ownerId),
    index("task_workstream_idx").on(t.workstreamId),
  ],
);

export const blockers = sqliteTable(
  "blockers",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(), // "Can't access Indonesian communities"
    detail: text("detail"), // what would unblock this / context
    workstreamId: text("workstream_id").notNull(),
    taskId: text("task_id"), // optionally pinned to a task
    ownerId: text("owner_id").notNull(), // who is responsible for UNBLOCKING
    severity: text("severity").notNull().default("high"),
    status: text("status").notNull().default("active"),
    resolution: text("resolution"), // how it was resolved (learning record)
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("blk_status_idx").on(t.status)],
);

export const updates = sqliteTable(
  "updates",
  {
    id: text("id").primaryKey(),
    workstreamId: text("workstream_id").notNull(),
    authorId: text("author_id").notNull(),
    what: text("what").notNull(), // the only required field: "DM'd 5 communities"
    result: text("result"), // "2 replied, 1 interested"
    next: text("next"), // "book interviews with repliers"
    milestoneId: text("milestone_id"), // provenance: this update moved a milestone
    valueBefore: real("value_before"),
    valueAfter: real("value_after"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("upd_created_idx").on(t.createdAt)],
);

export const activityLog = sqliteTable(
  "activity_log",
  {
    id: text("id").primaryKey(),
    ts: text("ts").notNull(),
    actorType: text("actor_type").notNull().default("member"),
    actorId: text("actor_id"), // member id, or agent name
    entityType: text("entity_type").notNull(), // 'task' | 'milestone' | ...
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(), // 'created' | 'status_changed' | 'progress_updated' | ...
    detail: text("detail"), // JSON: {field, before, after}
  },
  (t) => [index("act_ts_idx").on(t.ts), index("act_entity_idx").on(t.entityType, t.entityId)],
);

export type WorkspaceRow = typeof workspace.$inferSelect;
export type MemberRow = typeof members.$inferSelect;
export type ObjectiveRow = typeof objectives.$inferSelect;
export type WorkstreamRow = typeof workstreams.$inferSelect;
export type MilestoneRow = typeof milestones.$inferSelect;
export type BlockWorkerRow = typeof blockWorkers.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type BlockerRow = typeof blockers.$inferSelect;
export type UpdateRow = typeof updates.$inferSelect;
export type ActivityRow = typeof activityLog.$inferSelect;
