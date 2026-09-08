import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * 積み木の盤座標。会社の状態ではないので activity_log には残さない
 * (「誰がどこに置いたか」は履歴に値しない)。
 */
export async function moveMilestoneOnBoard(id: string, x: number, y: number): Promise<void> {
  await getDb()
    .update(schema.milestones)
    .set({ boardX: x, boardY: y })
    .where(eq(schema.milestones.id, id));
}
