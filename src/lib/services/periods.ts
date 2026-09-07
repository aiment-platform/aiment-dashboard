import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { logActivity, type Actor } from "./activity";
import { memberMap } from "./dto";
import { isUrgentBlock } from "@/lib/whiteboard";

/**
 * 「期間」ボードのデータ提供 (public/DashBoard_image.png の設計)。
 *
 * 画面の語彙とDBの対応:
 *   期間(ページ1枚)            = objectives 1行   … title と start/target がピルに出る
 *   積み木ブロック              = milestones 1行   … board_x / board_y で自由配置
 *   ブロックの担当者アイコン    = milestones.owner_id (null ならワークストリームのオーナー)
 *   サブタスク                  = tasks (milestone_id で紐付く)
 *
 * workstreams は残すが画面には出さない。ブロック作成時は期間ごとの既定の
 * ワークストリーム1本にぶら下げる (進捗ロールアップの計算式を壊さないため)。
 */

export interface PeriodSubtask {
  id: string;
  title: string;
  done: boolean;
  owner_id: string;
}

/** いま手をつけている人(担当者とは別) */
export interface Worker {
  id: string;
  name: string;
}

export interface PeriodBlock {
  id: string;
  title: string;
  /** 下にある土台。null = 紙に直置き。子の座標は x/y ではなく親から計算する。 */
  parent_id: string | null;
  /** 同じ段での並び順 */
  sort_order: number;
  /** null = まだ盤に置かれていない(呼び出し側が既定位置に並べる) */
  x: number | null;
  y: number | null;
  status: string;
  due_date: string | null;
  /** 手で立てた「重要」の旗 */
  important: boolean;
  /** 実際に桃色で出すか(旗 or 期限 or ブロッカー — 規則は isUrgentBlock) */
  urgent: boolean;
  owner: { id: string; name: string } | null;
  /** いまこの積み木に取り組んでいる人。0人 = まだ誰も手をつけていない。 */
  workers: Worker[];
  subtasks: PeriodSubtask[];
  done_subtasks: number;
  created_at: string;
}

export interface PeriodSummary {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  /** 今日がこの期間の中にあるか */
  is_now: boolean;
  block_count: number;
}

export interface PeriodBoard {
  period: PeriodSummary;
  /** ← → で行き来する並び。UI はこの配列の前後を使う。 */
  siblings: PeriodSummary[];
  blocks: PeriodBlock[];
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ← → の並び: sort_order → start_date → created_at。日付なしは最後。 */
function periodOrder(a: schema.ObjectiveRow, b: schema.ObjectiveRow): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const as = a.startDate ?? "9999-12-31";
  const bs = b.startDate ?? "9999-12-31";
  if (as !== bs) return as < bs ? -1 : 1;
  return a.createdAt < b.createdAt ? -1 : 1;
}

function isNow(o: schema.ObjectiveRow, t: string): boolean {
  const s = o.startDate?.slice(0, 10);
  const e = o.targetDate?.slice(0, 10);
  if (s && t < s) return false;
  if (e && t > e) return false;
  return Boolean(s || e);
}

function summarise(o: schema.ObjectiveRow, blockCount: number, t: string): PeriodSummary {
  return {
    id: o.id,
    title: o.title,
    start_date: o.startDate?.slice(0, 10) ?? null,
    end_date: o.targetDate?.slice(0, 10) ?? null,
    is_now: isNow(o, t),
    block_count: blockCount,
  };
}

/** その期間に属するマイルストーンID集合を引くための ws→obj 索引 */
function workstreamIndex() {
  const rows = getDb().select().from(schema.workstreams).all();
  return new Map(rows.map((w) => [w.id, w]));
}

export async function listPeriods(): Promise<PeriodSummary[]> {
  const db = getDb();
  const t = today();
  const wsIdx = workstreamIndex();
  const counts = new Map<string, number>();
  for (const m of db.select().from(schema.milestones).all()) {
    if (m.status === "dropped") continue;
    const objId = wsIdx.get(m.workstreamId)?.objectiveId;
    if (objId) counts.set(objId, (counts.get(objId) ?? 0) + 1);
  }
  return db
    .select()
    .from(schema.objectives)
    .all()
    .filter((o) => o.status !== "archived")
    .sort(periodOrder)
    .map((o) => summarise(o, counts.get(o.id) ?? 0, t));
}

/** URL に ?p= が無いときに開く期間: 今日を含むもの → フォーカス → 先頭 */
export async function defaultPeriodId(): Promise<string | null> {
  const periods = await listPeriods();
  if (periods.length === 0) return null;
  const now = periods.find((p) => p.is_now);
  if (now) return now.id;
  const ws = getDb().select().from(schema.workspace).get();
  if (ws?.focusObjectiveId && periods.some((p) => p.id === ws.focusObjectiveId)) {
    return ws.focusObjectiveId;
  }
  return periods[0].id;
}

