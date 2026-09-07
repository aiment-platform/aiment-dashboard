import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateMilestoneProgress, setMilestoneStatus } from "@/lib/services/milestones";
import { MILESTONE_STATUS } from "@/lib/constants";
import type { Actor } from "@/lib/services/activity";

const patchSchema = z.object({
  current_value: z.number().min(0).optional(),
  note: z.string().nullish(),
  status: z.enum(MILESTONE_STATUS).optional(),
});

/** カウンター更新(18→19)と状態変更。エージェントの最重要書き込み経路。 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const actor: Actor = { type: "agent", id: req.headers.get("x-agent-name") ?? "api" };
  try {
    let result: unknown = { ok: true };
    if (parsed.data.current_value !== undefined) {
      result = await updateMilestoneProgress(id, parsed.data.current_value, actor, {
        note: parsed.data.note ?? undefined,
      });
    }
    if (parsed.data.status !== undefined) {
      await setMilestoneStatus(id, parsed.data.status, actor);
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
