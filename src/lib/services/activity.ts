import { getDb, schema } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import type { ActorType } from "@/lib/constants";

/**
 * Every mutation in the system goes through logActivity — this append-only
 * stream is what lets a human or AI agent explain any change ("% jumped
 * because a milestone was added"). Actors can be members, AI agents, or the system.
 */

export interface Actor {
  type: ActorType;
  id: string | null; // member id, or agent name (e.g. "claude"), or null for system
}

export const SYSTEM_ACTOR: Actor = { type: "system", id: null };

export interface ActivityDetail {
  field?: string;
  before?: unknown;
  after?: unknown;
  note?: string;
}

export async function logActivity(
  actor: Actor,
  entityType: string,
  entityId: string,
  action: string,
  detail?: ActivityDetail,
): Promise<void> {
  await getDb()
    .insert(schema.activityLog)
    .values({
      id: newId("act"),
      ts: nowIso(),
      actorType: actor.type,
      actorId: actor.id,
      entityType,
      entityId,
      action,
      detail: detail ? JSON.stringify(detail) : null,
    });
}

export interface ActivityEntry {
  id: string;
  ts: string;
  actor_type: ActorType;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  detail: ActivityDetail | null;
}

export function parseActivityRow(row: typeof schema.activityLog.$inferSelect): ActivityEntry {
  return {
    id: row.id,
    ts: row.ts,
    actor_type: row.actorType as ActorType,
    actor_id: row.actorId,
    entity_type: row.entityType,
    entity_id: row.entityId,
    action: row.action,
    detail: row.detail ? (JSON.parse(row.detail) as ActivityDetail) : null,
  };
}
