import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { logActivity, type Actor } from "./activity";
import { memberMap, ownerRef, type OwnerRef } from "./dto";
import { updateMilestoneProgress } from "./milestones";
import { createBlocker } from "./blockers";

export interface UpdateDto {
  id: string;
  created_at: string;
  author: OwnerRef;
  workstream: { id: string; name: string };
  what: string;
  result: string | null;
  next: string | null;
  /** Provenance when this update moved a milestone counter: 15 → 18. */
  milestone_change: {
    milestone_id: string;
    title: string;
    unit: string | null;
    from: number;
    to: number;
  } | null;
}

async function composeUpdates(rows: (typeof schema.updates.$inferSelect)[]): Promise<UpdateDto[]> {
  const db = getDb();
  const members = await memberMap();
  const wsNames = new Map((await db.select().from(schema.workstreams)).map((w) => [w.id, w.name]));
  const msMap = new Map((await db.select().from(schema.milestones)).map((m) => [m.id, m]));
  return rows.map((u) => {
    const ms = u.milestoneId ? msMap.get(u.milestoneId) : undefined;
    const hasChange =
      ms !== undefined && u.valueBefore !== null && u.valueAfter !== null && u.valueBefore !== u.valueAfter;
    return {
      id: u.id,
      created_at: u.createdAt,
      author: ownerRef(u.authorId, members),
      workstream: { id: u.workstreamId, name: wsNames.get(u.workstreamId) ?? u.workstreamId },
      what: u.what,
      result: u.result,
      next: u.next,
      milestone_change: hasChange
        ? {
            milestone_id: ms.id,
            title: ms.title,
            unit: ms.unit,
            from: u.valueBefore as number,
            to: u.valueAfter as number,
          }
        : null,
    };
  });
}

export async function getRecentUpdates(
  opts: { limit?: number; workstream_id?: string } = {},
): Promise<UpdateDto[]> {
  const db = getDb();
  const limit = opts.limit ?? 10;
  const rows = opts.workstream_id
    ? await db
        .select()
        .from(schema.updates)
        .where(eq(schema.updates.workstreamId, opts.workstream_id))
        .orderBy(desc(schema.updates.createdAt))
        .limit(limit)
        
    : await db.select().from(schema.updates).orderBy(desc(schema.updates.createdAt)).limit(limit);
  return await composeUpdates(rows);
}

export interface AddUpdateInput {
  workstream_id: string;
  author_id: string;
  /** The only required narrative field: "DM'd 5 communities". */
  what: string;
  result?: string | null;
  next?: string | null;
  /** Optional counter bump carried by this update. */
  milestone_id?: string | null;
  new_value?: number | null;
  /** Optional blocker surfaced by this update — becomes a real blockers row. */
  blocker?: { title: string; detail?: string | null; owner_id?: string } | null;
}

/**
 * The 30-second ritual. One required field; everything else optional.
 * A counter bump and a new blocker can ride along in the same capture.
 */
export async function addUpdate(input: AddUpdateInput, actor: Actor): Promise<string> {
  if (!input.what.trim()) throw new Error("'what' is required");
  const db = getDb();
  const ws = (await db
    .select()
    .from(schema.workstreams)
    .where(eq(schema.workstreams.id, input.workstream_id))
    )[0];
  if (!ws) throw new Error(`workstream not found: ${input.workstream_id}`);

  let valueBefore: number | null = null;
  let valueAfter: number | null = null;
  if (input.milestone_id && input.new_value !== null && input.new_value !== undefined) {
    const res = await updateMilestoneProgress(input.milestone_id, input.new_value, actor, {
      skip_update_row: true, // this update row IS the narrative; avoid a duplicate
    });
    valueBefore = res.before;
    valueAfter = res.after;
  }

  const id = newId("upd");
  await db.insert(schema.updates)
    .values({
      id,
      workstreamId: input.workstream_id,
      authorId: input.author_id,
      what: input.what.trim(),
      result: input.result?.trim() || null,
      next: input.next?.trim() || null,
      milestoneId: input.milestone_id ?? null,
      valueBefore,
      valueAfter,
      createdAt: nowIso(),
    });
  await logActivity(actor, "update", id, "created", { note: input.what.trim() });

  if (input.blocker?.title?.trim()) {
    await createBlocker(
      {
        title: input.blocker.title,
        detail: input.blocker.detail ?? null,
        workstream_id: input.workstream_id,
        owner_id: input.blocker.owner_id ?? input.author_id,
      },
      actor,
    );
  }
  return id;
}
