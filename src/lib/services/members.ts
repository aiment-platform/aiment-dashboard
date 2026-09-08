import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, nowIso } from "@/lib/ids";
import { logActivity, type Actor } from "./activity";

export interface MemberDto {
  id: string;
  name: string;
  role: string | null;
  is_active: boolean;
}

function toDto(row: typeof schema.members.$inferSelect): MemberDto {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    is_active: row.isActive === 1,
  };
}

export async function listMembers(): Promise<MemberDto[]> {
  return (await getDb().select().from(schema.members)).map(toDto);
}

export async function getMember(id: string): Promise<MemberDto | null> {
  const row = (await getDb().select().from(schema.members).where(eq(schema.members.id, id)))[0];
  return row ? toDto(row) : null;
}

export async function createMember(
  input: { name: string; role?: string | null },
  actor: Actor,
): Promise<MemberDto> {
  const row = {
    id: newId("mem"),
    name: input.name,
    role: input.role ?? null,
    isActive: 1,
    createdAt: nowIso(),
  };
  await getDb().insert(schema.members).values(row);
  await logActivity(actor, "member", row.id, "created", { after: input.name });
  return toDto({ ...row, authUserId: null });
}
