import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRecentUpdates, addUpdate } from "@/lib/services/updates";
import type { Actor } from "@/lib/services/activity";

function agentActor(req: NextRequest): Actor {
  return { type: "agent", id: req.headers.get("x-agent-name") ?? "api" };
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const updates = await getRecentUpdates({
    limit: Math.min(Number(p.get("limit") ?? 10) || 10, 100),
    workstream_id: p.get("workstream") ?? undefined,
  });
  return NextResponse.json({ updates });
}

const createSchema = z.object({
  workstream_id: z.string().min(1),
  author_id: z.string().min(1),
  what: z.string().min(1),
  result: z.string().nullish(),
  next: z.string().nullish(),
  milestone_id: z.string().nullish(),
  new_value: z.number().min(0).nullish(),
  blocker: z
    .object({
      title: z.string().min(1),
      detail: z.string().nullish(),
      owner_id: z.string().optional(),
    })
    .nullish(),
});

export async function POST(req: NextRequest) {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const id = await addUpdate(parsed.data, agentActor(req));
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
