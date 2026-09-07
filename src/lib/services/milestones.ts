import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { MILESTONE_STATUS } from "@/lib/constants";
import { logActivity, type Actor } from "./activity";
import { milestoneToDto, type MilestoneDto } from "./dto";

export async function listMilestones(workstreamId?: string): Promise<MilestoneDto[]> {
  const db = getDb();
  const rows = workstreamId
    ? db
        .select()
        .from(schema.milestones)
        .where(eq(schema.milestones.workstreamId, workstreamId))
        .orderBy(schema.milestones.sortOrder)
        .all()
    : db.select().from(schema.milestones).orderBy(schema.milestones.sortOrder).all();
  return rows.map(milestoneToDto);
}

/**
 * Milestones are EVIDENCE STATES ("the outside world responded"), so creating,
 * reweighting or dropping one changes the progress model itself — every such
 * change is logged as `model_changed` so any % jump is explainable later.
 */
export async function createMilestone(
  input: {
    workstream_id: string;
    title: string;
    target_value: number;
    unit?: string | null;
    weight?: number;
    due_date?: string | null;
    sort_order?: number;
    /** 積み木の担当者(null ならワークストリームのオーナー) */
    owner_id?: string | null;
    /** ホワイトボード上で作成された場合の初期座標 */
    board_x?: number | null;
    board_y?: number | null;
  },
  actor: Actor,
): Promise<string> {
  if (input.target_value <= 0) throw new Error("target_value must be > 0");
  const db = getDb();
  const ws = db
    .select()
    .from(schema.workstreams)
    .where(eq(schema.workstreams.id, input.workstream_id))
    .get();
  if (!ws) throw new Error(`workstream not found: ${input.workstream_id}`);
  const id = newId("ms");
  const now = nowIso();
  db.insert(schema.milestones)
    .values({
      id,
      workstreamId: input.workstream_id,
      ownerId: input.owner_id ?? null,
      title: input.title,
      targetValue: input.target_value,
      currentValue: 0,
      unit: input.unit ?? null,
      weight: input.weight ?? 1,
      status: "not_started",
      dueDate: input.due_date ?? null,
      sortOrder: input.sort_order ?? 0,
      boardX: input.board_x ?? null,
      boardY: input.board_y ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  logActivity(actor, "milestone", id, "model_changed", {
    note: `milestone added: ${input.title} (0/${input.target_value}${input.unit ? ` ${input.unit}` : ""})`,
  });
  return id;
}

function derivedStatus(current: number, target: number, existing: string): string {
  if (existing === "dropped") return "dropped";
  if (current >= target) return "achieved";
  if (current > 0) return "in_progress";
  return "not_started";
}

export interface ProgressResult {
  before: number;
  after: number;
  achieved: boolean;
  milestone: MilestoneDto;
}

/**
 * The golden input: bump a counter (18 → 19). ≤5 seconds in the UI.
 * Status is re-derived from the numbers; hitting the target marks it achieved.
 * With a note, a human-readable Update row is written too (the heartbeat feed
 * stays human-authored; bare bumps live in the activity log and the delta line).
 */
export async function updateMilestoneProgress(
  id: string,
  newValue: number,
  actor: Actor,
  opts: { note?: string; author_id?: string; skip_update_row?: boolean } = {},
): Promise<ProgressResult> {
  if (newValue < 0) throw new Error("value must be >= 0");
  const db = getDb();
  const m = db.select().from(schema.milestones).where(eq(schema.milestones.id, id)).get();
  if (!m) throw new Error(`milestone not found: ${id}`);
  const before = m.currentValue;
  const newStatus = derivedStatus(newValue, m.targetValue, m.status);
  const now = nowIso();
  db.update(schema.milestones)
    .set({ currentValue: newValue, status: newStatus, updatedAt: now })
    .where(eq(schema.milestones.id, id))
    .run();
  logActivity(actor, "milestone", id, "progress_updated", {
    field: "current_value",
    before,
    after: newValue,
    note: opts.note,
  });
  const achieved = newStatus === "achieved" && m.status !== "achieved";
  if (achieved) {
    logActivity(actor, "milestone", id, "milestone_achieved", { note: m.title });
  }
  const note = opts.note?.trim();
  if (note && !opts.skip_update_row) {
    db.insert(schema.updates)
      .values({
        id: newId("upd"),
        workstreamId: m.workstreamId,
        authorId: opts.author_id ?? actor.id ?? "system",
        what: note,
        milestoneId: id,
        valueBefore: before,
        valueAfter: newValue,
        createdAt: now,
      })
      .run();
  }
  const updated = { ...m, currentValue: newValue, status: newStatus };
  return { before, after: newValue, achieved, milestone: milestoneToDto(updated) };
}

export async function updateMilestone(
  id: string,
  patch: Partial<{
    title: string;
    target_value: number;
    unit: string | null;
    weight: number;
    due_date: string | null;
    sort_order: number;
    owner_id: string | null;
    important: boolean;
  }>,
  actor: Actor,
): Promise<void> {
  const db = getDb();
  const m = db.select().from(schema.milestones).where(eq(schema.milestones.id, id)).get();
  if (!m) throw new Error(`milestone not found: ${id}`);
  if (patch.target_value !== undefined && patch.target_value <= 0) {
    throw new Error("target_value must be > 0");
  }
  const newTarget = patch.target_value ?? m.targetValue;
  db.update(schema.milestones)
    .set({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.target_value !== undefined && {
        targetValue: patch.target_value,
        status: derivedStatus(m.currentValue, newTarget, m.status),
      }),
      ...(patch.unit !== undefined && { unit: patch.unit }),
      ...(patch.weight !== undefined && { weight: patch.weight }),
      ...(patch.due_date !== undefined && { dueDate: patch.due_date }),
      ...(patch.sort_order !== undefined && { sortOrder: patch.sort_order }),
      ...(patch.owner_id !== undefined && { ownerId: patch.owner_id }),
      ...(patch.important !== undefined && { important: patch.important ? 1 : 0 }),
      updatedAt: nowIso(),
    })
    .where(eq(schema.milestones.id, id))
    .run();
  if (patch.target_value !== undefined && patch.target_value !== m.targetValue) {
    logActivity(actor, "milestone", id, "model_changed", {
      field: "target_value",
      before: m.targetValue,
      after: patch.target_value,
    });
  }
  if (patch.weight !== undefined && patch.weight !== m.weight) {
    logActivity(actor, "milestone", id, "model_changed", {
      field: "weight",
      before: m.weight,
      after: patch.weight,
    });
  }
}

export async function setMilestoneStatus(id: string, status: string, actor: Actor): Promise<void> {
  if (!(MILESTONE_STATUS as readonly string[]).includes(status)) {
    throw new Error(`invalid milestone status: ${status}`);
  }
  const db = getDb();
  const m = db.select().from(schema.milestones).where(eq(schema.milestones.id, id)).get();
  if (!m) throw new Error(`milestone not found: ${id}`);
  db.update(schema.milestones)
    .set({ status, updatedAt: nowIso() })
    .where(eq(schema.milestones.id, id))
    .run();
  const action = status === "dropped" ? "model_changed" : "status_changed";
  logActivity(actor, "milestone", id, action, {
    field: "status",
    before: m.status,
    after: status,
    ...(status === "dropped" && { note: `milestone dropped: ${m.title}` }),
  });
}
