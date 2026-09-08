import { desc, eq, and } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { CONFIDENCE, OBJECTIVE_STATUS, type Confidence, type Health } from "@/lib/constants";
import { rollup, worstHealth, daysRemaining, daysSince } from "./progress";
import { logActivity, parseActivityRow, type Actor } from "./activity";
import { memberMap, milestoneToDto, ownerRef, type MilestoneDto, type OwnerRef } from "./dto";

export interface ObjectiveListItem {
  id: string;
  title: string;
  status: string;
  target_date: string | null;
  is_focus: boolean;
}

export interface ConfidenceChange {
  ts: string;
  from: Confidence | null;
  to: Confidence;
  note: string | null;
  actor_id: string | null;
}

export interface ObjectiveDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  owner: OwnerRef;
  start_date: string | null;
  target_date: string | null;
  days_remaining: number | null;
  progress: number;
  health: Health;
  confidence: Confidence;
  confidence_note: string | null;
  confidence_updated_at: string | null;
  confidence_reviewed_days_ago: number | null;
  confidence_trend: "up" | "down" | "flat" | null;
  workstreams: { id: string; name: string; owner: OwnerRef; health: string; progress: number }[];
  milestones: (MilestoneDto & { workstream_name: string })[];
  confidence_history: ConfidenceChange[];
}

const CONF_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export async function confidenceTrend(objectiveId: string): Promise<"up" | "down" | "flat" | null> {
  const rows = await getDb()
    .select()
    .from(schema.activityLog)
    .where(
      and(
        eq(schema.activityLog.entityType, "objective"),
        eq(schema.activityLog.entityId, objectiveId),
        eq(schema.activityLog.action, "confidence_changed"),
      ),
    )
    .orderBy(desc(schema.activityLog.ts))
    .limit(1);
  if (rows.length === 0) return null;
  const detail = parseActivityRow(rows[0]).detail;
  const before = detail?.before as Confidence | undefined;
  const after = detail?.after as Confidence | undefined;
  if (!before || !after) return null;
  const d = CONF_RANK[after] - CONF_RANK[before];
  return d > 0 ? "up" : d < 0 ? "down" : "flat";
}

export async function listObjectives(): Promise<ObjectiveListItem[]> {
  const db = getDb();
  const ws = (await db.select().from(schema.workspace))[0];
  return (await db
    .select()
    .from(schema.objectives)
    .orderBy(desc(schema.objectives.createdAt))
    
    ).map((o) => ({
      id: o.id,
      title: o.title,
      status: o.status,
      target_date: o.targetDate,
      is_focus: ws?.focusObjectiveId === o.id,
    }));
}

export async function getObjective(id: string): Promise<ObjectiveDetail | null> {
  const db = getDb();
  const o = (await db.select().from(schema.objectives).where(eq(schema.objectives.id, id)))[0];
  if (!o) return null;
  const members = await memberMap();
  const wsRows = await db
    .select()
    .from(schema.workstreams)
    .where(eq(schema.workstreams.objectiveId, id))
    .orderBy(schema.workstreams.sortOrder);
  const wsIds = new Set(wsRows.map((w) => w.id));
  const msRows = (await db
    .select()
    .from(schema.milestones)
    .orderBy(schema.milestones.sortOrder)
    
    ).filter((m) => wsIds.has(m.workstreamId));
  const wsNames = new Map(wsRows.map((w) => [w.id, w.name]));

  const history: ConfidenceChange[] = (await db
    .select()
    .from(schema.activityLog)
    .where(
      and(
        eq(schema.activityLog.entityType, "objective"),
        eq(schema.activityLog.entityId, id),
        eq(schema.activityLog.action, "confidence_changed"),
      ),
    )
    .orderBy(desc(schema.activityLog.ts))
    
    ).map((r) => {
      const e = parseActivityRow(r);
      return {
        ts: e.ts,
        from: (e.detail?.before as Confidence) ?? null,
        to: e.detail?.after as Confidence,
        note: e.detail?.note ?? null,
        actor_id: e.actor_id,
      };
    });

  const activeWs = wsRows.filter((w) => w.status === "active");
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    status: o.status,
    owner: ownerRef(o.ownerId, members),
    start_date: o.startDate,
    target_date: o.targetDate,
    days_remaining: daysRemaining(o.targetDate),
    progress: rollup(msRows),
    health: worstHealth(activeWs.map((w) => w.health as Health)),
    confidence: o.confidence as Confidence,
    confidence_note: o.confidenceNote,
    confidence_updated_at: o.confidenceUpdatedAt,
    confidence_reviewed_days_ago: daysSince(o.confidenceUpdatedAt),
    confidence_trend: await confidenceTrend(id),
    workstreams: wsRows.map((w) => ({
      id: w.id,
      name: w.name,
      owner: ownerRef(w.ownerId, members),
      health: w.health,
      progress: rollup(msRows.filter((m) => m.workstreamId === w.id)),
    })),
    milestones: msRows.map((m) => ({
      ...milestoneToDto(m),
      workstream_name: wsNames.get(m.workstreamId) ?? m.workstreamId,
    })),
    confidence_history: history,
  };
}

