import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getObjective, setConfidence } from "@/lib/services/objectives";
import { CONFIDENCE } from "@/lib/constants";
import type { Actor } from "@/lib/services/activity";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const objective = await getObjective(id);
  if (!objective) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(objective);
}

const patchSchema = z.object({
  confidence: z.enum(CONFIDENCE),
  confidence_note: z.string().min(1, "確信度の変更には一言の理由が必要です"),
});

/** 確信度の更新(理由必須、履歴に残りトレンドになる)。 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const actor: Actor = { type: "agent", id: req.headers.get("x-agent-name") ?? "api" };
  try {
    await setConfidence(id, parsed.data.confidence, parsed.data.confidence_note, actor);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
