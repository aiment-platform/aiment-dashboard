import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { HEALTH, type Health } from "@/lib/constants";
import { rollup, daysSince, isStale } from "./progress";
import { logActivity, type Actor } from "./activity";
import { memberMap, milestoneToDto, ownerRef, type MilestoneDto, type OwnerRef } from "./dto";
import { listTasks, type TaskDto } from "./tasks";
import { getRecentUpdates, type UpdateDto } from "./updates";
import { getBlockers, type BlockerDto } from "./blockers";

export interface WorkstreamDto {
  id: string;
  objective_id: string;
  name: string;
  owner: OwnerRef;
  status: string;
  health: Health;
  health_note: string | null;
  health_updated_at: string;
  health_days_ago: number | null;
  /** Judgments decay: >7 days old renders as ◌ Stale ("was On Track · 9d"). */
  health_stale: boolean;
  next_action: string | null;
  progress: number;
  /** First non-achieved, non-dropped milestone by sort order. */
  current_milestone: MilestoneDto | null;
  achieved_milestones: number;
  total_milestones: number;
  all_achieved: boolean;
  active_blockers: number;
  sort_order: number;
}

function composeWorkstream(
  w: typeof schema.workstreams.$inferSelect,
  milestones: (typeof schema.milestones.$inferSelect)[],
  activeBlockerCount: number,
  members: Awaited<ReturnType<typeof memberMap>>,
): WorkstreamDto {
  const own = milestones
    .filter((m) => m.workstreamId === w.id && m.status !== "dropped")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const current = own.find((m) => m.status !== "achieved") ?? null;
  const achieved = own.filter((m) => m.status === "achieved").length;
  return {
    id: w.id,
    objective_id: w.objectiveId,
    name: w.name,
    owner: ownerRef(w.ownerId, members),
    status: w.status,
    health: w.health as Health,
    health_note: w.healthNote,
    health_updated_at: w.healthUpdatedAt,
    health_days_ago: daysSince(w.healthUpdatedAt),
    health_stale: isStale(w.healthUpdatedAt),
    next_action: w.nextAction,
    progress: rollup(own),
    current_milestone: current ? milestoneToDto(current) : null,
    achieved_milestones: achieved,
    total_milestones: own.length,
    all_achieved: own.length > 0 && achieved === own.length,
    active_blockers: activeBlockerCount,
    sort_order: w.sortOrder,
  };
}

export async function listWorkstreams(objectiveId?: string): Promise<WorkstreamDto[]> {
  const db = getDb();
  const members = await memberMap();
  let rows = await db.select().from(schema.workstreams).orderBy(schema.workstreams.sortOrder);
  if (objectiveId) rows = rows.filter((w) => w.objectiveId === objectiveId);
  const milestones = await db.select().from(schema.milestones);
  const blockers = await db
    .select()
    .from(schema.blockers)
    .where(eq(schema.blockers.status, "active"));
  return rows.map((w) =>
    composeWorkstream(
      w,
      milestones,
      blockers.filter((b) => b.workstreamId === w.id).length,
      members,
    ),
  );
}

export interface WorkstreamDetail {
  workstream: WorkstreamDto;
  milestones: MilestoneDto[];
  tasks: TaskDto[];
  updates: UpdateDto[];
  blockers: BlockerDto[];
  resolved_blockers: BlockerDto[];
}

export async function getWorkstreamDetail(id: string): Promise<WorkstreamDetail | null> {
  const db = getDb();
  const w = (await db.select().from(schema.workstreams).where(eq(schema.workstreams.id, id)))[0];
  if (!w) return null;
  const members = await memberMap();
  const milestones = await db
    .select()
    .from(schema.milestones)
    .where(eq(schema.milestones.workstreamId, id))
    .orderBy(schema.milestones.sortOrder);
  const active = (await getBlockers("active")).filter((b) => b.workstream.id === id);
  const resolved = (await getBlockers("resolved")).filter((b) => b.workstream.id === id).slice(0, 5);
  return {
    workstream: composeWorkstream(
      w,
      milestones,
      active.length,
      members,
    ),
    milestones: milestones.map(milestoneToDto),
    tasks: await listTasks({ workstream_id: id }),
    updates: await getRecentUpdates({ workstream_id: id, limit: 20 }),
    blockers: active,
    resolved_blockers: resolved,
  };
}

