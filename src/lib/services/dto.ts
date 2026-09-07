import type { MilestoneRow, MemberRow } from "@/lib/db/schema";
import { getDb, schema } from "@/lib/db";
import { milestoneProgress } from "./progress";

/** Denormalized reference: AI consumers should never need a second lookup for a name. */
export interface OwnerRef {
  id: string;
  name: string;
}

export interface MilestoneDto {
  id: string;
  workstream_id: string;
  title: string;
  current_value: number;
  target_value: number;
  unit: string | null;
  weight: number;
  status: string;
  due_date: string | null;
  /** Derived at read time — never stored. */
  progress: number;
  sort_order: number;
}

export function milestoneToDto(m: MilestoneRow): MilestoneDto {
  return {
    id: m.id,
    workstream_id: m.workstreamId,
    title: m.title,
    current_value: m.currentValue,
    target_value: m.targetValue,
    unit: m.unit,
    weight: m.weight,
    status: m.status,
    due_date: m.dueDate,
    progress: milestoneProgress(m),
    sort_order: m.sortOrder,
  };
}

/** Map of member id → row, fetched once per service call. */
export function memberMap(): Map<string, MemberRow> {
  const rows = getDb().select().from(schema.members).all();
  return new Map(rows.map((r) => [r.id, r]));
}

export function ownerRef(id: string, members: Map<string, MemberRow>): OwnerRef {
  // Falls back to the raw id so agent-authored rows still render.
  return { id, name: members.get(id)?.name ?? id };
}