export async function createObjective(
  input: {
    title: string;
    description?: string | null;
    owner_id: string;
    start_date?: string | null;
    target_date?: string | null;
  },
  actor: Actor,
): Promise<string> {
  const db = getDb();
  const id = newId("obj");
  const now = nowIso();
  await db.insert(schema.objectives)
    .values({
      id,
      title: input.title,
      description: input.description ?? null,
      ownerId: input.owner_id,
      startDate: input.start_date ?? now.slice(0, 10),
      targetDate: input.target_date ?? null,
      status: "active",
      confidence: "medium",
      createdAt: now,
      updatedAt: now,
    });
  await logActivity(actor, "objective", id, "created", { after: input.title });
  // First objective automatically becomes the focus.
  const ws = (await db.select().from(schema.workspace))[0];
  if (ws && !ws.focusObjectiveId) {
    await setFocus(id, actor);
  }
  return id;
}

export async function updateObjective(
  id: string,
  patch: Partial<{
    title: string;
    description: string | null;
    owner_id: string;
    start_date: string | null;
    target_date: string | null;
    status: string;
  }>,
  actor: Actor,
): Promise<void> {
  const db = getDb();
  const before = (await db.select().from(schema.objectives).where(eq(schema.objectives.id, id)))[0];
  if (!before) throw new Error(`objective not found: ${id}`);
  if (patch.status && !(OBJECTIVE_STATUS as readonly string[]).includes(patch.status)) {
    throw new Error(`invalid objective status: ${patch.status}`);
  }
  await db.update(schema.objectives)
    .set({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.owner_id !== undefined && { ownerId: patch.owner_id }),
      ...(patch.start_date !== undefined && { startDate: patch.start_date }),
      ...(patch.target_date !== undefined && { targetDate: patch.target_date }),
      ...(patch.status !== undefined && { status: patch.status }),
      updatedAt: nowIso(),
    })
    .where(eq(schema.objectives.id, id));
  if (patch.status && patch.status !== before.status) {
    await logActivity(actor, "objective", id, "status_changed", {
      field: "status",
      before: before.status,
      after: patch.status,
    });
  }
  if (patch.target_date !== undefined && patch.target_date !== before.targetDate) {
    await logActivity(actor, "objective", id, "target_date_changed", {
      field: "target_date",
      before: before.targetDate,
      after: patch.target_date,
    });
  }
}

/**
 * Confidence is a judgment: every change requires a one-line why, and is logged
 * so the trend (Medium ↓) can be derived. Re-affirming the same value with a
 * note refreshes the review timestamp ("reviewed 2d ago").
 */
export async function setConfidence(
  id: string,
  confidence: Confidence,
  note: string,
  actor: Actor,
): Promise<void> {
  if (!(CONFIDENCE as readonly string[]).includes(confidence)) {
    throw new Error(`invalid confidence: ${confidence}`);
  }
  if (!note.trim()) throw new Error("confidence changes require a one-line reason");
  const db = getDb();
  const before = (await db.select().from(schema.objectives).where(eq(schema.objectives.id, id)))[0];
  if (!before) throw new Error(`objective not found: ${id}`);
  const now = nowIso();
  await db.update(schema.objectives)
    .set({ confidence, confidenceNote: note.trim(), confidenceUpdatedAt: now, updatedAt: now })
    .where(eq(schema.objectives.id, id));
  await logActivity(actor, "objective", id, "confidence_changed", {
    field: "confidence",
    before: before.confidence,
    after: confidence,
    note: note.trim(),
  });
}

export async function setFocus(objectiveId: string, actor: Actor): Promise<void> {
  const db = getDb();
  const o = (await db
    .select()
    .from(schema.objectives)
    .where(eq(schema.objectives.id, objectiveId))
    )[0];
  if (!o) throw new Error(`objective not found: ${objectiveId}`);
  await db.update(schema.workspace)
    .set({ focusObjectiveId: objectiveId })
    .where(eq(schema.workspace.id, "workspace"));
  await logActivity(actor, "workspace", "workspace", "focus_changed", { after: objectiveId });
}
