import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { BLOCKER_SEVERITY } from "@/lib/constants";
import { daysSince } from "./progress";
import { logActivity, type Actor } from "./activity";
import { memberMap, ownerRef, type OwnerRef } from "./dto";

export interface BlockerDto {
  id: string;
  title: string;
  /** What would unblock this — phrased as an ask. */
  detail: string | null;
  severity: string;
  status: string;
  /** Age is the point: an old blocker is the most expensive object in the company. */
  age_days: number;
  workstream: { id: string; name: string };
  task_id: string | null;
  owner: OwnerRef;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

function toDto(
  b: typeof schema.blockers.$inferSelect,
  wsNames: Map<string, string>,
  members: Awaited<ReturnType<typeof memberMap>>,
): BlockerDto {
  return {
    id: b.id,
    title: b.title,
    detail: b.detail,
    severity: b.severity,
    status: b.status,
    age_days: daysSince(b.createdAt) ?? 0,
    workstream: { id: b.workstreamId, name: wsNames.get(b.workstreamId) ?? b.workstreamId },
    task_id: b.taskId,
    owner: ownerRef(b.ownerId, members),
    resolution: b.resolution,
    created_at: b.createdAt,
    resolved_at: b.resolvedAt,
  };
}

/** Active blockers sorted oldest-first — age is the sort key, not severity. */
export async function getBlockers(status: "active" | "resolved" = "active"): Promise<BlockerDto[]> {
  const db = getDb();
  const members = await memberMap();
  const wsNames = new Map(
    (await db.select().from(schema.workstreams)).map((w) => [w.id, w.name] as const),
  );
  const rows = await db.select().from(schema.blockers).where(eq(schema.blockers.status, status));
  return rows
    .map((b) => toDto(b, wsNames, members))
    .sort((a, b) =>
      status === "active"
        ? a.created_at < b.created_at
          ? -1
          : 1
        : a.resolved_at && b.resolved_at && a.resolved_at > b.resolved_at
          ? -1
          : 1,
    );
}

export async function createBlocker(
  input: {
    title: string;
    detail?: string | null;
    workstream_id: string;
    task_id?: string | null;
    owner_id: string;
    severity?: string;
  },
  actor: Actor,
): Promise<string> {
  if (input.severity && !(BLOCKER_SEVERITY as readonly string[]).includes(input.severity)) {
    throw new Error(`invalid severity: ${input.severity}`);
  }
  const db = getDb();
  const ws = (
    await db.select().from(schema.workstreams).where(eq(schema.workstreams.id, input.workstream_id))
  )[0];
  if (!ws) throw new Error(`workstream not found: ${input.workstream_id}`);
  const id = newId("blk");
  await db.insert(schema.blockers)
    .values({
      id,
      title: input.title,
      detail: input.detail ?? null,
      workstreamId: input.workstream_id,
      taskId: input.task_id ?? null,
      ownerId: input.owner_id,
      severity: input.severity ?? "high",
      status: "active",
      createdAt: nowIso(),
    });
  await logActivity(actor, "blocker", id, "created", { after: input.title });
  return id;
}

/** Resolving requires saying how — resolved blockers double as a learning log. */
export async function resolveBlocker(id: string, resolution: string, actor: Actor): Promise<void> {
  if (!resolution.trim()) throw new Error("resolution is required — how was it unblocked?");
  const db = getDb();
  const b = (await db.select().from(schema.blockers).where(eq(schema.blockers.id, id)))[0];
  if (!b) throw new Error(`blocker not found: ${id}`);
  await db.update(schema.blockers)
    .set({ status: "resolved", resolution: resolution.trim(), resolvedAt: nowIso() })
    .where(eq(schema.blockers.id, id));
  await logActivity(actor, "blocker", id, "resolved", { note: resolution.trim() });
}
