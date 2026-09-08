"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActor } from "@/lib/current-member";
import { CONFIDENCE, HEALTH, TASK_PRIORITY, TASK_STATUS } from "@/lib/constants";
import * as objectives from "@/lib/services/objectives";
import * as workstreams from "@/lib/services/workstreams";
import * as milestones from "@/lib/services/milestones";
import * as tasks from "@/lib/services/tasks";
import * as blockers from "@/lib/services/blockers";
import * as updates from "@/lib/services/updates";

/**
 * Server Actions are 3-line wrappers: validate → call service → revalidate.
 * All business logic lives in src/lib/services (the future MCP surface).
 */

function refresh() {
  revalidatePath("/", "layout");
}

// ---- the two golden inputs -------------------------------------------------

const bumpSchema = z.object({
  milestone_id: z.string().min(1),
  new_value: z.coerce.number().min(0),
  note: z.string().optional(),
});

export async function bumpMilestoneAction(input: z.infer<typeof bumpSchema>) {
  const p = bumpSchema.parse(input);
  const res = await milestones.updateMilestoneProgress(p.milestone_id, p.new_value, await getActor(), {
    note: p.note,
  });
  refresh();
  return { achieved: res.achieved, before: res.before, after: res.after };
}

const updateSchema = z.object({
  workstream_id: z.string().min(1),
  what: z.string().min(1),
  result: z.string().optional(),
  next: z.string().optional(),
  milestone_id: z.string().optional(),
  new_value: z.coerce.number().min(0).optional(),
  blocker_title: z.string().optional(),
  blocker_detail: z.string().optional(),
});

export async function addUpdateAction(input: z.infer<typeof updateSchema>) {
  const p = updateSchema.parse(input);
  const actor = await getActor();
  if (!actor.id) throw new Error("no member selected");
  await updates.addUpdate(
    {
      workstream_id: p.workstream_id,
      author_id: actor.id,
      what: p.what,
      result: p.result || null,
      next: p.next || null,
      milestone_id: p.milestone_id || null,
      new_value: p.new_value ?? null,
      blocker: p.blocker_title?.trim()
        ? { title: p.blocker_title, detail: p.blocker_detail || null }
        : null,
    },
    actor,
  );
  refresh();
}

// ---- tasks -----------------------------------------------------------------

const createTaskSchema = z.object({
  title: z.string().min(1),
  owner_id: z.string().min(1),
  workstream_id: z.string().optional(),
  milestone_id: z.string().optional(),
  priority: z.enum(TASK_PRIORITY).optional(),
  due_date: z.string().optional(),
});

export async function createTaskAction(input: z.infer<typeof createTaskSchema>) {
  const p = createTaskSchema.parse(input);
  await tasks.createTask(
    {
      title: p.title,
      owner_id: p.owner_id,
      workstream_id: p.workstream_id || null,
      milestone_id: p.milestone_id || null,
      priority: p.priority,
      due_date: p.due_date || null,
    },
    await getActor(),
  );
  refresh();
}

export async function setTaskStatusAction(taskId: string, status: string) {
  z.enum(TASK_STATUS).parse(status);
  await tasks.updateTask(taskId, { status }, await getActor());
  refresh();
}

export async function updateTaskAction(
  taskId: string,
  patch: {
    title?: string;
    priority?: string;
    due_date?: string | null;
    owner_id?: string;
    workstream_id?: string | null;
    milestone_id?: string | null;
  },
) {
  await tasks.updateTask(taskId, patch, await getActor());
  refresh();
}

// ---- blockers --------------------------------------------------------------

export async function resolveBlockerAction(blockerId: string, resolution: string) {
  await blockers.resolveBlocker(blockerId, resolution, await getActor());
  refresh();
}

const createBlockerSchema = z.object({
  title: z.string().min(1),
  detail: z.string().optional(),
  workstream_id: z.string().min(1),
  owner_id: z.string().min(1),
  severity: z.string().optional(),
});