export async function createWorkstream(
  input: {
    objective_id: string;
    name: string;
    owner_id: string;
    next_action?: string | null;
    sort_order?: number;
  },
  actor: Actor,
): Promise<string> {
  const db = getDb();
  const id = newId("ws");
  const now = nowIso();
  await db.insert(schema.workstreams)
    .values({
      id,
      objectiveId: input.objective_id,
      name: input.name,
      ownerId: input.owner_id,
      status: "active",
      health: "on_track",
      healthUpdatedAt: now,
      nextAction: input.next_action ?? null,
      sortOrder: input.sort_order ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  await logActivity(actor, "workstream", id, "created", { after: input.name });
  return id;
}

export async function updateWorkstream(
  id: string,
  patch: Partial<{ name: string; owner_id: string; status: string; sort_order: number }>,
  actor: Actor,
): Promise<void> {
  const db = getDb();
  const w = (await db.select().from(schema.workstreams).where(eq(schema.workstreams.id, id)))[0];
  if (!w) throw new Error(`workstream not found: ${id}`);
  await db.update(schema.workstreams)
    .set({
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.owner_id !== undefined && { ownerId: patch.owner_id }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.sort_order !== undefined && { sortOrder: patch.sort_order }),
      updatedAt: nowIso(),
    })
    .where(eq(schema.workstreams.id, id));
  if (patch.status && patch.status !== w.status) {
    await logActivity(actor, "workstream", id, "status_changed", {
      field: "status",
      before: w.status,
      after: patch.status,
    });
  }
}

/**
 * Health is a manual human judgment (auto-health lies); leaving on_track
 * requires a one-line why. Re-affirming the same value refreshes the review
 * timestamp — that's what clears the ◌ Stale state.
 */
export async function updateHealth(
  id: string,
  health: Health,
  note: string | null,
  actor: Actor,
): Promise<void> {
  if (!(HEALTH as readonly string[]).includes(health)) {
    throw new Error(`invalid health: ${health}`);
  }
  if (health !== "on_track" && !note?.trim()) {
    throw new Error("at_risk / off_track require a one-line reason");
  }
  const db = getDb();
  const w = (await db.select().from(schema.workstreams).where(eq(schema.workstreams.id, id)))[0];
  if (!w) throw new Error(`workstream not found: ${id}`);
  const now = nowIso();
  await db.update(schema.workstreams)
    .set({ health, healthNote: note?.trim() || null, healthUpdatedAt: now, updatedAt: now })
    .where(eq(schema.workstreams.id, id));
  await logActivity(actor, "workstream", id, health === w.health ? "health_reviewed" : "health_changed", {
    field: "health",
    before: w.health,
    after: health,
    note: note?.trim() || undefined,
  });
}

/** One manually-curated line: what should happen next in this workstream. */
export async function setNextAction(id: string, nextAction: string | null, actor: Actor): Promise<void> {
  const db = getDb();
  const w = (await db.select().from(schema.workstreams).where(eq(schema.workstreams.id, id)))[0];
  if (!w) throw new Error(`workstream not found: ${id}`);
  await db.update(schema.workstreams)
    .set({ nextAction: nextAction?.trim() || null, updatedAt: nowIso() })
    .where(eq(schema.workstreams.id, id));
  await logActivity(actor, "workstream", id, "next_action_changed", {
    field: "next_action",
    before: w.nextAction,
    after: nextAction,
  });
}
