import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateHealth, setNextAction } from "@/lib/services/workstreams";
import { HEALTH } from "@/lib/constants";
import type { Actor } from "@/lib/services/activity";

const patchSchema = z.object({
  health: z.enum(HEALTH).optional(),
  health_note: z.string().nullish(),
  next_action: z.string().nullish(),
});

/** ヘルス(判断+理由)と「次の一手」の更新。 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const actor: Actor = { type: "agent", id: req.headers.get("x-agent-name") ?? "api" };
  try {
    if (parsed.data.health !== undefined) {
      await updateHealth(id, parsed.data.health, parsed.data.health_note ?? null, actor);
    }
    if (parsed.data.next_action !== undefined) {
      await setNextAction(id, parsed.data.next_action, actor);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