export async function createBlockerAction(input: z.infer<typeof createBlockerSchema>) {
  const p = createBlockerSchema.parse(input);
  await blockers.createBlocker(
    {
      title: p.title,
      detail: p.detail || null,
      workstream_id: p.workstream_id,
      owner_id: p.owner_id,
      severity: p.severity,
    },
    await getActor(),
  );
  refresh();
}

// ---- workstreams -----------------------------------------------------------

export async function updateHealthAction(wsId: string, health: string, note: string) {
  z.enum(HEALTH).parse(health);
  await workstreams.updateHealth(wsId, health as (typeof HEALTH)[number], note || null, await getActor());
  refresh();
}

export async function setNextActionAction(wsId: string, nextAction: string) {
  await workstreams.setNextAction(wsId, nextAction || null, await getActor());
  refresh();
}

const createWorkstreamSchema = z.object({
  objective_id: z.string().min(1),
  name: z.string().min(1),
  owner_id: z.string().min(1),
  next_action: z.string().optional(),
  sort_order: z.coerce.number().optional(),
});

export async function createWorkstreamAction(input: z.infer<typeof createWorkstreamSchema>) {
  const p = createWorkstreamSchema.parse(input);
  await workstreams.createWorkstream(
    {
      objective_id: p.objective_id,
      name: p.name,
      owner_id: p.owner_id,
      next_action: p.next_action || null,
      sort_order: p.sort_order,
    },
    await getActor(),
  );
  refresh();
}

// ---- milestones ------------------------------------------------------------

const createMilestoneSchema = z.object({
  workstream_id: z.string().min(1),
  title: z.string().min(1),
  target_value: z.coerce.number().positive(),
  unit: z.string().optional(),
  weight: z.coerce.number().positive().optional(),
  due_date: z.string().optional(),
  board_x: z.number().optional(),
  board_y: z.number().optional(),
});

export async function createMilestoneAction(input: z.infer<typeof createMilestoneSchema>) {
  const p = createMilestoneSchema.parse(input);
  await milestones.createMilestone(
    {
      workstream_id: p.workstream_id,
      title: p.title,
      target_value: p.target_value,
      unit: p.unit || null,
      weight: p.weight,
      due_date: p.due_date || null,
      board_x: p.board_x ?? null,
      board_y: p.board_y ?? null,
    },
    await getActor(),
  );
  refresh();
}

export async function updateMilestoneAction(
  id: string,
  patch: { title?: string; target_value?: number; unit?: string | null; weight?: number; due_date?: string | null },
) {
  await milestones.updateMilestone(id, patch, await getActor());
  refresh();
}

export async function setMilestoneStatusAction(id: string, status: string) {
  await milestones.setMilestoneStatus(id, status, await getActor());
  refresh();
}

// ---- objective -------------------------------------------------------------

const createObjectiveSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  owner_id: z.string().min(1),
  target_date: z.string().optional(),
});

export async function createObjectiveAction(input: z.infer<typeof createObjectiveSchema>) {
  const p = createObjectiveSchema.parse(input);
  const id = await objectives.createObjective(
    {
      title: p.title,
      description: p.description || null,
      owner_id: p.owner_id,
      target_date: p.target_date || null,
    },
    await getActor(),
  );
  refresh();
  return id;
}

export async function updateObjectiveAction(
  id: string,
  patch: { title?: string; description?: string | null; target_date?: string | null; status?: string },
) {
  await objectives.updateObjective(id, patch, await getActor());
  refresh();
}

export async function setFocusAction(objectiveId: string) {
  await objectives.setFocus(objectiveId, await getActor());
  refresh();
}

export async function setConfidenceAction(objectiveId: string, confidence: string, note: string) {
  z.enum(CONFIDENCE).parse(confidence);
  await objectives.setConfidence(
    objectiveId,
    confidence as (typeof CONFIDENCE)[number],
    note,
    await getActor(),
  );
  refresh();
}


// ---- 積み木ボード (期間 / ブロック / サブタスク) ---------------------------
/*
 * 画面の語彙 → DB: 期間=objective / ブロック=milestone / サブタスク=task。
 * ここも「検証 → サービス呼び出し → revalidate」の3行に保つ。
 */

