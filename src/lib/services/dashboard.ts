import { desc, gte, and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Confidence, Health } from "@/lib/constants";
import { rollup, worstHealth, daysRemaining, daysSince } from "./progress";
import { parseActivityRow } from "./activity";
import { memberMap, milestoneToDto, ownerRef, type MilestoneDto, type OwnerRef } from "./dto";
import { listWorkstreams, type WorkstreamDto } from "./workstreams";
import { getBlockers, type BlockerDto } from "./blockers";
import { getRecentUpdates, type UpdateDto } from "./updates";
import { confidenceTrend } from "./objectives";

/**
 * getDashboardSummary() IS the dashboard: the RSC page renders this object and
 * GET /api/v1/summary returns it verbatim. One call answers "aiment今どんな感じ?".
 */

export interface FocusDto {
  id: string;
  title: string;
  description: string | null;
  status: string;
  owner: OwnerRef;
  /** Derived from milestone evidence only — never stored, never hand-edited. */
  progress: number;
  confidence: Confidence;
  confidence_note: string | null;
  confidence_reviewed_days_ago: number | null;
  confidence_trend: "up" | "down" | "flat" | null;
  /** Worst health among active workstreams (computed). */
  health: Health;
  health_note: string | null;
  start_date: string | null;
  target_date: string | null;
  days_remaining: number | null;
  /** All non-dropped milestones — the evidence strip. Fractions are the primary display. */
  milestones: (MilestoneDto & { workstream_name: string })[];
}

export interface WeekDelta {
  /** Net counter movement per milestone over the last 7 days. */
  evidence_moves: { milestone_id: string; title: string; unit: string | null; delta: number }[];
  updates_count: number;
  new_blockers: number;
  resolved_blockers: number;
  achieved_milestones: number;
}

export interface DashboardSummary {
  workspace: string;
  as_of: string;
  focus: FocusDto | null;
  workstreams: WorkstreamDto[];
  blockers: BlockerDto[];
  recent_updates: UpdateDto[];
  week_delta: WeekDelta;
  /** Days since the last human signal (update or counter move). null = never. */
  days_since_last_signal: number | null;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const db = getDb();
  const ws = db.select().from(schema.workspace).get();
  const asOf = new Date().toISOString();

  let focus: FocusDto | null = null;
  let workstreams: WorkstreamDto[] = [];

  if (ws?.focusObjectiveId) {
    const o = db
      .select()
      .from(schema.objectives)
      .where(eq(schema.objectives.id, ws.focusObjectiveId))
      .get();
    if (o) {
      const members = memberMap();
      workstreams = (await listWorkstreams(o.id)).filter((w) => w.status === "active");
      const wsIds = new Set(workstreams.map((w) => w.id));
      const wsNameById = new Map(workstreams.map((w) => [w.id, w.name]));
      const msRows = db
        .select()
        .from(schema.milestones)
        .orderBy(schema.milestones.sortOrder)
        .all()
        .filter((m) => wsIds.has(m.workstreamId) && m.status !== "dropped");
      // Order the evidence strip by workstream geography, then milestone order.
      const wsOrder = new Map(workstreams.map((w, i) => [w.id, i]));
      msRows.sort(
        (a, b) =>
          (wsOrder.get(a.workstreamId) ?? 99) - (wsOrder.get(b.workstreamId) ?? 99) ||
          a.sortOrder - b.sortOrder,
      );
      const health = worstHealth(workstreams.map((w) => w.health));
      const worstWs = workstreams.find((w) => w.health === health);
      focus = {
        id: o.id,
        title: o.title,
        description: o.description,
        status: o.status,
        owner: ownerRef(o.ownerId, members),
        progress: rollup(msRows),
        confidence: o.confidence as Confidence,
        confidence_note: o.confidenceNote,
        confidence_reviewed_days_ago: daysSince(o.confidenceUpdatedAt),
        confidence_trend: confidenceTrend(o.id),
        health,
        health_note: health === "on_track" ? null : (worstWs?.health_note ?? null),
        start_date: o.startDate,
        target_date: o.targetDate,
        days_remaining: daysRemaining(o.targetDate),
        milestones: msRows.map((m) => ({
          ...milestoneToDto(m),
          workstream_name: wsNameById.get(m.workstreamId) ?? m.workstreamId,
        })),
      };
    }
  }

  return {
    workspace: ws?.name ?? "aiment",
    as_of: asOf,
    focus,
    workstreams,
    blockers: await getBlockers("active"),
    recent_updates: await getRecentUpdates({ limit: 6 }),
    week_delta: computeWeekDelta(),
    days_since_last_signal: computeDaysSinceLastSignal(),
  };
}

export async function getCurrentFocus(): Promise<Pick<
  FocusDto,
  "id" | "title" | "progress" | "confidence" | "health" | "target_date" | "days_remaining"
> | null> {
  const s = await getDashboardSummary();
  if (!s.focus) return null;
  const { id, title, progress, confidence, health, target_date, days_remaining } = s.focus;
  return { id, title, progress, confidence, health, target_date, days_remaining };
}

function computeWeekDelta(): WeekDelta {
  const db = getDb();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const msMap = new Map(db.select().from(schema.milestones).all().map((m) => [m.id, m]));

  // Counter movement comes from the activity log, so it covers inline bumps,
  // update-carried bumps, and agent writes alike.
  const progressEvents = db
    .select()
    .from(schema.activityLog)
    .where(and(gte(schema.activityLog.ts, since), eq(schema.activityLog.action, "progress_updated")))
    .all()
    .map(parseActivityRow);
  const deltaByMs = new Map<string, number>();
  for (const e of progressEvents) {
    const before = Number(e.detail?.before ?? 0);
    const after = Number(e.detail?.after ?? 0);
    deltaByMs.set(e.entity_id, (deltaByMs.get(e.entity_id) ?? 0) + (after - before));
  }
  const evidenceMoves = [...deltaByMs.entries()]
    .filter(([, d]) => d !== 0)
    .map(([msId, delta]) => {
      const m = msMap.get(msId);
      return {
        milestone_id: msId,
        title: m?.title ?? msId,
        unit: m?.unit ?? null,
        delta,
      };
    });

  const achieved = db
    .select()
    .from(schema.activityLog)
    .where(
      and(gte(schema.activityLog.ts, since), eq(schema.activityLog.action, "milestone_achieved")),
    )
    .all().length;

  const updatesCount = db
    .select()
    .from(schema.updates)
    .where(gte(schema.updates.createdAt, since))
    .all().length;

  const allBlockers = db.select().from(schema.blockers).all();
  return {
    evidence_moves: evidenceMoves,
    updates_count: updatesCount,
    new_blockers: allBlockers.filter((b) => b.createdAt >= since).length,
    resolved_blockers: allBlockers.filter((b) => b.resolvedAt && b.resolvedAt >= since).length,
    achieved_milestones: achieved,
  };
}

/** Silence detector: powers the "this dashboard may be lying" banner. */
function computeDaysSinceLastSignal(): number | null {
  const db = getDb();
  const lastUpdate = db
    .select()
    .from(schema.updates)
    .orderBy(desc(schema.updates.createdAt))
    .limit(1)
    .get();
  const lastProgress = db
    .select()
    .from(schema.activityLog)
    .where(eq(schema.activityLog.action, "progress_updated"))
    .orderBy(desc(schema.activityLog.ts))
    .limit(1)
    .get();
  const candidates = [lastUpdate?.createdAt, lastProgress?.ts].filter(Boolean) as string[];
  if (candidates.length === 0) return null;
  return daysSince(candidates.sort().at(-1));
}
