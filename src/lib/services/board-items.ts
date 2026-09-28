import { eq, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { BOARD_ITEM_TYPE, type BoardItemType } from "@/lib/constants";
import { logActivity, type Actor } from "./activity";
import { wouldCycle } from "@/lib/board-geometry";

/**
 * 盤の上の「積み木ではないもの」(直線・ペン・セクション) と、依存の矢印。
 *
 * 線は x,y を原点に、点列を相対で持つ。動かすときは x,y を変えるだけでよく、
 * 点列を書きかえずに済む(セクションごと動かすときも同じ)。
 */

export interface BoardItem {
  id: string;
  period_id: string;
  type: BoardItemType;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string | null;
  /** line / pen: 原点(x,y)からの点列 */
  points: [number, number][];
  /** section: 見出し */
  title: string | null;
  created_by: string | null;
  updated_at: string;
}

export interface BlockLink {
  id: string;
  from_id: string;
  to_id: string;
}

interface ItemData {
  points?: [number, number][];
  title?: string | null;
}

function toItem(r: typeof schema.boardItems.$inferSelect): BoardItem {
  let data: ItemData = {};
  try {
    data = JSON.parse(r.data) as ItemData;
  } catch {
    // 壊れたデータは空として扱う(盤全体を落とさない)
  }
  return {
    id: r.id,
    period_id: r.objectiveId,
    type: r.type as BoardItemType,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    color: r.color,
    points: data.points ?? [],
    title: data.title ?? null,
    created_by: r.createdBy,
    updated_at: r.updatedAt,
  };
}

export async function listItems(periodId: string): Promise<BoardItem[]> {
  const rows = await getDb().select().from(schema.boardItems).where(eq(schema.boardItems.objectiveId, periodId));
  // セクションが先(奥)、線があと(手前)
  return rows.map(toItem).sort((a, b) => Number(a.type !== "section") - Number(b.type !== "section") || a.updated_at.localeCompare(b.updated_at));
}

export interface ItemInput {
  id?: string;
  period_id: string;
  type: BoardItemType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  color?: string | null;
  points?: [number, number][];
  title?: string | null;
}

/** 形を作る。id を渡せばその id で作る(画面で先に見せた仮の id をそのまま本物にする) */
export async function createItem(input: ItemInput, actor: Actor): Promise<BoardItem> {
  if (!(BOARD_ITEM_TYPE as readonly string[]).includes(input.type)) throw new Error(`invalid type: ${input.type}`);
  const now = nowIso();
  const row = {
    id: input.id ?? newId("bi"),
    objectiveId: input.period_id,
    type: input.type,
    x: input.x,
    y: input.y,
    w: input.w ?? 0,
    h: input.h ?? 0,
    color: input.color ?? null,
    data: JSON.stringify({ points: input.points, title: input.title } satisfies ItemData),
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(schema.boardItems).values(row);
  await logActivity(actor, "board_item", row.id, "created", { after: input.type });
  return toItem(row);
}

export interface ItemPatch {
  id: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  color?: string | null;
  title?: string | null;
}

/** まとめて動かす・書きかえる(セクションごと動かすとき、中の線も一緒に来る)。書けた時刻を返す */
export async function updateItems(patches: ItemPatch[]): Promise<string> {
  const db = getDb();
  const at = nowIso();
  for (const p of patches.slice(0, 500)) {
    const set: Partial<typeof schema.boardItems.$inferInsert> = { updatedAt: at };
    if (p.x !== undefined) set.x = p.x;
    if (p.y !== undefined) set.y = p.y;
    if (p.w !== undefined) set.w = p.w;
    if (p.h !== undefined) set.h = p.h;
    if (p.color !== undefined) set.color = p.color;
    if (p.title !== undefined) {
      const before = (await db.select().from(schema.boardItems).where(eq(schema.boardItems.id, p.id)))[0];
      if (!before) continue;
      const data = JSON.parse(before.data || "{}") as ItemData;
      set.data = JSON.stringify({ ...data, title: p.title });
    }
    await db.update(schema.boardItems).set(set).where(eq(schema.boardItems.id, p.id));
  }
  return at;
}

export async function deleteItems(ids: string[], actor: Actor): Promise<void> {
  if (ids.length === 0) return;
  await getDb().delete(schema.boardItems).where(inArray(schema.boardItems.id, ids));
  for (const id of ids) await logActivity(actor, "board_item", id, "deleted");
}

// ---- 依存の矢印 ------------------------------------------------------------------

/** その積み木たちに触れている矢印(出ていく・入ってくる、どちらも) */
export async function listLinks(blockIds: string[]): Promise<BlockLink[]> {
  if (blockIds.length === 0) return [];
  const rows = await getDb()
    .select()
    .from(schema.blockLinks)
    .where(or(inArray(schema.blockLinks.fromId, blockIds), inArray(schema.blockLinks.toId, blockIds)));
  return rows.map((r) => ({ id: r.id, from_id: r.fromId, to_id: r.toId }));
}

/**
 * 矢印を引く。同じ向きの矢印が既にあれば、それを返す(二重に引かない。created=false)。
 * 輪になる矢印は断る(どちらも「相手が先」になり、永遠に始められない)。
 */
export async function createLink(
  fromId: string,
  toId: string,
  actor: Actor,
  id?: string,
): Promise<BlockLink & { created: boolean }> {
  if (fromId === toId) throw new Error("自分自身にはつなげません");
  const db = getDb();
  const all = (await db.select().from(schema.blockLinks)).map((r) => ({ from_id: r.fromId, to_id: r.toId, id: r.id }));
  const dup = all.find((l) => l.from_id === fromId && l.to_id === toId);
  if (dup) return { ...dup, created: false };
  if (wouldCycle(all, fromId, toId)) {
    throw new Error("輪になるのでつなげません(この矢印を足すと、お互いが「相手が先」になります)");
  }
  const row = { id: id ?? newId("lk"), fromId, toId, createdAt: nowIso() };
  await db.insert(schema.blockLinks).values(row);
  await logActivity(actor, "milestone", toId, "link_added", { after: fromId });
  return { id: row.id, from_id: fromId, to_id: toId, created: true };
}

export async function deleteLink(id: string, actor: Actor): Promise<void> {
  const db = getDb();
  const before = (await db.select().from(schema.blockLinks).where(eq(schema.blockLinks.id, id)))[0];
  if (!before) return;
  await db.delete(schema.blockLinks).where(eq(schema.blockLinks.id, id));
  await logActivity(actor, "milestone", before.toId, "link_removed", { before: before.fromId });
}