const periodSchema = z.object({
  title: z.string().min(1),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
});

export async function createPeriodAction(input: z.infer<typeof periodSchema>) {
  const p = periodSchema.parse(input);
  const actor = await getActor();
  const { createPeriod } = await import("@/lib/services/periods");
  const id = await createPeriod(
    {
      title: p.title,
      start_date: p.start_date || null,
      end_date: p.end_date || null,
      owner_id: actor.id ?? "",
    },
    actor,
  );
  refresh();
  return id;
}

export async function updatePeriodAction(id: string, patch: z.infer<typeof periodSchema>) {
  const p = periodSchema.parse(patch);
  await objectives.updateObjective(
    id,
    { title: p.title, start_date: p.start_date || null, target_date: p.end_date || null },
    await getActor(),
  );
  refresh();
}

export async function deletePeriodAction(id: string) {
  const { deletePeriod } = await import("@/lib/services/periods");
  await deletePeriod(id, await getActor());
  refresh();
}

const blockSchema = z.object({
  period_id: z.string().min(1),
  title: z.string().min(1),
  x: z.number(),
  y: z.number(),
  owner_id: z.string().optional(),
  due_date: z.string().optional(),
});

export async function createBlockAction(input: z.infer<typeof blockSchema>) {
  const p = blockSchema.parse(input);
  const actor = await getActor();
  const { ensureDefaultWorkstream } = await import("@/lib/services/periods");
  const workstreamId = await ensureDefaultWorkstream(p.period_id, actor.id ?? "");
  const id = await milestones.createMilestone(
    {
      workstream_id: workstreamId,
      title: p.title,
      target_value: 1, // 積み木は「できた / まだ」の2値
      owner_id: p.owner_id || actor.id || null,
      due_date: p.due_date || null,
      board_x: p.x,
      board_y: p.y,
    },
    actor,
  );
  refresh();
  return id;
}

export async function updateBlockAction(
  id: string,
  patch: { title?: string; due_date?: string | null; owner_id?: string | null; important?: boolean },
) {
  await milestones.updateMilestone(id, patch, await getActor());
  refresh();
}

/** ドラッグ終了時だけ呼ぶ。revalidate しない(掴んでいる最中に作り直さないため)。 */
export async function moveBlockAction(id: string, x: number, y: number) {
  const { moveMilestoneOnBoard } = await import("@/lib/services/board");
  await moveMilestoneOnBoard(id, x, y);
}

/**
 * 積み木の積み替え(くっつける・外す・横に割り込む)。
 * どの行をどう書き換えるかは UI 側が計算済みなので、ここは流すだけ。
 */
const blockMoveSchema = z.array(
  z.object({
    id: z.string().min(1),
    parent_id: z.string().nullable(),
    sort_order: z.number(),
    x: z.number().nullable(),
    y: z.number().nullable(),
  }),
);

export async function stackBlocksAction(moves: z.infer<typeof blockMoveSchema>) {
  const { moveBlocks } = await import("@/lib/services/periods");
  await moveBlocks(blockMoveSchema.parse(moves));
  refresh();
}

/** ブロックの「できた」トグル。target=1 なので 1↔0 で状態が導出される。 */
export async function toggleBlockDoneAction(id: string, done: boolean) {
  const { updateMilestoneProgress } = await import("@/lib/services/milestones");
  const { getDb, schema: s } = await import("@/lib/db");
  const row = (await getDb().select().from(s.milestones)).find((m) => m.id === id);
  if (!row) throw new Error(`block not found: ${id}`);
  await updateMilestoneProgress(id, done ? row.targetValue : 0, await getActor(), {
    skip_update_row: true,
  });
  refresh();
}

/** 「これに取り組む」の旗。誰の旗かは呼び出し側が渡す(既定はいまの操作メンバー)。 */
export async function setWorkingOnBlockAction(
  blockId: string,
  working: boolean,
  memberId?: string,
) {
  const actor = await getActor();
  const who = memberId || actor.id;
  if (!who) throw new Error("no member selected");
  const { setWorkingOnBlock } = await import("@/lib/services/periods");
  await setWorkingOnBlock(blockId, who, working, actor);
  refresh();
}

