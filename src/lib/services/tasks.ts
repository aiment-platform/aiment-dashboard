import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { TASK_PRIORITY, TASK_STATUS } from "@/lib/constants";
import { milestoneProgress } from "./progress";
import { logActivity, type Actor } from "./activity";
import { memberMap, ownerRef, type OwnerRef } from "./dto";

export interface TaskDto {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  overdue: boolean;
  note: string | null;
  owner: OwnerRef;
  /** null = Inbox (unassigned to any workstream) */
  workstream: { id: string; name: string; health: string } | null;
  /** The "why am I doing this" link: which evidence state this task feeds. */
  milestone: {
    id: string;
    title: string;
    current_value: number;
    target_value: number;
    unit: string | null;
    progress: number;
  } | null;
  blocked_by: string[];
  created_at: string;
  completed_at: string | null;
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === "done" || status === "dropped") return false;
  return dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

async function composeTasks(rows: (typeof schema.tasks.$inferSelect)[]): Promise<TaskDto[]> {
  const db = getDb();
  const members = await memberMap();
  const wsMap = new Map((await db.select().from(schema.workstreams)).map((w) => [w.id, w]));
  const msMap = new Map((await db.select().from(schema.milestones)).map((m) => [m.id, m]));
  const activeBlockers = await db
    .select()
    .from(schema.blockers)
    .where(eq(schema.blockers.status, "active"));
  return rows.map((t) => {
    const ws = t.workstreamId ? wsMap.get(t.workstreamId) : undefined;
    const ms = t.milestoneId ? msMap.get(t.milestoneId) : undefined;
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      due_date: t.dueDate,
      overdue: isOverdue(t.dueDate, t.status),
      note: t.note,
      owner: ownerRef(t.ownerId, members),
      workstream: ws ? { id: ws.id, name: ws.name, health: ws.health } : null,
      milestone: ms
        ? {
            id: ms.id,
            title: ms.title,
            current_value: ms.currentValue,
            target_value: ms.targetValue,
            unit: ms.unit,
            progress: milestoneProgress(ms),
          }
        : null,
      blocked_by: activeBlockers.filter((b) => b.taskId === t.id).map((b) => b.id),
      created_at: t.createdAt,
      completed_at: t.completedAt,
    };
  });
}

const PRIORITY_RANK: Record<string, number> = { p0: 0, p1: 1, p2: 2 };

/** p0 → overdue → nearest due date → priority → newest. The order an agent would compute anyway. */
export function taskOrder(a: TaskDto, b: TaskDto): number {
  const aP0 = a.priority === "p0" ? 0 : 1;
  const bP0 = b.priority === "p0" ? 0 : 1;
  if (aP0 !== bP0) return aP0 - bP0;
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  const aDue = a.due_date ?? "9999";
  const bDue = b.due_date ?? "9999";
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  if (pr !== 0) return pr;
  return a.created_at < b.created_at ? 1 : -1;
}

export async function listTasks(
  filter: { owner_id?: string; status?: string; workstream_id?: string; milestone_id?: string } = {},
): Promise<TaskDto[]> {
  const db = getDb();
  let rows = await db.select().from(schema.tasks);
  if (filter.owner_id) rows = rows.filter((t) => t.ownerId === filter.owner_id);
  if (filter.status) rows = rows.filter((t) => t.status === filter.status);
  if (filter.workstream_id) rows = rows.filter((t) => t.workstreamId === filter.workstream_id);
  if (filter.milestone_id) rows = rows.filter((t) => t.milestoneId === filter.milestone_id);
  return (await composeTasks(rows)).sort(taskOrder);
}

/** Open tasks for one member, pre-sorted; the dashboard shows the top 3. */
export async function getMyTasks(memberId: string): Promise<TaskDto[]> {
  const db = getDb();
  const rows = (await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.ownerId, memberId))
    
    ).filter((t) => t.status === "todo" || t.status === "in_progress");
  return (await composeTasks(rows)).sort(taskOrder);
}

export async function createTask(
  input: {
    title: string;
    owner_id: string;
    workstream_id?: string | null;
    milestone_id?: string | null;
    priority?: string;
    due_date?: string | null;
    note?: string | null;
  },
  actor: Actor,
): Promise<string> {
  if (input.priority && !(TASK_PRIORITY as readonly string[]).includes(input.priority)) {
    throw new Error(`invalid priority: ${input.priority}`);
  }
  const db = getDb();
  let workstreamId = input.workstream_id ?? null;
  // Workstream is inferred from the milestone — one less field to fill.
  if (!workstreamId && input.milestone_id) {
    const ms = (await db
      .select()
      .from(schema.milestones)
      .where(eq(schema.milestones.id, input.milestone_id))
      )[0];
    workstreamId = ms?.workstreamId ?? null;
  }
  const id = newId("task");
  const now = nowIso();
  await db.insert(schema.tasks)
    .values({
      id,
      title: input.title,
      workstreamId,
      milestoneId: input.milestone_id ?? null,
      ownerId: input.owner_id,
      status: "todo",
      priority: input.priority ?? "p1",
      dueDate: input.due_date ?? null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    });
  await logActivity(actor, "task", id, "created", { after: input.title });
  return id;
}

export async function updateTask(
  id: string,
  patch: Partial<{
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    owner_id: string;
    workstream_id: string | null;
    milestone_id: string | null;
    note: string | null;
    sort_order: number;
  }>,
  actor: Actor,
): Promise<void> {
  if (patch.status && !(TASK_STATUS as readonly string[]).includes(patch.status)) {
    throw new Error(`invalid task status: ${patch.status}`);
  }
  if (patch.priority && !(TASK_PRIORITY as readonly string[]).includes(patch.priority)) {
    throw new Error(`invalid priority: ${patch.priority}`);
  }
  const db = getDb();
  const t = (await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)))[0];
  if (!t) throw new Error(`task not found: ${id}`);
  const now = nowIso();
  await db.update(schema.tasks)
    .set({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.status !== undefined && {
        status: patch.status,
        completedAt: patch.status === "done" ? now : null,
      }),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(patch.due_date !== undefined && { dueDate: patch.due_date }),
      ...(patch.owner_id !== undefined && { ownerId: patch.owner_id }),
      ...(patch.workstream_id !== undefined && { workstreamId: patch.workstream_id }),
      ...(patch.milestone_id !== undefined && { milestoneId: patch.milestone_id }),
      ...(patch.note !== undefined && { note: patch.note }),
      ...(patch.sort_order !== undefined && { sortOrder: patch.sort_order }),
      updatedAt: now,
    })
    .where(eq(schema.tasks.id, id));
  if (patch.status && patch.status !== t.status) {
    await logActivity(actor, "task", id, "status_changed", {
      field: "status",
      before: t.status,
      after: patch.status,
    });
  }
}
