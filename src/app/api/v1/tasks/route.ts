import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listTasks, getMyTasks, createTask } from "@/lib/services/tasks";
import { TASK_PRIORITY } from "@/lib/constants";
import type { Actor } from "@/lib/services/activity";

function agentActor(req: NextRequest): Actor {
  return { type: "agent", id: req.headers.get("x-agent-name") ?? "api" };
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const owner = p.get("owner");
  if (owner && p.get("open") === "true") {
    return NextResponse.json({ tasks: await getMyTasks(owner) });
  }
  const tasks = await listTasks({
    owner_id: owner ?? undefined,
    status: p.get("status") ?? undefined,
    workstream_id: p.get("workstream") ?? undefined,
    milestone_id: p.get("milestone") ?? undefined,
  });
  return NextResponse.json({ tasks });
}

const createSchema = z.object({
  title: z.string().min(1),
  owner_id: z.string().min(1),
  workstream_id: z.string().nullish(),
  milestone_id: z.string().nullish(),
  priority: z.enum(TASK_PRIORITY).optional(),
  due_date: z.string().nullish(),
  note: z.string().nullish(),
});

export async function POST(req: NextRequest) {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const id = await createTask(parsed.data, agentActor(req));
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