/** 積み木の複製(サブタスクごと)。座標は呼び出し側が決める。 */
const duplicateSchema = z.array(
  z.object({ id: z.string().min(1), x: z.number(), y: z.number() }),
);

export async function duplicateBlocksAction(items: z.infer<typeof duplicateSchema>) {
  const { duplicateBlocks } = await import("@/lib/services/periods");
  const ids = await duplicateBlocks(duplicateSchema.parse(items), await getActor());
  refresh();
  return ids;
}

/*
 * ---- まとめて操作するときの口 ----------------------------------------------
 *
 * 複数選んで「できた」を押したとき、1個ずつ actions を呼ぶと
 * **選んだ数だけ往復**し、そのたびに画面ぜんぶを作り直すことになる。
 * 外のDB(Neon等)だと、これが数秒の待ちになる。
 * まとめて1回で受けて、画面の作り直しも最後に1回だけにする。
 */
const idsSchema = z.array(z.string().min(1)).min(1).max(200);

export async function setBlocksDoneAction(ids: string[], done: boolean) {
  const list = idsSchema.parse(ids);
  const { updateMilestoneProgress } = await import("@/lib/services/milestones");
  const { getDb, schema: s } = await import("@/lib/db");
  const { inArray } = await import("drizzle-orm");
  const actor = await getActor();
  const rows = await getDb().select().from(s.milestones).where(inArray(s.milestones.id, list));
  for (const row of rows) {
    await updateMilestoneProgress(row.id, done ? row.targetValue : 0, actor, {
      skip_update_row: true,
    });
  }
  refresh();
}

export async function setBlocksImportantAction(ids: string[], important: boolean) {
  const list = idsSchema.parse(ids);
  const actor = await getActor();
  for (const id of list) {
    await milestones.updateMilestone(id, { important }, actor);
  }
  refresh();
}

export async function setBlocksWorkingAction(ids: string[], working: boolean, memberId?: string) {
  const list = idsSchema.parse(ids);
  const actor = await getActor();
  const who = memberId || actor.id;
  if (!who) throw new Error("no member selected");
  const { setWorkingOnBlock } = await import("@/lib/services/periods");
  for (const id of list) {
    await setWorkingOnBlock(id, who, working, actor);
  }
  refresh();
}

/** まとめて片づける / まとめて元に戻す(status を1件ずつ指定できる) */
export async function setBlocksStatusAction(items: { id: string; status: string }[]) {
  const list = z
    .array(z.object({ id: z.string().min(1), status: z.string().min(1) }))
    .min(1)
    .max(200)
    .parse(items);
  const actor = await getActor();
  for (const it of list) {
    await milestones.setMilestoneStatus(it.id, it.status, actor);
  }
  refresh();
}

export async function deleteBlockAction(id: string) {
  await milestones.setMilestoneStatus(id, "dropped", await getActor());
  refresh();
}

/** やり直し用: 片づけた積み木を元の状態に戻す(消す時も同じ口を使う)。 */
export async function setBlockStatusAction(id: string, status: string) {
  await milestones.setMilestoneStatus(id, status, await getActor());
  refresh();
}

export async function addSubtaskAction(blockId: string, title: string, ownerId?: string) {
  const actor = await getActor();
  if (!title.trim()) throw new Error("title required");
  const id = await tasks.createTask(
    { title: title.trim(), owner_id: ownerId || actor.id || "", milestone_id: blockId },
    actor,
  );
  refresh();
  return id;
}

export async function toggleSubtaskAction(taskId: string, done: boolean) {
  await tasks.updateTask(taskId, { status: done ? "done" : "todo" }, await getActor());
  refresh();
}

export async function updateSubtaskAction(
  taskId: string,
  patch: { title?: string; owner_id?: string },
) {
  await tasks.updateTask(taskId, patch, await getActor());
  refresh();
}

export async function deleteSubtaskAction(taskId: string) {
  await tasks.updateTask(taskId, { status: "dropped" }, await getActor());
  refresh();
}