export async function getPeriodBoard(periodId: string): Promise<PeriodBoard | null> {
  const db = getDb();
  const t = today();
  const o = db.select().from(schema.objectives).where(eq(schema.objectives.id, periodId)).get();
  if (!o) return null;

  const members = memberMap();
  const wsRows = db
    .select()
    .from(schema.workstreams)
    .where(eq(schema.workstreams.objectiveId, periodId))
    .all();
  const wsIds = new Set(wsRows.map((w) => w.id));
  const wsOwner = new Map(wsRows.map((w) => [w.id, w.ownerId]));

  const msRows = db
    .select()
    .from(schema.milestones)
    .orderBy(schema.milestones.sortOrder)
    .all()
    .filter((m) => wsIds.has(m.workstreamId) && m.status !== "dropped");

  const allTasks = db.select().from(schema.tasks).all();
  const blockedTaskIds = new Set(
    db
      .select()
      .from(schema.blockers)
      .where(eq(schema.blockers.status, "active"))
      .all()
      .map((b) => b.taskId)
      .filter(Boolean) as string[],
  );
  const workerRows = db
    .select()
    .from(schema.blockWorkers)
    .orderBy(schema.blockWorkers.startedAt)
    .all();

  const blocks: PeriodBlock[] = msRows.map((m) => {
    const subtasks: PeriodSubtask[] = allTasks
      .filter((x) => x.milestoneId === m.id && x.status !== "dropped")
      .sort((a, b) =>
        a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.createdAt.localeCompare(b.createdAt),
      )
      .map((x) => ({
        id: x.id,
        title: x.title,
        done: x.status === "done",
        owner_id: x.ownerId,
      }));
    const due = m.dueDate?.slice(0, 10) ?? null;
    const daysLeft = due ? Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${t}T00:00:00Z`)) / 86_400_000) : null;
    const blocked = allTasks.some((x) => x.milestoneId === m.id && blockedTaskIds.has(x.id));
    const ownerId = m.ownerId ?? wsOwner.get(m.workstreamId) ?? null;
    return {
      id: m.id,
      title: m.title,
      parent_id: m.parentId,
      sort_order: m.sortOrder,
      x: m.boardX,
      y: m.boardY,
      status: m.status,
      due_date: due,
      important: m.important === 1,
      urgent: isUrgentBlock({ status: m.status, important: m.important === 1, blocked, daysLeft }),
      owner: ownerId ? { id: ownerId, name: members.get(ownerId)?.name ?? ownerId } : null,
      workers: workerRows
        .filter((w) => w.milestoneId === m.id)
        .map((w) => ({ id: w.memberId, name: members.get(w.memberId)?.name ?? w.memberId })),
      subtasks,
      done_subtasks: subtasks.filter((s) => s.done).length,
      created_at: m.createdAt,
    };
  });

  const siblings = await listPeriods();
  return {
    period: summarise(o, blocks.length, t),
    siblings,
    blocks,
  };
}

/**
 * ブロックはワークストリームにぶら下がる必要がある。画面には出さないので、
 * 期間ごとに1本だけ「メイン」を用意して使い回す。
 */
export function ensureDefaultWorkstream(periodId: string, ownerId: string): string {
  const db = getDb();
  const existing = db
    .select()
    .from(schema.workstreams)
    .where(eq(schema.workstreams.objectiveId, periodId))
    .all()
    .filter((w) => w.status === "active")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (existing.length > 0) return existing[0].id;
  const id = newId("ws");
  const now = nowIso();
  db.insert(schema.workstreams)
    .values({
      id,
      objectiveId: periodId,
      name: "メイン",
      ownerId,
      status: "active",
      health: "on_track",
      healthUpdatedAt: now,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

export async function createPeriod(
  input: { title: string; start_date: string | null; end_date: string | null; owner_id: string },
  actor: Actor,
): Promise<string> {
  const db = getDb();
  const id = newId("obj");
  const now = nowIso();
  const maxOrder = db
    .select()
    .from(schema.objectives)
    .all()
    .reduce((m, o) => Math.max(m, o.sortOrder), -1);
  db.insert(schema.objectives)
    .values({
      id,
      title: input.title,
      description: null,
      ownerId: input.owner_id,
      startDate: input.start_date,
      targetDate: input.end_date,
      status: "active",
      confidence: "medium",
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  ensureDefaultWorkstream(id, input.owner_id);
  logActivity(actor, "objective", id, "created", { after: input.title });
  return id;
}

export async function deletePeriod(periodId: string, actor: Actor): Promise<void> {
  const db = getDb();
  const o = db.select().from(schema.objectives).where(eq(schema.objectives.id, periodId)).get();
  if (!o) return;
  db.update(schema.objectives)
    .set({ status: "archived", updatedAt: nowIso() })
    .where(eq(schema.objectives.id, periodId))
    .run();
  logActivity(actor, "objective", periodId, "status_changed", {
    field: "status",
    before: o.status,
    after: "archived",
  });
}

/** 一覧ページ用: 盤に出ている「やること」を、期間・積み木ごと横断で集める。 */
export interface WorkItem {
  kind: "block" | "subtask";
  id: string;
  title: string;
  done: boolean;
  owner_id: string | null;
  due_date: string | null;
  urgent: boolean;
  period: { id: string; title: string } | null;
  /** サブタスクのとき、どの積み木にぶら下がっているか */
  block_title: string | null;
  /** 積み木のとき、いま手をつけている人 */
  workers: Worker[];
}

export async function listWork(): Promise<WorkItem[]> {
  const db = getDb();
  const t = today();
  const objById = new Map(db.select().from(schema.objectives).all().map((o) => [o.id, o]));
  const wsById = new Map(db.select().from(schema.workstreams).all().map((w) => [w.id, w]));
  const wsOwner = new Map([...wsById.values()].map((w) => [w.id, w.ownerId]));
  const periodOf = (workstreamId: string | null) => {
    const w = workstreamId ? wsById.get(workstreamId) : undefined;
    const o = w ? objById.get(w.objectiveId) : undefined;
    return o && o.status !== "archived" ? { id: o.id, title: o.title } : null;
  };

  const msRows = db
    .select()
    .from(schema.milestones)
    .all()
    .filter((m) => m.status !== "dropped");
  const msById = new Map(msRows.map((m) => [m.id, m]));
  const blockedTaskIds = new Set(
    db
      .select()
      .from(schema.blockers)
      .where(eq(schema.blockers.status, "active"))
      .all()
      .map((b) => b.taskId)
      .filter(Boolean) as string[],
  );
  const allTasks = db.select().from(schema.tasks).all().filter((x) => x.status !== "dropped");
  const members = memberMap();
  const workerRows = db
    .select()
    .from(schema.blockWorkers)
    .orderBy(schema.blockWorkers.startedAt)
    .all();

  const blocks: WorkItem[] = msRows.map((m) => {
    const due = m.dueDate?.slice(0, 10) ?? null;
    const daysLeft = due
      ? Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${t}T00:00:00Z`)) / 86_400_000)
      : null;
    const blocked = allTasks.some((x) => x.milestoneId === m.id && blockedTaskIds.has(x.id));
    return {
      kind: "block",
      id: m.id,
      title: m.title,
      done: m.status === "achieved",
      owner_id: m.ownerId ?? wsOwner.get(m.workstreamId) ?? null,
      due_date: due,
      urgent: isUrgentBlock({ status: m.status, important: m.important === 1, blocked, daysLeft }),
      period: periodOf(m.workstreamId),
      block_title: null,
      workers: workerRows
        .filter((w) => w.milestoneId === m.id)
        .map((w) => ({ id: w.memberId, name: members.get(w.memberId)?.name ?? w.memberId })),
    };
  });

  const subtasks: WorkItem[] = allTasks.map((x) => {
    const m = x.milestoneId ? msById.get(x.milestoneId) : undefined;
    return {
      kind: "subtask",
      id: x.id,
      title: x.title,
      done: x.status === "done",
      owner_id: x.ownerId,
      due_date: x.dueDate?.slice(0, 10) ?? null,
      urgent: blockedTaskIds.has(x.id),
      period: periodOf(m?.workstreamId ?? x.workstreamId),
      block_title: m?.title ?? null,
      workers: [],
    };
  });

  return [...blocks, ...subtasks];
}

/**
 * 積み木の積み替え。UI側(src/lib/stack-layout.ts)が計算した
 * 「書き換える行の一覧」をそのまま流す。並び順も座標もここでは考えない。
 * 盤の配置は会社の状態ではないので activity_log には残さない。
 */
export interface BlockMove {
  id: string;
  parent_id: string | null;
  sort_order: number;
  x: number | null;
  y: number | null;
}

export async function moveBlocks(moves: BlockMove[]): Promise<void> {
  const db = getDb();
  for (const m of moves.slice(0, 200)) {
    db.update(schema.milestones)
      .set({
        parentId: m.parent_id,
        sortOrder: m.sort_order,
        ...(m.x !== null && m.y !== null ? { boardX: m.x, boardY: m.y } : {}),
      })
      .where(eq(schema.milestones.id, m.id))
      .run();
  }
}

/**
 * 「これに取り組む」の旗を立てる/おろす。
 * 担当者(持ち主)とは別で、複数人が同時に立てられる。
 * 誰が何に手をつけたかは会社の状態なので activity_log に残す。
 */
export async function setWorkingOnBlock(
  blockId: string,
  memberId: string,
  working: boolean,
  actor: Actor,
): Promise<void> {
  const db = getDb();
  const existing = db
    .select()
    .from(schema.blockWorkers)
    .where(eq(schema.blockWorkers.milestoneId, blockId))
    .all()
    .find((w) => w.memberId === memberId);

  if (working) {
    if (existing) return;
    db.insert(schema.blockWorkers)
      .values({ id: newId("bw"), milestoneId: blockId, memberId, startedAt: nowIso() })
      .run();
  } else {
    if (!existing) return;
    db.delete(schema.blockWorkers).where(eq(schema.blockWorkers.id, existing.id)).run();
  }
  logActivity(actor, "milestone", blockId, working ? "work_started" : "work_stopped", {
    after: memberId,
  });
}
